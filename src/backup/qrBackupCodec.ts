import { fromByteArray, toByteArray } from 'base64-js';
import pako from 'pako';
import { toPearLiftBackupCollection } from '@/backup/serialization';
import type {
  BackupProgramCollection,
  PearLiftBackupExercise,
  PearLiftBackupV4,
  PearLiftBackupWorkout,
  PearLiftRuntimeState,
} from '@/backup/types';
import type {
  DayConfig,
  ExerciseAdvanced,
  ExerciseWeightMode,
  TrainingProgram,
  UserExerciseSettingsMap,
  UserWeights,
  WeekConfig,
  WorkoutDay,
  WorkoutSession,
} from '@/types';

const QR_PREFIX = 'plqr1:';
const QR_CODEC_VERSION = 1;
const QR_ALGORITHM = 'gz+b64' as const;
const TARGET_QR_TEXT_LENGTH = 1000;
const INITIAL_CHUNK_PAYLOAD_LENGTH = 700;
const MIN_CHUNK_PAYLOAD_LENGTH = 120;
const MAX_CHUNK_COUNT = 300;

type CompactExercise = [
  id: string,
  name: string,
  sets: number,
  reps: string,
  baseWeight: number,
  muscleGroup: string,
  notes?: string,
  position?: number,
  advanced?: ExerciseAdvanced,
  identity?: {
    canonicalExerciseId?: string;
    aliases?: string[];
    variantLabel?: string;
    sessionSpecific?: true;
  },
];

type CompactWorkout = [
  id: string,
  name: string,
  description: string,
  exercises: CompactExercise[],
  defaultRestSeconds?: number,
];

type CompactWeekConfig = [
  id: number,
  name: string,
  loadModifier: number,
  rir: number,
  volumeModifier?: number,
  notes?: string | null,
];

type CompactDayConfig = [
  id: string,
  name: string,
  sessionLabel: string | null,
  icon: string,
  schedule?: DayConfig['schedule'],
];
type CompactWeight = [exerciseId: string, weight: number];
type CompactUserExerciseSetting = [
  exerciseId: string,
  workingWeight: number | null,
  weightUnit: 'kg' | 'lb',
  weightMode: string,
  incrementKg?: number | null,
  estimatedOneRepMax?: number | null,
  notes?: string | null,
  updatedAt?: string,
];
type CompactSettings = [
  currentWeek: number,
  currentDay: WorkoutDay,
  restDuration: number,
  themeMode: 'light' | 'dark' | 'system',
  weightUnit: 'kg' | 'lb',
];

interface CompactBackupV1 {
  v: 1;
  e: string;
  p?: TrainingProgram | null;
  w: CompactWorkout[];
  uw?: CompactWeight[];
  ues?: CompactUserExerciseSetting[];
  wc?: CompactWeekConfig[];
  dc?: CompactDayConfig[];
  s: CompactSettings;
}

function isBackupProgramCollection(
  value: PearLiftRuntimeState | BackupProgramCollection,
): value is BackupProgramCollection {
  return 'programs' in value && Array.isArray(value.programs);
}

interface SingleEnvelope {
  v: 1;
  k: 's';
  a: typeof QR_ALGORITHM;
  h: string;
  p: string;
}

interface ChunkEnvelope {
  v: 1;
  k: 'c';
  a: typeof QR_ALGORITHM;
  h: string;
  id: string;
  i: number;
  n: number;
  p: string;
}

export interface EncodedQrSingle {
  mode: 'single';
  packets: [string];
  checksum: string;
}

export interface EncodedQrChunked {
  mode: 'chunked';
  packets: string[];
  checksum: string;
  transferId: string;
}

export type EncodedQrTransfer = EncodedQrSingle | EncodedQrChunked;

export type DecodedQrPayload =
  | { kind: 'raw'; payload: string }
  | { kind: 'single'; checksum: string; payload: string }
  | {
      kind: 'chunk';
      transferId: string;
      index: number;
      total: number;
      checksum: string;
      payload: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coerceThemeMode(value: unknown): CompactSettings[3] {
  return value === 'light' || value === 'dark' || value === 'system'
    ? value
    : 'dark';
}

function coerceWeightMode(value: unknown): ExerciseWeightMode {
  return value === 'total' ||
    value === 'per_hand' ||
    value === 'per_side' ||
    value === 'machine_stack' ||
    value === 'bodyweight' ||
    value === 'assisted' ||
    value === 'custom'
    ? value
    : 'total';
}

function toCompactExercise(
  exercise: PearLiftBackupExercise,
  index: number,
): CompactExercise {
  const notes = typeof exercise.notes === 'string' ? exercise.notes : '';
  const position = Number.isFinite(Number(exercise.position))
    ? Number(exercise.position)
    : index;

  const compact: CompactExercise = [
    String(exercise.id),
    String(exercise.name),
    Number(exercise.sets),
    String(exercise.reps),
    Number(exercise.baseWeight),
    String(exercise.muscleGroup),
  ];

  if (notes.length > 0) {
    compact.push(notes);
  }

  if (position !== index || exercise.advanced) {
    if (notes.length === 0) {
      compact.push('');
    }
    compact.push(position);
  }

  if (exercise.advanced) {
    compact.push(exercise.advanced);
  }

  if (
    exercise.canonicalExerciseId ||
    exercise.aliases?.length ||
    exercise.variantLabel ||
    exercise.sessionSpecific
  ) {
    if (!exercise.advanced) {
      while (compact.length < 9) {
        compact.push(undefined);
      }
    }
    compact.push({
      ...(exercise.canonicalExerciseId
        ? { canonicalExerciseId: exercise.canonicalExerciseId }
        : {}),
      ...(exercise.aliases?.length ? { aliases: exercise.aliases } : {}),
      ...(exercise.variantLabel ? { variantLabel: exercise.variantLabel } : {}),
      ...(exercise.sessionSpecific ? { sessionSpecific: true } : {}),
    });
  }

  return compact;
}

function toCompactWorkout(workout: WorkoutSession): CompactWorkout {
  const exercises = workout.exercises.map((exercise, index) =>
    toCompactExercise(exercise, index),
  );
  return workout.defaultRestSeconds != null
    ? [
        workout.id,
        workout.name,
        workout.description,
        exercises,
        workout.defaultRestSeconds,
      ]
    : [workout.id, workout.name, workout.description, exercises];
}

function toCompactWeights(weights: UserWeights): CompactWeight[] {
  const entries: CompactWeight[] = [];
  for (const [exerciseId, value] of Object.entries(weights)) {
    if (!Number.isFinite(value) || value === 0) continue;
    entries.push([exerciseId, value]);
  }
  return entries;
}

function toCompactUserExerciseSettings(
  settings: UserExerciseSettingsMap | undefined,
): CompactUserExerciseSetting[] {
  if (!settings) {
    return [];
  }

  return Object.values(settings).map((item) => [
    item.exerciseId,
    item.workingWeight ?? null,
    item.weightUnit,
    item.weightMode,
    item.incrementKg ?? null,
    item.estimatedOneRepMax ?? null,
    item.notes ?? null,
    item.updatedAt,
  ]);
}

function toCompactWeekConfigs(weekConfigs: WeekConfig[]): CompactWeekConfig[] {
  return weekConfigs.map((week) => [
    week.id,
    week.name,
    week.loadModifier,
    week.rir,
    week.volumeModifier ?? 1,
    week.notes ?? null,
  ]);
}

function toCompactDayConfigs(dayConfigs: DayConfig[]): CompactDayConfig[] {
  return dayConfigs.map((day) => [
    day.id,
    day.name,
    day.sessionLabel ?? null,
    day.icon,
    day.schedule,
  ]);
}

function toCompactBackup(state: PearLiftRuntimeState): CompactBackupV1 {
  const exportedAt = new Date().toISOString();
  const compactWeights = toCompactWeights(state.userWeights);
  const compactUserExerciseSettings = toCompactUserExerciseSettings(
    state.userExerciseSettings,
  );
  const compactWeekConfigs = toCompactWeekConfigs(state.weekConfigs);
  const compactDayConfigs = toCompactDayConfigs(state.dayConfigs);

  const compact: CompactBackupV1 = {
    v: 1,
    e: exportedAt,
    p: state.program ?? null,
    w: state.workouts.map(toCompactWorkout),
    s: [
      state.currentWeek,
      state.currentDay,
      state.restDuration,
      coerceThemeMode(state.themeMode),
      state.weightUnit === 'lb' ? 'lb' : 'kg',
    ],
  };

  if (compactWeights.length > 0) {
    compact.uw = compactWeights;
  }

  if (compactUserExerciseSettings.length > 0) {
    compact.ues = compactUserExerciseSettings;
  }

  if (compactWeekConfigs.length > 0) {
    compact.wc = compactWeekConfigs;
  }

  if (compactDayConfigs.length > 0) {
    compact.dc = compactDayConfigs;
  }

  return compact;
}

function fromCompactExercise(
  compact: unknown,
  fallbackIndex: number,
): PearLiftBackupExercise {
  if (!Array.isArray(compact)) {
    throw new Error('Invalid compact exercise payload.');
  }

  const [
    id,
    name,
    sets,
    reps,
    baseWeight,
    muscleGroup,
    notesValue,
    positionValue,
    advancedValue,
    identityValue,
  ] = compact;

  const notes =
    typeof notesValue === 'string' && notesValue.length > 0 ? notesValue : '';
  const position = Number.isFinite(Number(positionValue))
    ? Number(positionValue)
    : fallbackIndex;

  return {
    id: String(id ?? `exercise-${fallbackIndex}`),
    name: String(name ?? 'Exercise'),
    ...(isRecord(identityValue) &&
    typeof identityValue.canonicalExerciseId === 'string' &&
    identityValue.canonicalExerciseId.trim().length > 0
      ? { canonicalExerciseId: identityValue.canonicalExerciseId.trim() }
      : {}),
    ...(isRecord(identityValue) && Array.isArray(identityValue.aliases)
      ? {
          aliases: identityValue.aliases
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter((item) => item.length > 0),
        }
      : {}),
    ...(isRecord(identityValue) &&
    typeof identityValue.variantLabel === 'string' &&
    identityValue.variantLabel.trim().length > 0
      ? { variantLabel: identityValue.variantLabel.trim() }
      : {}),
    ...(isRecord(identityValue) && identityValue.sessionSpecific === true
      ? { sessionSpecific: true }
      : {}),
    sets: Number.isFinite(Number(sets)) ? Number(sets) : 2,
    reps: String(reps ?? '8-10'),
    baseWeight: Number.isFinite(Number(baseWeight)) ? Number(baseWeight) : 0,
    muscleGroup: String(muscleGroup ?? 'Full Body'),
    notes,
    position,
    advanced:
      typeof advancedValue === 'object' &&
      advancedValue !== null &&
      !Array.isArray(advancedValue)
        ? (advancedValue as ExerciseAdvanced)
        : undefined,
  };
}

function fromCompactWorkout(compact: unknown): PearLiftBackupWorkout {
  if (!Array.isArray(compact)) {
    throw new Error('Invalid compact workout payload.');
  }

  const [id, name, description, exercisesValue, defaultRestSeconds] = compact;
  const exercises = Array.isArray(exercisesValue)
    ? exercisesValue.map((exercise, index) =>
        fromCompactExercise(exercise, index),
      )
    : [];

  return {
    id: String(id ?? 'workout'),
    name: String(name ?? 'Workout'),
    description: String(description ?? ''),
    ...(Number.isFinite(Number(defaultRestSeconds)) &&
    Number(defaultRestSeconds) >= 0
      ? { defaultRestSeconds: Number(defaultRestSeconds) }
      : {}),
    exercises,
  };
}

function fromCompactWeights(compact: unknown): UserWeights {
  if (!Array.isArray(compact)) {
    return {};
  }

  const userWeights: UserWeights = {};
  for (const item of compact) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const [exerciseId, value] = item;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) continue;
    userWeights[String(exerciseId)] = numeric;
  }
  return userWeights;
}

function fromCompactUserExerciseSettings(
  compact: unknown,
): UserExerciseSettingsMap | undefined {
  if (!Array.isArray(compact)) {
    return undefined;
  }

  const settings: UserExerciseSettingsMap = {};
  for (const item of compact) {
    if (!Array.isArray(item) || item.length < 4) continue;
    const [
      exerciseId,
      workingWeight,
      weightUnit,
      weightMode,
      incrementKg,
      estimatedOneRepMax,
      notes,
      updatedAt,
    ] = item;
    const key = String(exerciseId ?? '').trim();
    if (!key) continue;
    settings[key] = {
      exerciseId: key,
      ...(Number.isFinite(Number(workingWeight))
        ? { workingWeight: Number(workingWeight) }
        : {}),
      weightUnit: weightUnit === 'lb' ? 'lb' : 'kg',
      weightMode: coerceWeightMode(weightMode),
      ...(Number.isFinite(Number(incrementKg))
        ? { incrementKg: Number(incrementKg) }
        : {}),
      ...(Number.isFinite(Number(estimatedOneRepMax))
        ? { estimatedOneRepMax: Number(estimatedOneRepMax) }
        : {}),
      ...(typeof notes === 'string' && notes.trim().length > 0
        ? { notes: notes.trim() }
        : {}),
      updatedAt:
        typeof updatedAt === 'string' && updatedAt.trim().length > 0
          ? updatedAt
          : new Date().toISOString(),
    };
  }

  return Object.keys(settings).length > 0 ? settings : undefined;
}

function fromCompactWeekConfigs(compact: unknown): WeekConfig[] {
  if (!Array.isArray(compact)) {
    return [];
  }

  const weekConfigs: WeekConfig[] = [];
  for (const item of compact) {
    if (!Array.isArray(item)) continue;
    const [id, name, loadModifier, rir, volumeModifier, notes] = item;
    weekConfigs.push({
      id: Number.isFinite(Number(id)) ? Number(id) : weekConfigs.length + 1,
      name: String(name ?? `Week ${weekConfigs.length + 1}`),
      loadModifier: Number.isFinite(Number(loadModifier))
        ? Number(loadModifier)
        : 1,
      ...(Number.isFinite(Number(volumeModifier))
        ? { volumeModifier: Number(volumeModifier) }
        : {}),
      rir: Number.isFinite(Number(rir)) ? Number(rir) : 2,
      ...(typeof notes === 'string' && notes.trim().length > 0
        ? { notes: notes.trim() }
        : {}),
    });
  }
  return weekConfigs;
}

function fromCompactDayConfigs(compact: unknown): DayConfig[] {
  if (!Array.isArray(compact)) {
    return [];
  }

  const dayConfigs: DayConfig[] = [];
  for (const item of compact) {
    if (!Array.isArray(item)) continue;
    const [id, name, third, fourth, fifth] = item;
    const usesSessionLabel = item.length >= 5;
    const sessionLabel = usesSessionLabel ? third : null;
    const icon = usesSessionLabel ? fourth : third;
    const schedule = usesSessionLabel ? fifth : fourth;
    dayConfigs.push({
      id: String(id ?? `day-${dayConfigs.length + 1}`),
      name: String(name ?? `Day ${dayConfigs.length + 1}`),
      ...(typeof sessionLabel === 'string' && sessionLabel.trim().length > 0
        ? { sessionLabel: sessionLabel.trim() }
        : {}),
      icon: String(icon ?? 'FitnessCenter'),
      schedule:
        typeof schedule === 'object' &&
        schedule !== null &&
        !Array.isArray(schedule)
          ? (schedule as DayConfig['schedule'])
          : undefined,
    });
  }
  return dayConfigs;
}

function fromCompactBackup(compact: unknown): PearLiftBackupV4 {
  if (!isRecord(compact) || compact.v !== 1) {
    throw new Error('Unsupported compact backup version.');
  }

  const settings = Array.isArray(compact.s) ? compact.s : [];
  const currentWeek = Number.isFinite(Number(settings[0]))
    ? Number(settings[0])
    : 1;
  const currentDay = String(settings[1] ?? 'push');
  const restDuration = Number.isFinite(Number(settings[2]))
    ? Number(settings[2])
    : 150;
  const themeMode = coerceThemeMode(settings[3]);
  const weightUnit = settings[4] === 'lb' ? 'lb' : 'kg';
  const userExerciseSettings = fromCompactUserExerciseSettings(compact.ues);

  return {
    version: 4,
    exportedAt:
      typeof compact.e === 'string' ? compact.e : new Date().toISOString(),
    app: {
      name: 'PearLift',
      platform: 'mobile',
      backupFormat: 'pearlift.backup.v4',
    },
    data: {
      program:
        typeof compact.p === 'object' &&
        compact.p !== null &&
        !Array.isArray(compact.p)
          ? (compact.p as TrainingProgram)
          : null,
      workouts: Array.isArray(compact.w)
        ? compact.w.map(fromCompactWorkout)
        : [],
      userWeights: fromCompactWeights(compact.uw),
      ...(userExerciseSettings ? { userExerciseSettings } : {}),
      weekConfigs: fromCompactWeekConfigs(compact.wc),
      dayConfigs: fromCompactDayConfigs(compact.dc),
      settings: {
        currentWeek,
        currentDay,
        restDuration,
        themeMode,
        weightUnit,
        language: 'system',
      },
    },
  };
}

function createTransferId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function toCrc32Hex(bytes: Uint8Array): string {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    const value = bytes[index];
    crc = CRC32_TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8);
  }
  const normalized = (crc ^ 0xffffffff) >>> 0;
  return normalized.toString(16).padStart(8, '0');
}

function createSingleEnvelope(base64Payload: string, checksum: string): string {
  const envelope: SingleEnvelope = {
    v: QR_CODEC_VERSION,
    k: 's',
    a: QR_ALGORITHM,
    h: checksum,
    p: base64Payload,
  };
  return `${QR_PREFIX}${JSON.stringify(envelope)}`;
}

function createChunkEnvelope(
  transferId: string,
  checksum: string,
  index: number,
  total: number,
  payload: string,
): string {
  const envelope: ChunkEnvelope = {
    v: QR_CODEC_VERSION,
    k: 'c',
    a: QR_ALGORITHM,
    h: checksum,
    id: transferId,
    i: index,
    n: total,
    p: payload,
  };
  return `${QR_PREFIX}${JSON.stringify(envelope)}`;
}

function splitIntoSlices(payload: string, chunkSize: number): string[] {
  const slices: string[] = [];
  for (let offset = 0; offset < payload.length; offset += chunkSize) {
    slices.push(payload.slice(offset, offset + chunkSize));
  }
  return slices;
}

function buildChunkedEnvelopes(
  base64Payload: string,
  checksum: string,
): { transferId: string; packets: string[] } {
  const transferId = createTransferId();

  for (
    let chunkSize = INITIAL_CHUNK_PAYLOAD_LENGTH;
    chunkSize >= MIN_CHUNK_PAYLOAD_LENGTH;
    chunkSize -= 40
  ) {
    const slices = splitIntoSlices(base64Payload, chunkSize);
    if (slices.length > MAX_CHUNK_COUNT) {
      throw new Error('QR_TRANSFER_TOO_LARGE');
    }
    const total = slices.length;
    const envelopes = slices.map((slice, index) =>
      createChunkEnvelope(transferId, checksum, index, total, slice),
    );
    const tooLarge = envelopes.some(
      (packet) => packet.length > TARGET_QR_TEXT_LENGTH,
    );
    if (!tooLarge) {
      return {
        transferId,
        packets: envelopes,
      };
    }
  }

  throw new Error('QR_TRANSFER_TOO_LARGE');
}

function decodeCompressedPayload(
  base64Payload: string,
  checksum: string,
): string {
  let compressed: Uint8Array;
  try {
    compressed = toByteArray(base64Payload);
  } catch {
    throw new Error('Invalid QR payload encoding.');
  }

  const actualChecksum = toCrc32Hex(compressed);
  if (actualChecksum !== checksum) {
    throw new Error('QR_CHECKSUM_MISMATCH');
  }

  let compactJson = '';
  try {
    compactJson = pako.ungzip(compressed, { to: 'string' });
  } catch {
    throw new Error('Invalid compressed QR payload.');
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(compactJson);
  } catch {
    throw new Error('Invalid QR backup payload.');
  }

  if (
    isRecord(parsedPayload) &&
    typeof parsedPayload.version === 'number' &&
    isRecord(parsedPayload.data)
  ) {
    return JSON.stringify(parsedPayload);
  }

  const backup = fromCompactBackup(parsedPayload);
  return JSON.stringify(backup);
}

export function encodeBackupForQr(
  input: PearLiftRuntimeState | BackupProgramCollection,
): EncodedQrTransfer {
  const payload = isBackupProgramCollection(input)
    ? (() => {
        const backup = toPearLiftBackupCollection({
          ...input,
          programs: input.programs.map((programState) => ({
            ...programState,
            sessionLogs: [],
          })),
        });
        return JSON.stringify(backup);
      })()
    : JSON.stringify(toCompactBackup(input));
  const compressed = pako.gzip(payload);
  const checksum = toCrc32Hex(compressed);
  const base64Payload = fromByteArray(compressed);

  const singlePacket = createSingleEnvelope(base64Payload, checksum);
  if (singlePacket.length <= TARGET_QR_TEXT_LENGTH) {
    return {
      mode: 'single',
      packets: [singlePacket],
      checksum,
    };
  }

  const chunked = buildChunkedEnvelopes(base64Payload, checksum);
  return {
    mode: 'chunked',
    packets: chunked.packets,
    checksum,
    transferId: chunked.transferId,
  };
}

export function decodeQrPayload(scannedText: string): DecodedQrPayload {
  const payload = scannedText.trim();
  if (!payload.startsWith(QR_PREFIX)) {
    return { kind: 'raw', payload };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload.slice(QR_PREFIX.length));
  } catch {
    throw new Error('Invalid QR envelope.');
  }

  if (!isRecord(parsed)) {
    throw new Error('Invalid QR envelope.');
  }

  if (parsed.v !== QR_CODEC_VERSION) {
    throw new Error('Unsupported QR payload version.');
  }
  if (parsed.a !== QR_ALGORITHM) {
    throw new Error('Unsupported QR payload algorithm.');
  }
  if (typeof parsed.h !== 'string' || parsed.h.length === 0) {
    throw new Error('Invalid QR checksum.');
  }
  if (typeof parsed.p !== 'string' || parsed.p.length === 0) {
    throw new Error('Invalid QR payload content.');
  }

  if (parsed.k === 's') {
    return {
      kind: 'single',
      checksum: parsed.h,
      payload: parsed.p,
    };
  }

  if (parsed.k === 'c') {
    const index = Number(parsed.i);
    const total = Number(parsed.n);
    if (typeof parsed.id !== 'string' || parsed.id.length === 0) {
      throw new Error('Invalid QR transfer ID.');
    }
    if (!Number.isInteger(index) || index < 0) {
      throw new Error('Invalid QR chunk index.');
    }
    if (!Number.isInteger(total) || total <= 0 || total > MAX_CHUNK_COUNT) {
      throw new Error('Invalid QR chunk count.');
    }
    if (index >= total) {
      throw new Error('QR chunk index out of range.');
    }

    return {
      kind: 'chunk',
      transferId: parsed.id,
      index,
      total,
      checksum: parsed.h,
      payload: parsed.p,
    };
  }

  throw new Error('Unknown QR payload type.');
}

export function assembleChunkedPackets(
  packets: Map<number, string> | Record<string, string>,
  expectedTotal: number,
  checksum: string,
): string {
  if (!Number.isInteger(expectedTotal) || expectedTotal <= 0) {
    throw new Error('Invalid chunk count.');
  }

  const parts: string[] = [];
  if (packets instanceof Map) {
    for (let index = 0; index < expectedTotal; index += 1) {
      const packet = packets.get(index);
      if (typeof packet !== 'string' || packet.length === 0) {
        throw new Error('Missing QR chunks.');
      }
      parts.push(packet);
    }
  } else {
    for (let index = 0; index < expectedTotal; index += 1) {
      const packet = packets[String(index)];
      if (typeof packet !== 'string' || packet.length === 0) {
        throw new Error('Missing QR chunks.');
      }
      parts.push(packet);
    }
  }

  const base64Payload = parts.join('');
  return decodeCompressedPayload(base64Payload, checksum);
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let shift = 0; shift < 8; shift += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();
