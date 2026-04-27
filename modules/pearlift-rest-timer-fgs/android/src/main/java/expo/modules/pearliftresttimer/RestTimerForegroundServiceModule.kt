package expo.modules.pearliftresttimer

import android.content.Context
import android.content.Intent
import android.os.SystemClock
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class RestTimerForegroundServiceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RestTimerForegroundService")

    AsyncFunction("start") { endAtMs: Double, startedDurationSec: Int, notificationText: Map<String, Any?> ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      val endAtMsLong = endAtMs.toLong()
      val diffMs = endAtMsLong - System.currentTimeMillis()
      if (diffMs <= 0L) {
        return@AsyncFunction
      }
      val endAtElapsedMs = SystemClock.elapsedRealtime() + diffMs
      val intent = Intent(ctx, RestTimerService::class.java).apply {
        action = RestTimerService.ACTION_START
        putExtra(RestTimerService.EXTRA_END_AT_ELAPSED_MS, endAtElapsedMs)
        putExtra(RestTimerService.EXTRA_STARTED_DURATION_SEC, startedDurationSec)
        putExtra(
          RestTimerService.EXTRA_RUNNING_TITLE,
          notificationText["runningTitle"] as? String,
        )
        putExtra(
          RestTimerService.EXTRA_RUNNING_PREFIX,
          notificationText["runningPrefix"] as? String,
        )
        putExtra(
          RestTimerService.EXTRA_PAUSED_PREFIX,
          notificationText["pausedPrefix"] as? String,
        )
        putExtra(
          RestTimerService.EXTRA_COMPLETION_TITLE,
          notificationText["completionTitle"] as? String,
        )
        putExtra(
          RestTimerService.EXTRA_COMPLETION_BODY,
          notificationText["completionBody"] as? String,
        )
        putExtra(
          RestTimerService.EXTRA_PAUSE_ACTION_LABEL,
          notificationText["pauseActionLabel"] as? String,
        )
        putExtra(
          RestTimerService.EXTRA_RESUME_ACTION_LABEL,
          notificationText["resumeActionLabel"] as? String,
        )
        putExtra(
          RestTimerService.EXTRA_STOP_ACTION_LABEL,
          notificationText["stopActionLabel"] as? String,
        )
      }
      ContextCompat.startForegroundService(ctx, intent)
      null
    }

    AsyncFunction("pause") {
      val ctx = appContext.reactContext ?: return@AsyncFunction null
      val intent = Intent(ctx, RestTimerService::class.java).apply {
        action = RestTimerService.ACTION_PAUSE
      }
      ctx.startService(intent)
      null
    }

    // Stop FGS + ongoing notification, but keep stored state for JS reconciliation.
    AsyncFunction("stop") {
      val ctx = appContext.reactContext ?: return@AsyncFunction null
      val intent = Intent(ctx, RestTimerService::class.java).apply {
        action = RestTimerService.ACTION_HANDOFF
      }
      ctx.startService(intent)
      null
    }

    // Cancel/reset timer state in the service.
    AsyncFunction("cancel") {
      val ctx = appContext.reactContext ?: return@AsyncFunction null
      val intent = Intent(ctx, RestTimerService::class.java).apply {
        action = RestTimerService.ACTION_CANCEL
      }
      ctx.startService(intent)
      null
    }

    AsyncFunction("getState") {
      val ctx = appContext.reactContext ?: return@AsyncFunction mapOf("mode" to RestTimerService.MODE_IDLE)
      val p = ctx.getSharedPreferences(RestTimerService.PREFS_NAME, Context.MODE_PRIVATE)
      val mode = p.getString("mode", RestTimerService.MODE_IDLE) ?: RestTimerService.MODE_IDLE
      val endAtElapsedMs = p.getLong("endAtElapsedMs", 0L).takeIf { it > 0L }
      val remainingSec = p.getInt("remainingSec", 0)
      val startedDurationSec = p.getInt("startedDurationSec", 0)
      val completedAtMs = p.getLong("completedAtMs", 0L).takeIf { it > 0L }

      val result = mutableMapOf<String, Any?>(
        "mode" to mode,
        "remainingSec" to remainingSec,
        "startedDurationSec" to startedDurationSec,
      )
      if (endAtElapsedMs != null) {
        val endAtMsValue =
          System.currentTimeMillis() + (endAtElapsedMs - SystemClock.elapsedRealtime())
        result["endAtMs"] = endAtMsValue.toDouble()
      }
      if (completedAtMs != null) {
        result["completedAtMs"] = completedAtMs.toDouble()
      }
      result
    }

    AsyncFunction("clearCompletion") {
      val ctx = appContext.reactContext ?: return@AsyncFunction null
      val p = ctx.getSharedPreferences(RestTimerService.PREFS_NAME, Context.MODE_PRIVATE)
      p.edit().putLong("completedAtMs", 0L).apply()
      null
    }
  }
}
