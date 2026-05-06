# QVAC SDK Integration for PearLift

## Context

PearLift already runs on the Holepunch stack (`bare-rpc`, `bare-kit`, `autobase`, `corestore`, `hyperswarm`) for P2P workout sync. QVAC SDK is built on the same Pears.com ecosystem, supports Expo, and runs AI fully on-device. Integration is additive — no architectural rewrite needed.

## Current PearLift Features → QVAC Enhancements

### 1. Workout Creation & Editing

**Current:** Manual form-based exercise entry via `AddExerciseModal`.

**QVAC add: Natural language workout builder**

```ts
// src/ai/workoutBuilder.ts
import { completion, loadModel, LLAMA_3_2_1B_INST_Q4_0 } from "@qvac/sdk";

const modelId = await loadModel({
  modelSrc: LLAMA_3_2_1B_INST_Q4_0,
  modelType: "llm",
});

const result = completion({
  modelId,
  history: [
    { role: "system", content: SYSTEM_PROMPT_WORKOUT_BUILDER },
    { role: "user", content: "Create a push day with bench press, OHP, and lateral raises. 3 sets each." }
  ],
  stream: true,
  tools: [
    { name: "addExercise", parameters: { workoutId, name, sets, reps, muscleGroup, notes } },
    { name: "createWorkout", parameters: { name, description } },
  ],
});
```

User says: *"Build me a pull day with deadlifts and rows"* → LLM calls `addExercise` tool → mutations applied via `workoutStore.applyMutation()` → synced over Holepunch.

**Reuses existing:** `workoutStore.applyMutation()`, `AddExerciseModal`, `WorkoutMutation` types.

---

### 2. Weight Logging During Workouts

**Current:** User taps exercise card, types weight into numeric input.

**QVAC add: Voice weight logging (speech-to-text)**

```ts
// src/ai/voiceLogging.ts
import { loadModel, speechToText, WHISPER_TINY_Q4_0 } from "@qvac/sdk";

// During active workout, hold-to-talk triggers STT
const result = speechToText({ modelId, audioBuffer });
// "bench press 185 pounds" → parse → applyMutation({ type: "setExerciseWeight", ... })
```

**Reuses existing:** `workoutStore.applyMutation()`, `RestTimer` (record during rest period), P2P sync pipeline.

---

### 3. Workout History & Insights

**Current:** No analytics — user scrolls through past workouts manually.

**QVAC add: RAG-powered training queries**

```ts
// src/ai/trainingInsights.ts
import { loadModel, ragSaveEmbeddings, ragSearch, GTE_LARGE_FP16 } from "@qvac/sdk";

// On app launch / background sync: embed all workout snapshots
const snapshots = await repository.getAllSnapshots();
await ragSaveEmbeddings({
  modelId: embeddingsModelId,
  documents: snapshots.map(s => JSON.stringify(s)),
  chunk: false,
});

// User query: "What was my heaviest bench press this month?"
const results = await ragSearch({ modelId: embeddingsModelId, query, topK: 5 });
// Feed results + query to LLM for natural language answer
```

**Reuses existing:** `WorkoutRepository`, snapshot data, Holepunch-synced workout state.

---

### 4. Rest Timer

**Current:** Visual countdown + notification/foreground service on completion.

**QVAC add: TTS audio cues**

```ts
import { loadModel, textToSpeech, TTS_PIPER_NORMAN_EN_US_ONNX_MEDIUM } from "@qvac/sdk";

// When rest timer hits 10s, 5s, 0s:
const result = textToSpeech({ modelId, text: "Rest complete. Next: bench press, 185 pounds." });
playAudio(result.buffer);
```

**Reuses existing:** `RestTimer` component, i18n for multi-language cues.

---

### 5. Onboarding & Program Setup

**Current:** Static default workouts loaded from `src/data/workouts.ts`.

**QVAC add: Personalized program generation during onboarding**

User describes: *"I'm a beginner, I want to work out 3 days a week, focusing on strength"* → LLM generates `Workout[]`, `WeekConfig[]`, `DayConfig[]` → applied as initial state.

**Reuses existing:** `OnboardingScreen`, `data/workouts.ts` structure, `replaceWeekConfigs`/`replaceDayConfigs` mutations.

---

### 6. QR Room Invite / Pairing

**Current:** Manual hex key entry or QR scan.

**QVAC add: No direct enhancement here — this is a P2P transport feature that QVAC doesn't touch. However, QVAC's `startQVACProvider` could expose AI models over the same Holepunch P2P fabric that sync already uses.**

---

## Future Features → QVAC Combo

### 7. Exercise Form Feedback

**Future:** User records a set with device camera.

**QVAC add:** Multimodal/vision LLM analyzes video frames.

```ts
import { completion, loadModel, LLAMA_VISION_Q4_0 } from "@qvac/sdk";

// Feed frames + prompt: "Analyze deadlift form. Check for rounded back."
const result = completion({
  modelId,
  history: [
    { role: "user", content: [
      { type: "text", text: "Check my squat depth" },
      { type: "image", image: frameBuffer }
    ]}
  ],
});
```

**Note:** Vision models are large (7B+). Use delegated inference — phone captures, desktop processes via P2P.

---

### 8. Smart Progressive Overload

**Future:** AI-driven weight/rep/set progression based on history.

**QVAC add:** RAG over training history + LLM decision-making.

```ts
// Retrieve recent 4 weeks of bench press data via RAG
// Prompt: "User's bench press history: [...]. Recommend next workout weight."
// LLM outputs: { exerciseId, recommendedWeight, confidence, rationale }
```

Could auto-suggest weight increases and flag plateaus.

---

### 9. Personalized Coaching Chat

**Future:** Dedicated chat tab with training AI.

**QVAC add:** Persistent chat with access to workout history via RAG.

- "Should I deload this week?" → RAG retrieves volume/frequency → LLM answers with context
- "What muscles am I neglecting?" → RAG retrieves exercise distribution → LLM analyzes
- "Create a 4-week program for hypertrophy" → LLM + tool calling builds full program

---

### 10. Cross-Device AI Delegation

**Future:** PearLift desktop companion app (Electron/Bare) runs larger models.

**QVAC add:** `startQVACProvider` on desktop, mobile PearLift delegates inference.

```ts
// Desktop (provider):
import { startQVACProvider } from "@qvac/sdk";
await startQVACProvider({ topic: pairingSecretHex });

// Mobile (consumer — same app, different mode):
// QVAC SDK auto-discovers the desktop peer over Hyperswarm and routes inference there
```

**Reuses existing:** Holepunch pair key, Hyperswarm discovery, P2P sync fabric.

---

## Implementation Order (Recommended)

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| 1 | Voice weight logging (STT) | 2–3 days | High — core UX improvement |
| 2 | Natural language workout builder (LLM + tools) | 3–5 days | High — killer feature |
| 3 | TTS rest timer cues | 1 day | Medium — polish |
| 4 | RAG training history queries | 3–4 days | Medium — analytics |
| 5 | Onboarding program generation | 2–3 days | Medium — first impression |
| 6 | Form feedback (vision) | 5–7 days | Future — needs camera + large model |
| 7 | Smart progressive overload | 3–5 days | Future — needs RAG infra |
| 8 | Cross-device delegation | 3–4 days | Future — needs desktop companion |

## Architecture Note

QVAC SDK integrates into PearLift without conflict:
- Both use the **same Hyperswarm instance** — the SDK can share the existing P2P fabric already established for workout sync
- QVAC models are loaded/unloaded on demand — no persistent memory overhead
- All AI processing is **on-device and offline** — matches PearLift's existing privacy stance
- The SDK is a pure JS/TS npm package — no native module conflicts with existing `react-native-bare-kit` or Expo plugins

## Dependencies to Add

```json
{
  "@qvac/sdk": "latest"
}
```

No other new dependencies. QVAC SDK bundles its own runtime and model loaders.
