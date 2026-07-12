import { describe, expect, test } from 'bun:test';
import {
  formatPerSetTargetSummary,
  formatPerSetTargetsInput,
  formatProgressionRuleChipLabel,
  formatRepsLabel,
  formatRirInput,
  formatWeekOverrideSummary,
  formatWeekOverridesInput,
  hasAdvancedExerciseEditorFields,
  inferUnilateralFromRepsLabel,
  parseIntensityInput,
  parseLineList,
  parsePerSetTargetsInput,
  parseProgressionRuleInput,
  parseRirInput,
  parseUnilateralInput,
  parseWeekOverridesInput,
} from '@/utils/exerciseAdvanced';

describe('exercise advanced helpers', () => {
  test('parses rir labels into structured targets', () => {
    expect(parseRirInput('1-2')).toEqual({
      type: 'range',
      min: 1,
      max: 2,
      label: '1-2',
    });
    expect(parseRirInput('2 / 1 / 0')).toEqual({
      type: 'per_set',
      values: [2, 1, 0],
      label: '2 / 1 / 0',
    });
    expect(parseRirInput('1')).toEqual({
      type: 'fixed',
      value: 1,
      label: '1',
    });
    expect(parseRirInput('2 + last 0')).toEqual({
      type: 'last_set_override',
      value: 2,
      lastSet: 0,
      label: '2 + last 0',
    });
    expect(parseRirInput('last set 0')).toEqual({
      type: 'last_set_override',
      lastSet: 0,
      label: 'last set 0',
    });
  });

  test('formats last-set rir overrides back into editable text', () => {
    expect(
      formatRirInput({
        type: 'last_set_override',
        value: 2,
        lastSet: 0,
        label: '2 + last 0',
      }),
    ).toBe('2 + last 0');
    expect(
      formatRirInput({
        type: 'per_set',
        values: [2, 1, 0],
        label: '2,1,0',
      }),
    ).toBe('2 / 1 / 0');
  });

  test('parses intensity labels into structured targets', () => {
    expect(parseIntensityInput('80-85% 1RM')).toEqual({
      type: 'percent_1rm',
      min: 80,
      max: 85,
      label: '80-85% 1RM',
    });
    expect(parseIntensityInput('75%')).toEqual({
      type: 'percent_1rm',
      value: 75,
      label: '75%',
    });
    expect(parseIntensityInput('Controllo')).toEqual({
      type: 'control',
      label: 'Controllo',
    });
  });

  test('parses structured progression rules when the label matches', () => {
    expect(
      parseProgressionRuleInput('+5 kg when all sets reach 6 reps with 2 RIR'),
    ).toEqual({
      type: 'load_increment_when_top_reps_at_rir',
      label: '+5 kg when all sets reach 6 reps with 2 RIR',
      incrementKg: 5,
      targetReps: 6,
      requiredRir: 2,
      scope: 'all_sets',
    });
    expect(parseProgressionRuleInput('+2.5 kg when 3 x 7 with 2 RIR')).toEqual({
      type: 'load_increment_when_top_reps_at_rir',
      label: '+2.5 kg when 3 x 7 with 2 RIR',
      incrementKg: 2.5,
      targetReps: 7,
      requiredRir: 2,
      requiredSets: 3,
      scope: 'all_sets',
    });
  });

  test('keeps unknown progression rules as custom text', () => {
    expect(
      parseProgressionRuleInput('+5kg when all sets hit top reps'),
    ).toEqual({
      type: 'custom_text',
      label: '+5kg when all sets hit top reps',
    });
    expect(parseProgressionRuleInput('')).toBe(undefined);
  });

  test('formats compact chip labels only for obvious progression rules', () => {
    expect(
      formatProgressionRuleChipLabel({
        type: 'load_increment_when_top_reps_at_rir',
        label: '+5 kg when all sets reach 6 reps with 2 RIR',
        incrementKg: 5,
        targetReps: 6,
        requiredRir: 2,
        scope: 'all_sets',
      }),
    ).toBe('+5kg rule');
    expect(
      formatProgressionRuleChipLabel({
        type: 'custom_text',
        label: 'Add one set from week 3',
      }),
    ).toBe(null);
  });

  test('parses unilateral labels into structured metadata', () => {
    expect(parseUnilateralInput('per leg')).toEqual({
      enabled: true,
      sideMode: 'per_leg',
      countBothSidesAsOneSet: true,
      label: 'per leg',
    });
    expect(parseUnilateralInput('per side')).toEqual({
      enabled: true,
      sideMode: 'per_side',
      countBothSidesAsOneSet: true,
      label: 'per side',
    });
    expect(parseUnilateralInput('')).toBe(undefined);
  });

  test('formats rep labels for unilateral exercises without duplication', () => {
    expect(
      formatRepsLabel('6-8', {
        enabled: true,
        sideMode: 'per_leg',
        countBothSidesAsOneSet: true,
        label: 'per leg',
      }),
    ).toBe('6-8 / leg');
    expect(
      formatRepsLabel('6-8 / per leg', {
        enabled: true,
        sideMode: 'per_leg',
        countBothSidesAsOneSet: true,
        label: 'per leg',
      }),
    ).toBe('6-8 / per leg');
    expect(
      formatRepsLabel('10-12 / l', {
        enabled: true,
        sideMode: 'per_side',
        countBothSidesAsOneSet: true,
        label: 'per side',
      }),
    ).toBe('10-12 / l');
  });

  test('infers unilateral metadata from shorthand rep labels', () => {
    expect(inferUnilateralFromRepsLabel('6-8 / x gamba')).toEqual({
      enabled: true,
      sideMode: 'per_leg',
      countBothSidesAsOneSet: true,
      label: 'per leg',
    });
    expect(inferUnilateralFromRepsLabel('10-12 / l')).toEqual({
      enabled: true,
      sideMode: 'per_side',
      countBothSidesAsOneSet: true,
      label: 'per side',
    });
    expect(inferUnilateralFromRepsLabel('8')).toBe(undefined);
  });

  test('parses newline-separated note groups', () => {
    expect(parseLineList(' cue one \n\ncue two  ')).toEqual([
      'cue one',
      'cue two',
    ]);
    expect(parseLineList('   ')).toBe(undefined);
  });

  test('detects when edit mode should open the advanced tab', () => {
    expect(
      hasAdvancedExerciseEditorFields({
        id: 'curl-a',
        name: 'Curl Alternato',
        muscleGroup: 'Biceps',
        sets: 3,
        reps: '10-12',
        baseWeight: 0,
        notes: '',
        position: 0,
      }),
    ).toBe(false);

    expect(
      hasAdvancedExerciseEditorFields({
        id: 'curl-b',
        name: 'Curl Alternato',
        canonicalExerciseId: 'alternating-curl',
        muscleGroup: 'Biceps',
        sets: 3,
        reps: '10-12',
        baseWeight: 0,
        notes: '',
        position: 0,
      }),
    ).toBe(true);

    expect(
      hasAdvancedExerciseEditorFields({
        id: 'lat-machine',
        name: 'Lat Machine',
        muscleGroup: 'Back',
        sets: 4,
        reps: '8-10',
        baseWeight: 0,
        notes: '',
        position: 0,
        advanced: {
          restSeconds: 180,
        },
      }),
    ).toBe(true);
  });

  test('parses and formats week overrides for exercise editing', () => {
    const parsed = parseWeekOverridesInput(
      'W3: sets=4; rest=120; rir=1; notes=Add one set\n' +
        'Week 5: reps=8-10; rir=2 + last 0',
    );

    if (!parsed) {
      throw new Error('Expected parsed week overrides.');
    }

    expect(parsed).toEqual([
      {
        week: 3,
        sets: 4,
        restSeconds: 120,
        rir: {
          type: 'fixed',
          value: 1,
          label: '1',
        },
        notes: 'Add one set',
      },
      {
        week: 5,
        reps: '8-10',
        rir: {
          type: 'last_set_override',
          value: 2,
          lastSet: 0,
          label: '2 + last 0',
        },
      },
    ]);

    expect(formatWeekOverridesInput(parsed)).toBe(
      'W3: sets=4; rest=120; rir=1; notes=Add one set\n' +
        'W5: reps=8-10; rir=2 + last 0',
    );
    expect(formatWeekOverrideSummary(parsed[0])).toBe(
      'W3: 4x · Rest 120s · RIR 1 · Add one set',
    );
  });

  test('parses and formats per-set targets for exercise editing', () => {
    const parsed = parsePerSetTargetsInput(
      'S2: reps=8; rir=1; rest=90\n' +
        'Set 4: reps=10-12; intensity=75-80%; notes=Back-off',
    );

    if (!parsed) {
      throw new Error('Expected parsed per-set targets.');
    }

    expect(parsed).toEqual([
      {
        setNumber: 2,
        reps: '8',
        rir: {
          type: 'fixed',
          value: 1,
          label: '1',
        },
        restSeconds: 90,
      },
      {
        setNumber: 4,
        reps: '10-12',
        intensity: {
          type: 'percent_1rm',
          min: 75,
          max: 80,
          label: '75-80%',
        },
        notes: 'Back-off',
      },
    ]);

    expect(formatPerSetTargetsInput(parsed)).toBe(
      'S2: reps=8; rir=1; rest=90\n' +
        'S4: reps=10-12; intensity=75-80%; notes=Back-off',
    );
    expect(formatPerSetTargetSummary(parsed[1])).toBe(
      'S4: 10-12 · 75-80% · Back-off',
    );
  });
});
