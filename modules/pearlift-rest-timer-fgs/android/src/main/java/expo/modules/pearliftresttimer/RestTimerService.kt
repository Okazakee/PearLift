package expo.modules.pearliftresttimer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import androidx.core.app.NotificationCompat

class RestTimerService : Service() {
  companion object {
    const val PREFS_NAME = "rest_timer_service_v1"
    private const val PREF_MODE = "mode"
    private const val PREF_END_AT_ELAPSED_MS = "endAtElapsedMs"
    private const val PREF_REMAINING_SEC = "remainingSec"
    private const val PREF_STARTED_DURATION_SEC = "startedDurationSec"
    private const val PREF_COMPLETED_AT_MS = "completedAtMs"
    private const val PREF_RUNNING_TITLE = "runningTitle"
    private const val PREF_RUNNING_PREFIX = "runningPrefix"
    private const val PREF_PAUSED_PREFIX = "pausedPrefix"
    private const val PREF_COMPLETION_TITLE = "completionTitle"
    private const val PREF_COMPLETION_BODY = "completionBody"
    private const val PREF_PAUSE_ACTION_LABEL = "pauseActionLabel"
    private const val PREF_RESUME_ACTION_LABEL = "resumeActionLabel"
    private const val PREF_STOP_ACTION_LABEL = "stopActionLabel"

    const val MODE_IDLE = "idle"
    const val MODE_RUNNING = "running"
    const val MODE_PAUSED = "paused"

    const val CHANNEL_RUNNING_ID = "rest-timer-running"
    const val CHANNEL_COMPLETE_ID = "rest-timer-v2"

    private const val NOTIF_RUNNING_ID = 42420
    private const val NOTIF_COMPLETE_ID = 42421

    const val ACTION_START = "pearlift.timer.START"
    const val ACTION_PAUSE = "pearlift.timer.PAUSE"
    const val ACTION_RESUME = "pearlift.timer.RESUME"
    const val ACTION_CANCEL = "pearlift.timer.CANCEL"
    const val ACTION_HANDOFF = "pearlift.timer.HANDOFF"

    const val EXTRA_END_AT_ELAPSED_MS = "endAtElapsedMs"
    const val EXTRA_STARTED_DURATION_SEC = "startedDurationSec"
    const val EXTRA_RUNNING_TITLE = "runningTitle"
    const val EXTRA_RUNNING_PREFIX = "runningPrefix"
    const val EXTRA_PAUSED_PREFIX = "pausedPrefix"
    const val EXTRA_COMPLETION_TITLE = "completionTitle"
    const val EXTRA_COMPLETION_BODY = "completionBody"
    const val EXTRA_PAUSE_ACTION_LABEL = "pauseActionLabel"
    const val EXTRA_RESUME_ACTION_LABEL = "resumeActionLabel"
    const val EXTRA_STOP_ACTION_LABEL = "stopActionLabel"
  }

  private val handler = Handler(Looper.getMainLooper())
  private var isTicking = false
  private var wakeLock: PowerManager.WakeLock? = null

  private data class NotificationText(
    val runningTitle: String = "Rest timer",
    val runningPrefix: String = "Remaining",
    val pausedPrefix: String = "Paused",
    val completionTitle: String = "Rest complete",
    val completionBody: String = "Time for your next set.",
    val pauseActionLabel: String = "Pause",
    val resumeActionLabel: String = "Resume",
    val stopActionLabel: String = "Stop",
  )

  private fun prefs(): SharedPreferences =
    getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    ensureNotificationChannels()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START -> {
        val endAtElapsedMs = intent.getLongExtra(EXTRA_END_AT_ELAPSED_MS, 0L)
        val startedDurationSec = intent.getIntExtra(EXTRA_STARTED_DURATION_SEC, 0)
        val notificationText = readNotificationTextFromIntent(intent)

        if (endAtElapsedMs <= 0L) {
          stopSelf()
          return START_NOT_STICKY
        }

        prefs().edit()
          .putString(PREF_MODE, MODE_RUNNING)
          .putLong(PREF_END_AT_ELAPSED_MS, endAtElapsedMs)
          .putInt(PREF_STARTED_DURATION_SEC, startedDurationSec)
          .putLong(PREF_COMPLETED_AT_MS, 0L)
          .putString(PREF_RUNNING_TITLE, notificationText.runningTitle)
          .putString(PREF_RUNNING_PREFIX, notificationText.runningPrefix)
          .putString(PREF_PAUSED_PREFIX, notificationText.pausedPrefix)
          .putString(PREF_COMPLETION_TITLE, notificationText.completionTitle)
          .putString(PREF_COMPLETION_BODY, notificationText.completionBody)
          .putString(PREF_PAUSE_ACTION_LABEL, notificationText.pauseActionLabel)
          .putString(PREF_RESUME_ACTION_LABEL, notificationText.resumeActionLabel)
          .putString(PREF_STOP_ACTION_LABEL, notificationText.stopActionLabel)
          .apply()

        ensureNotificationChannels()
        startForegroundCompat(buildRunningNotification())
        startTicking()
      }

      ACTION_PAUSE -> {
        val state = readState()
        if (state.mode == MODE_RUNNING && state.endAtElapsedMs != null) {
          val remainingSec = computeRemainingSeconds(state.endAtElapsedMs)
          prefs().edit()
            .putString(PREF_MODE, MODE_PAUSED)
            .putLong(PREF_END_AT_ELAPSED_MS, 0L)
            .putInt(PREF_REMAINING_SEC, remainingSec)
            .apply()
          stopTicking()
          startForegroundCompat(buildPausedNotification(remainingSec))
        }
      }

      ACTION_RESUME -> {
        val state = readState()
        if (state.mode == MODE_PAUSED && state.remainingSec > 0) {
          val endAtElapsedMs = SystemClock.elapsedRealtime() + state.remainingSec * 1000L
          val startedDurationSec =
            if (state.startedDurationSec > 0) state.startedDurationSec else state.remainingSec

          prefs().edit()
            .putString(PREF_MODE, MODE_RUNNING)
            .putLong(PREF_END_AT_ELAPSED_MS, endAtElapsedMs)
            .putInt(PREF_STARTED_DURATION_SEC, startedDurationSec)
            .putLong(PREF_COMPLETED_AT_MS, 0L)
            .apply()

          startForegroundCompat(buildRunningNotification())
          startTicking()
        }
      }

      ACTION_CANCEL -> {
        prefs().edit()
          .putString(PREF_MODE, MODE_IDLE)
          .putLong(PREF_END_AT_ELAPSED_MS, 0L)
          .putInt(PREF_REMAINING_SEC, 0)
          .putInt(PREF_STARTED_DURATION_SEC, 0)
          .putLong(PREF_COMPLETED_AT_MS, 0L)
          .remove(PREF_RUNNING_TITLE)
          .remove(PREF_RUNNING_PREFIX)
          .remove(PREF_PAUSED_PREFIX)
          .remove(PREF_COMPLETION_TITLE)
          .remove(PREF_COMPLETION_BODY)
          .remove(PREF_PAUSE_ACTION_LABEL)
          .remove(PREF_RESUME_ACTION_LABEL)
          .remove(PREF_STOP_ACTION_LABEL)
          .apply()
        stopTicking()
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(NOTIF_COMPLETE_ID)
        stopForegroundCompat(removeNotification = true)
        stopSelf()
      }

      ACTION_HANDOFF -> {
        // App returned to foreground; remove ongoing notification and stop service,
        // but keep stored state for JS reconciliation.
        stopTicking()
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(NOTIF_COMPLETE_ID)
        stopForegroundCompat(removeNotification = true)
        stopSelf()
      }
    }
    return START_STICKY
  }

  override fun onDestroy() {
    stopTicking()
    super.onDestroy()
  }

  private data class State(
    val mode: String,
    val endAtElapsedMs: Long?,
    val remainingSec: Int,
    val startedDurationSec: Int,
  )

  private fun readState(): State {
    val p = prefs()
    val mode = p.getString(PREF_MODE, MODE_IDLE) ?: MODE_IDLE
    val endAtElapsed = p.getLong(PREF_END_AT_ELAPSED_MS, 0L).takeIf { it > 0L }
    val remainingSec = p.getInt(PREF_REMAINING_SEC, 0)
    val startedDurationSec = p.getInt(PREF_STARTED_DURATION_SEC, 0)
    return State(mode, endAtElapsed, remainingSec, startedDurationSec)
  }

  private fun readNotificationTextFromIntent(intent: Intent): NotificationText {
    val fallback = readNotificationText()
    return NotificationText(
      runningTitle = intent.getStringExtra(EXTRA_RUNNING_TITLE) ?: fallback.runningTitle,
      runningPrefix = intent.getStringExtra(EXTRA_RUNNING_PREFIX) ?: fallback.runningPrefix,
      pausedPrefix = intent.getStringExtra(EXTRA_PAUSED_PREFIX) ?: fallback.pausedPrefix,
      completionTitle = intent.getStringExtra(EXTRA_COMPLETION_TITLE) ?: fallback.completionTitle,
      completionBody = intent.getStringExtra(EXTRA_COMPLETION_BODY) ?: fallback.completionBody,
      pauseActionLabel = intent.getStringExtra(EXTRA_PAUSE_ACTION_LABEL) ?: fallback.pauseActionLabel,
      resumeActionLabel = intent.getStringExtra(EXTRA_RESUME_ACTION_LABEL) ?: fallback.resumeActionLabel,
      stopActionLabel = intent.getStringExtra(EXTRA_STOP_ACTION_LABEL) ?: fallback.stopActionLabel,
    )
  }

  private fun readNotificationText(): NotificationText {
    val p = prefs()
    return NotificationText(
      runningTitle = p.getString(PREF_RUNNING_TITLE, null) ?: "Rest timer",
      runningPrefix = p.getString(PREF_RUNNING_PREFIX, null) ?: "Remaining",
      pausedPrefix = p.getString(PREF_PAUSED_PREFIX, null) ?: "Paused",
      completionTitle = p.getString(PREF_COMPLETION_TITLE, null) ?: "Rest complete",
      completionBody = p.getString(PREF_COMPLETION_BODY, null) ?: "Time for your next set.",
      pauseActionLabel = p.getString(PREF_PAUSE_ACTION_LABEL, null) ?: "Pause",
      resumeActionLabel = p.getString(PREF_RESUME_ACTION_LABEL, null) ?: "Resume",
      stopActionLabel = p.getString(PREF_STOP_ACTION_LABEL, null) ?: "Stop",
    )
  }

  private fun startTicking() {
    if (isTicking) return
    isTicking = true
    acquireWakeLock()
    handler.post(object : Runnable {
      override fun run() {
        if (!isTicking) return
        val state = readState()
        val endAtElapsed = state.endAtElapsedMs
        if (state.mode != MODE_RUNNING || endAtElapsed == null) {
          isTicking = false
          releaseWakeLock()
          return
        }

        val remaining = computeRemainingSeconds(endAtElapsed)
        if (remaining <= 0) {
          onComplete()
          return
        }

        updateRunningNotification(remaining)
        handler.postDelayed(this, 1000)
      }
    })
  }

  private fun stopTicking() {
    isTicking = false
    handler.removeCallbacksAndMessages(null)
    releaseWakeLock()
  }

  private fun onComplete() {
    prefs().edit()
      .putString(PREF_MODE, MODE_IDLE)
      .putLong(PREF_END_AT_ELAPSED_MS, 0L)
      .putInt(PREF_REMAINING_SEC, 0)
      .putLong(PREF_COMPLETED_AT_MS, System.currentTimeMillis())
      .apply()

    val notificationText = readNotificationText()
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val completion = NotificationCompat.Builder(this, CHANNEL_COMPLETE_ID)
      .setContentTitle(notificationText.completionTitle)
      .setContentText(notificationText.completionBody)
      .setSmallIcon(
        applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.ic_lock_idle_alarm,
      )
      .setOngoing(true)
      .setAutoCancel(false)
      .setContentIntent(buildLaunchPendingIntent())
      .addAction(
        0,
        notificationText.stopActionLabel,
        PendingIntent.getService(
          this,
          4,
          Intent(this, RestTimerService::class.java).setAction(ACTION_CANCEL),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        ),
      )
      .setDefaults(Notification.DEFAULT_VIBRATE)
      .build()
    nm.notify(NOTIF_COMPLETE_ID, completion)

    stopTicking()
    stopForegroundCompat(removeNotification = true)
    stopSelf()
  }

  private fun ensureNotificationChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val notificationText = readNotificationText()

    val runningChannel = NotificationChannel(
      CHANNEL_RUNNING_ID,
      notificationText.runningTitle,
      NotificationManager.IMPORTANCE_LOW,
    )
    runningChannel.setSound(null, null)
    runningChannel.enableVibration(false)
    runningChannel.enableLights(false)
    runningChannel.setShowBadge(false)
    nm.createNotificationChannel(runningChannel)

    val completionSoundResId = resources.getIdentifier(
      "timer_completion",
      "raw",
      packageName,
    )
    val completionSoundUri = if (completionSoundResId != 0) {
      Uri.parse("android.resource://${packageName}/$completionSoundResId")
    } else {
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
    }
    val completionChannel = NotificationChannel(
      CHANNEL_COMPLETE_ID,
      notificationText.runningTitle,
      NotificationManager.IMPORTANCE_HIGH,
    )
    completionChannel.setSound(
      completionSoundUri,
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build(),
    )
    completionChannel.enableVibration(true)
    completionChannel.setShowBadge(false)
    nm.createNotificationChannel(completionChannel)
  }

  private fun buildLaunchPendingIntent(): PendingIntent? {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: return null
    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(
      this,
      100,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun buildRunningNotification(): Notification {
    val state = readState()
    val notificationText = readNotificationText()
    val remaining = state.endAtElapsedMs?.let { computeRemainingSeconds(it) } ?: 0
    val icon = applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.ic_lock_idle_alarm
    return NotificationCompat.Builder(this, CHANNEL_RUNNING_ID)
      .setContentTitle(notificationText.runningTitle)
      .setContentText("${notificationText.runningPrefix} ${formatSeconds(remaining)}")
      .setSmallIcon(icon)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(buildLaunchPendingIntent())
      .addAction(
        0,
        notificationText.pauseActionLabel,
        PendingIntent.getService(
          this,
          1,
          Intent(this, RestTimerService::class.java).setAction(ACTION_PAUSE),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        ),
      )
      .addAction(
        0,
        notificationText.stopActionLabel,
        PendingIntent.getService(
          this,
          2,
          Intent(this, RestTimerService::class.java).setAction(ACTION_CANCEL),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        ),
      )
      .build()
  }

  private fun buildPausedNotification(remainingSec: Int): Notification {
    val notificationText = readNotificationText()
    val icon = applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.ic_lock_idle_alarm
    return NotificationCompat.Builder(this, CHANNEL_RUNNING_ID)
      .setContentTitle(notificationText.runningTitle)
      .setContentText("${notificationText.pausedPrefix} ${formatSeconds(remainingSec)}")
      .setSmallIcon(icon)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(buildLaunchPendingIntent())
      .addAction(
        0,
        notificationText.resumeActionLabel,
        PendingIntent.getService(
          this,
          3,
          Intent(this, RestTimerService::class.java).setAction(ACTION_RESUME),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        ),
      )
      .addAction(
        0,
        notificationText.stopActionLabel,
        PendingIntent.getService(
          this,
          2,
          Intent(this, RestTimerService::class.java).setAction(ACTION_CANCEL),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        ),
      )
      .build()
  }

  private fun updateRunningNotification(remainingSec: Int) {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val notificationText = readNotificationText()
    val icon = applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.ic_lock_idle_alarm
    val notif = NotificationCompat.Builder(this, CHANNEL_RUNNING_ID)
      .setContentTitle(notificationText.runningTitle)
      .setContentText("${notificationText.runningPrefix} ${formatSeconds(remainingSec)}")
      .setSmallIcon(icon)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(buildLaunchPendingIntent())
      .addAction(
        0,
        notificationText.pauseActionLabel,
        PendingIntent.getService(
          this,
          1,
          Intent(this, RestTimerService::class.java).setAction(ACTION_PAUSE),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        ),
      )
      .addAction(
        0,
        notificationText.stopActionLabel,
        PendingIntent.getService(
          this,
          2,
          Intent(this, RestTimerService::class.java).setAction(ACTION_CANCEL),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        ),
      )
      .build()
    nm.notify(NOTIF_RUNNING_ID, notif)
  }

  private fun startForegroundCompat(notification: Notification) {
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(
        NOTIF_RUNNING_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
      )
    } else {
      startForeground(NOTIF_RUNNING_ID, notification)
    }
  }

  private fun stopForegroundCompat(removeNotification: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(
        if (removeNotification) STOP_FOREGROUND_REMOVE else STOP_FOREGROUND_DETACH,
      )
    } else {
      @Suppress("DEPRECATION")
      stopForeground(removeNotification)
    }
  }

  private fun computeRemainingSeconds(endAtElapsedMs: Long): Int {
    val diffMs = endAtElapsedMs - SystemClock.elapsedRealtime()
    return kotlin.math.max(0, ((diffMs + 999) / 1000).toInt())
  }

  private fun formatSeconds(seconds: Int): String {
    val mins = seconds / 60
    val secs = seconds % 60
    return String.format("%d:%02d", mins, secs)
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "PearLift:RestTimer")
    wakeLock?.setReferenceCounted(false)
    try {
      wakeLock?.acquire(10 * 60 * 1000L)
    } catch (_: Throwable) {
      // ignore
    }
  }

  private fun releaseWakeLock() {
    try {
      if (wakeLock?.isHeld == true) wakeLock?.release()
    } catch (_: Throwable) {
      // ignore
    } finally {
      wakeLock = null
    }
  }
}
