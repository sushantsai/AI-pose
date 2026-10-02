# PoseCoach — AI pose coach for better photos

Point your phone at a location, get poses that suit it, follow a live sketch overlay with voice coaching, and walk away with a photo that's cropped and captioned for Instagram or Facebook. Solo and couple poses.

## How it works

The app opens straight into the camera (camera-first, like a native camera's pose mode):

```
Camera opens ──► AI reads the scene in the background (Claude Haiku 4.5, 1 call)
                    │
                    ▼
Bottom tray: For you · Solo · Couple  — pose thumbnails, "None", ↻ New picks
                    │  tap a pose
                    ▼
Live view: white body-outline of the pose + one instruction line at the top
           + hand-written notes on the limbs that need to move ("raise arm ↑")
   │  on-device MoveNet MultiPose (free, ~15 fps, up to 6 people)
   ▼
Outline turns green when matched → auto-capture (optional timer, voice coaching)
   ▼
Gallery → smart crop (IG 4:5 / Story 9:16 / FB 1:1) + AI captions & hashtags → Save / Share
```

"For you" switches between solo and couple picks automatically when two people are in frame.

| Part | What runs where | Cost |
|---|---|---|
| Pose tracking & matching | On device — MoveNet MultiPose Lightning via TFLite (GPU delegate when available) | Free |
| Scene → pose recommendations | Supabase Edge Function → Claude Haiku 4.5 (image downscaled to 512 px) | ≈ $0.004 / scan |
| Captions & hashtags | Same function | ≈ $0.002 / photo |
| Offline fallback | Built-in recommender + caption templates | Free |

A full session (1 scan + 1 caption set) costs about **$0.006 in AI**. Each user gets a daily quota (40 scans and 40 caption sets per day by default) enforced in Postgres, so spend per user is capped.

## Project layout

```
src/app/                 Screens (Expo Router)
  index.tsx              Camera home: scene read, pose tray, outline, notes, scoring, capture
  pose/[id].tsx          Pose cues sheet (from the ⓘ on the instruction line)
  review.tsx             Best shot, platform crop, captions, save/share
  onboarding.tsx, history.tsx, settings.tsx
src/components/          PoseOutline (body contour + limb notes), PoseTray, ui
src/core/                Pure TypeScript, fully unit-tested
  poseDsl.ts             Poses authored as joint angles → keypoints
  poses/                 The pose library (solo.ts, couple.ts)
  outline.ts             Body-contour geometry for the pose outline
  annotations.ts         Limb notes ("raise arm ↑") and the instruction line
  movenet.ts             Model output decoding + frame→screen mapping
  matching.ts            Mirror-tolerant pose scoring, hints, framing, couples
  capture.ts             Auto-capture state machine
  crop.ts                Smart crop per platform
  recommend.ts           Offline pose recommender
src/features/coach/usePoseDetector.ts   Camera frame → MoveNet (worklet)
supabase/functions/coach/               Edge function (Claude Haiku 4.5)
supabase/functions/_shared/             Contract shared by app + function
supabase/migrations/                    Per-user daily AI quota
assets/models/movenet_multipose_256.tflite
```

## Getting started

Requirements: Node 20+, an iPhone or Android phone, and either Xcode / Android Studio or an [EAS](https://expo.dev/eas) account. The app uses native camera + ML modules, so it needs a **development build** — Expo Go won't work.

```bash
npm install
cp .env.example .env.local        # optional: add Supabase URL + key for AI features
npx expo run:ios --device         # or: npx expo run:android --device
# or build in the cloud:
npx eas-cli@latest build --profile development --platform ios
```

Without Supabase settings the app runs fully offline (manual location pick, built-in suggestions and captions).

### Enable the AI coach (Supabase + Claude)

The function authenticates the caller from their (anonymous) session, then spends the per-user daily quota with the service role; the quota function is not callable by users.

1. Create a Supabase project and enable **Anonymous sign-ins** (Authentication → Sign In / Providers).
2. Apply the migrations and deploy the function:
   ```bash
   npx supabase link --project-ref <your-ref>
   npx supabase db push
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   npx supabase functions deploy coach
   ```
3. Put the project URL and publishable/anon key in `.env.local`.

Optional function secrets: `DAILY_SCENE_LIMIT`, `DAILY_POSTKIT_LIMIT` (default 40 each per user per day).

### Bring your own model (OpenRouter or any OpenAI-compatible API)

The model provider is chosen entirely by Supabase secrets — no app rebuild needed. Set them in
Dashboard → Edge Functions → Secrets (or `npx supabase secrets set NAME=value`):

| Secret | Value | Notes |
|---|---|---|
| `AI_PROVIDER` | `anthropic` (default), `openrouter`, or `openai` | `openai` = any OpenAI-compatible `/chat/completions` API |
| `AI_BASE_URL` | e.g. `https://openrouter.ai/api/v1` | Set automatically for `openrouter`; optional for `anthropic` (proxies) |
| `AI_API_KEY` | the provider's key | For `anthropic`, `ANTHROPIC_API_KEY` also works |
| `AI_MODEL` | e.g. `google/gemini-2.5-flash`, `anthropic/claude-haiku-4.5`, `openai/gpt-4o-mini` | Must be a **vision** model. Default for anthropic: `claude-haiku-4-5` |

Example (OpenRouter): `AI_PROVIDER=openrouter`, `AI_API_KEY=sk-or-v1-…`, `AI_MODEL=google/gemini-2.5-flash`.

The function asks for strict JSON-schema output and automatically retries with prompt-only JSON if a
model doesn't support it; every answer is validated before it reaches the app. Its log line
`coach ready: provider=… model=… key=…` shows the active config (key type and length only, never the key).

## Development

```bash
npm test                 # unit tests (pose engine, matching, crop, contract, real-model fixture)
npm run typecheck
npm run lint
npm run check:functions  # Deno type-check of the edge function
npm run gen:catalog      # after editing poses: refresh the catalog the AI chooses from
npm run render:poses     # contact sheet of every pose sketch → poses.svg
npx tsx scripts/render-outlines.ts > outlines.svg   # the outlines as drawn on camera
```

### Adding a pose

Poses are joint angles, not coordinates (`src/core/poses/builders.ts` has the vocabulary). Add an entry to `solo.ts` or `couple.ts`, then run `npm run gen:catalog`, `npm run render:poses` to eyeball it, and `npm test` (the library test checks every sketch stays on screen and the AI catalog is in sync).

### The pose model

`assets/models/movenet_multipose_256.tflite` is Google's MoveNet MultiPose Lightning (Apache-2.0) with its dynamic input patched to a fixed 256×256, because the TFLite runtime on device cannot resize inputs. `scripts/prepare-movenet.py` reproduces it.

## Status and known gaps

- Verified here: unit tests, type-checks (app + Deno function), lint, Android JS bundle export, and `expo prebuild` for iOS and Android. The model was run on a real photo to confirm decoding.
- **Not yet verified on a physical device.** The first device run should confirm: VisionCamera v5 frame thread + resizer + TFLite together, the GPU delegate fallback, front-camera mirroring of the overlay, and photo-to-frame crop alignment.
- No accounts, payments or analytics yet; anonymous sessions only.
