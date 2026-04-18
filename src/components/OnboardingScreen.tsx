import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SyncMode } from '../storage/types';
import type { ThemeTokens } from '../theme/tokens';
import { withAlpha } from '../theme/tokens';

interface OnboardingScreenProps {
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  blocking: boolean;
  busy: boolean;
  initialMode: SyncMode;
  identityFingerprint: string | null;
  errorMessage: string | null;
  onStartFresh: (mode: SyncMode) => Promise<void>;
  onRestoreRelay: (mode: SyncMode) => Promise<void>;
  onImportLocal: (mode: SyncMode) => Promise<void>;
}

type StepIndex = 0 | 1 | 2 | 3;

const STEP_TITLES = ['Welcome', 'Sync mode', 'Security', 'Recovery'] as const;

const STEP_TEXT: Record<StepIndex, { title: string; subtitle: string }> = {
  0: {
    title: 'Local-first workout tracking',
    subtitle:
      'PearLift always writes instantly on this device. You decide how backup and sync should work.',
  },
  1: {
    title: 'Choose your backup mode',
    subtitle: 'This can be changed later from Sync Setup in settings.',
  },
  2: {
    title: 'Secure setup',
    subtitle:
      'PearLift creates one secure identity and derives keys for encrypted backup and future peer sync.',
  },
  3: {
    title: 'Pick a recovery path',
    subtitle:
      'Finish with an empty profile, restore from relay, or import a local backup before entering the app.',
  },
};

const NEXT_STEP: Record<StepIndex, StepIndex> = {
  0: 1,
  1: 2,
  2: 3,
  3: 3,
};

const PREVIOUS_STEP: Record<StepIndex, StepIndex> = {
  0: 0,
  1: 0,
  2: 1,
  3: 2,
};

function modeLabel(mode: SyncMode) {
  if (mode === 'relay-backup') return 'Encrypted relay backup';
  if (mode === 'full-sync-later') return 'Prepare full sync later';
  return 'Local only';
}

export function OnboardingScreen({
  tokens,
  topInset,
  bottomInset,
  blocking,
  busy,
  initialMode,
  identityFingerprint,
  errorMessage,
  onStartFresh,
  onRestoreRelay,
  onImportLocal,
}: OnboardingScreenProps) {
  const [step, setStep] = useState<StepIndex>(0);
  const [selectedMode, setSelectedMode] = useState<SyncMode>(initialMode);

  const styles = useMemo(
    () => createStyles(tokens, topInset, bottomInset),
    [tokens, topInset, bottomInset],
  );

  const relayEnabled = selectedMode !== 'local-only';
  const progressValue = step + 1;

  const renderStepBody = () => {
    if (step === 0) {
      return (
        <View style={styles.card}>
          <View style={styles.bulletRow}>
            <MaterialIcons
              name="offline-bolt"
              size={16}
              color={tokens.colors.primary}
            />
            <Text style={styles.bulletText}>
              All edits are instant and local.
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <MaterialIcons
              name="lock"
              size={16}
              color={tokens.colors.primary}
            />
            <Text style={styles.bulletText}>
              Backup payloads are encrypted before publishing.
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <MaterialIcons
              name="devices"
              size={16}
              color={tokens.colors.primary}
            />
            <Text style={styles.bulletText}>
              Future peer-sync identity is prepared during setup.
            </Text>
          </View>
        </View>
      );
    }

    if (step === 1) {
      return (
        <View style={styles.card}>
          <Pressable
            style={[
              styles.choiceCard,
              selectedMode === 'local-only' && styles.choiceCardActive,
            ]}
            onPress={() => setSelectedMode('local-only')}
          >
            <View style={styles.choiceLeft}>
              <MaterialIcons
                name="phone-android"
                size={18}
                color={tokens.colors.textPrimary}
              />
              <View style={styles.choiceTextWrap}>
                <Text style={styles.choiceTitle}>Local only</Text>
                <Text style={styles.choiceBody}>
                  Keep everything on this device and use manual JSON backups.
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.radio,
                selectedMode === 'local-only' && styles.radioSelected,
              ]}
            />
          </Pressable>

          <Pressable
            style={[
              styles.choiceCard,
              selectedMode === 'relay-backup' && styles.choiceCardActive,
            ]}
            onPress={() => setSelectedMode('relay-backup')}
          >
            <View style={styles.choiceLeft}>
              <MaterialIcons
                name="cloud"
                size={18}
                color={tokens.colors.textPrimary}
              />
              <View style={styles.choiceTextWrap}>
                <Text style={styles.choiceTitle}>Encrypted relay backup</Text>
                <Text style={styles.choiceBody}>
                  Publish encrypted snapshots and restore on your other devices.
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.radio,
                selectedMode === 'relay-backup' && styles.radioSelected,
              ]}
            />
          </Pressable>

          <Pressable
            style={[
              styles.choiceCard,
              selectedMode === 'full-sync-later' && styles.choiceCardActive,
            ]}
            onPress={() => setSelectedMode('full-sync-later')}
          >
            <View style={styles.choiceLeft}>
              <MaterialIcons
                name="sync"
                size={18}
                color={tokens.colors.textPrimary}
              />
              <View style={styles.choiceTextWrap}>
                <Text style={styles.choiceTitle}>Prepare full sync later</Text>
                <Text style={styles.choiceBody}>
                  Enable relay-ready setup and keep peer-sync migration ready.
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.radio,
                selectedMode === 'full-sync-later' && styles.radioSelected,
              ]}
            />
          </Pressable>
        </View>
      );
    }

    if (step === 2) {
      return (
        <View style={styles.card}>
          <View style={styles.statusRow}>
            <MaterialIcons
              name="check-circle"
              size={16}
              color={tokens.colors.success}
            />
            <Text style={styles.statusText}>
              No extra permissions needed right now.
            </Text>
          </View>
          <View style={styles.statusRow}>
            <MaterialIcons
              name="check-circle"
              size={16}
              color={tokens.colors.success}
            />
            <Text style={styles.statusText}>
              Key material stays in secure device storage.
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Selected mode</Text>
            <Text style={styles.detailValue}>{modeLabel(selectedMode)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Identity fingerprint</Text>
            <Text style={styles.detailValue}>
              {identityFingerprint ?? 'Will be generated now'}
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.card}>
        <Pressable
          style={[styles.primaryButton, busy && styles.disabled]}
          onPress={() => {
            void onStartFresh(selectedMode);
          }}
          disabled={busy}
        >
          <Text style={styles.primaryButtonText}>
            {busy ? 'Applying setup...' : 'Start fresh'}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.secondaryButton, busy && styles.disabled]}
          onPress={() => {
            void onImportLocal(selectedMode);
          }}
          disabled={busy}
        >
          <MaterialIcons
            name="upload-file"
            size={17}
            color={tokens.colors.primary}
          />
          <Text style={styles.secondaryButtonText}>Import local backup</Text>
        </Pressable>

        <Pressable
          style={[
            styles.secondaryButton,
            (!relayEnabled || busy) && styles.disabled,
          ]}
          onPress={() => {
            void onRestoreRelay(selectedMode);
          }}
          disabled={!relayEnabled || busy}
        >
          <MaterialIcons
            name="cloud-download"
            size={17}
            color={tokens.colors.primary}
          />
          <Text style={styles.secondaryButtonText}>Restore from relay</Text>
        </Pressable>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Setup mode</Text>
          <Text style={styles.detailValue}>{modeLabel(selectedMode)}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandBadge}>
              <MaterialIcons name="fitness-center" size={18} color="#FFFFFF" />
            </View>
            <View style={styles.brandTextWrap}>
              <Text style={styles.brandTitle}>PearLift setup</Text>
              <Text style={styles.progressText}>Step {progressValue} of 4</Text>
            </View>
          </View>

          <Text style={styles.stepTitle}>{STEP_TEXT[step].title}</Text>
          <Text style={styles.stepSubtitle}>{STEP_TEXT[step].subtitle}</Text>

          <View style={styles.segmentRow}>
            {STEP_TITLES.map((label, index) => (
              <View
                key={label}
                style={[
                  styles.segment,
                  index < progressValue && styles.segmentFilled,
                ]}
              />
            ))}
          </View>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={[
            styles.bodyContent,
            step === 3 ? styles.bodyContentTop : styles.bodyContentCentered,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {renderStepBody()}
          {errorMessage ? (
            <Text style={styles.errorText}>{errorMessage}</Text>
          ) : null}
        </ScrollView>
      </View>

      <View style={styles.footer}>
        <Pressable
          style={[
            styles.footerSecondary,
            (step === 0 || busy || !blocking) && styles.disabled,
          ]}
          disabled={step === 0 || busy || !blocking}
          onPress={() => setStep((prev) => PREVIOUS_STEP[prev])}
        >
          <Text style={styles.footerSecondaryText}>Back</Text>
        </Pressable>

        {step < 3 ? (
          <Pressable
            style={[styles.footerPrimary, busy && styles.disabled]}
            disabled={busy}
            onPress={() => setStep((prev) => NEXT_STEP[prev])}
          >
            <Text style={styles.footerPrimaryText}>Continue</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(
  tokens: ThemeTokens,
  topInset: number,
  bottomInset: number,
) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: tokens.colors.bgBase,
    },
    container: {
      flex: 1,
      paddingTop: topInset + tokens.spacing.md,
      paddingHorizontal: tokens.spacing.lg,
      gap: tokens.spacing.md,
    },
    header: {
      gap: tokens.spacing.xs,
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.sm,
      marginBottom: tokens.spacing.xs,
    },
    brandBadge: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tokens.colors.primary,
    },
    brandTextWrap: {
      gap: 1,
    },
    brandTitle: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.subtitle,
      fontWeight: '700',
    },
    progressText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '500',
    },
    stepTitle: {
      color: tokens.colors.textPrimary,
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '800',
    },
    stepSubtitle: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      lineHeight: 20,
    },
    segmentRow: {
      flexDirection: 'row',
      gap: 6,
      marginTop: tokens.spacing.xs,
    },
    segment: {
      flex: 1,
      height: 4,
      borderRadius: 999,
      backgroundColor: withAlpha(tokens.colors.outlineVariant, 0.9),
    },
    segmentFilled: {
      backgroundColor: tokens.colors.primary,
    },
    body: {
      flex: 1,
    },
    bodyContent: {
      flexGrow: 1,
      paddingBottom: tokens.spacing.sm,
    },
    bodyContentCentered: {
      justifyContent: 'center',
    },
    bodyContentTop: {
      justifyContent: 'flex-start',
    },
    card: {
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainer,
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    bulletRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: tokens.spacing.xs,
    },
    bulletText: {
      flex: 1,
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      lineHeight: 20,
    },
    choiceCard: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: withAlpha(tokens.colors.surfaceContainerHigh, 0.75),
      padding: tokens.spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: tokens.spacing.sm,
      minHeight: 72,
    },
    choiceCardActive: {
      borderColor: withAlpha(tokens.colors.primary, 0.7),
      backgroundColor: withAlpha(tokens.colors.primary, 0.08),
    },
    choiceLeft: {
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      flex: 1,
      alignItems: 'flex-start',
    },
    choiceTextWrap: {
      flex: 1,
      gap: 2,
    },
    choiceTitle: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    choiceBody: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      lineHeight: 17,
    },
    radio: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: tokens.colors.outline,
      backgroundColor: 'transparent',
    },
    radioSelected: {
      borderColor: tokens.colors.primary,
      backgroundColor: withAlpha(tokens.colors.primary, 0.9),
    },
    statusRow: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.success, 0.4),
      backgroundColor: withAlpha(tokens.colors.success, 0.1),
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.xs,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: tokens.spacing.sm,
    },
    statusText: {
      flex: 1,
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      fontWeight: '600',
      lineHeight: 17,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: tokens.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(tokens.colors.outlineVariant, 0.7),
      paddingVertical: tokens.spacing.xs,
    },
    detailLabel: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '500',
    },
    detailValue: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      fontWeight: '700',
      textAlign: 'right',
      flexShrink: 1,
    },
    primaryButton: {
      borderRadius: tokens.radius.md,
      minHeight: 46,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
    },
    primaryButtonText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    secondaryButton: {
      borderRadius: tokens.radius.md,
      minHeight: 46,
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.primary, 0.35),
      backgroundColor: withAlpha(tokens.colors.primary, 0.08),
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
      flexDirection: 'row',
      gap: tokens.spacing.xs,
    },
    secondaryButtonText: {
      color: tokens.colors.primary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    errorText: {
      marginTop: tokens.spacing.sm,
      color: tokens.colors.error,
      fontSize: tokens.type.label,
      fontWeight: '600',
      textAlign: 'center',
    },
    footer: {
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      paddingHorizontal: tokens.spacing.lg,
      paddingTop: tokens.spacing.sm,
      paddingBottom: bottomInset + tokens.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: withAlpha(tokens.colors.outlineVariant, 0.7),
      backgroundColor: tokens.colors.bgBase,
    },
    footerPrimary: {
      flex: 1,
      minHeight: 48,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    footerPrimaryText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    footerSecondary: {
      flex: 1,
      minHeight: 48,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(tokens.colors.surfaceContainerHigh, 0.75),
    },
    footerSecondaryText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      fontWeight: '600',
    },
    disabled: {
      opacity: 0.5,
    },
  });
}
