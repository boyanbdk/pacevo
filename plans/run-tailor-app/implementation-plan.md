# Run Tailor App Implementation Plan

## Goal

Build Run Tailor as a responsive web app that works well on phone and desktop. A user can upload a workout screenshot or paste workout text, provide tailoring inputs, review the generated adjusted workout, request changes, save the workout, and export it as an image, DOCX, or PDF.

The first version focuses on running workouts. The architecture should leave room for cycling, gym, and other activity types later.

## Confirmed Product Decisions

- Platforms: responsive web app for mobile and desktop.
- Input sources: image upload and manual text paste.
- Parsing: automatically extract workout structure from the image/text, then let the user review the generated adjusted workout.
- Satisfaction loop: after output is generated, ask whether the user is satisfied. If not, the user describes what to change and a new adjusted workout is generated.
- Required tailoring inputs:
  - Run context: free run or treadmill.
  - Output format: treadmill time-based, treadmill distance-based, or general running plan.
  - Easy/warm-up pace.
  - Cool-down pace.
  - Optional walking rest pace. This is required when the workout includes walking rests and useful when the workout is treadmill-based, but should not block workouts without rests.
  - Feeling score from `1-10`.
  - Desired push: `easy`, `normal`, or `hard`.
- Defaults: remember easy/warm-up pace and cool-down pace, but keep them editable.
- Workout logic: start from the current `run-tailor` algorithm.
- Overrides: use the satisfaction loop first; manual per-step editing can be added as a follow-up once the core flow is stable.
- Output view: support both table and step-by-step list, configurable in settings.
- Exports: image, DOCX, and PDF.
- Export style: should look close to the app screen and use branded colors.
- Persistence: save workouts.
- Authentication: login required.
- Design direction: closer to Runna than a plain utility app.
- Deployment: local first, with future public deployment.
- Repo: build inside the existing `workout` GitHub repository.

## Recommended Stack

- App framework: Next.js with TypeScript.
- Styling: Tailwind CSS with a small internal design system.
- App shell: PWA-ready responsive web app, so it can be used from mobile home screens later.
- Auth: Auth.js/NextAuth-style email/password or magic-link compatible structure. For local MVP, use credentials auth with hashed passwords.
- Database: Prisma with SQLite locally, designed so it can move to Postgres later.
- Image parsing:
  - V1: server-side image-to-structured-workout extraction behind a provider interface.
  - Keep a fallback manual text path so the app still works if image parsing is uncertain.
- Export:
  - Image: render the adjusted workout card and export that DOM node to PNG.
  - PDF: render the same branded output template to PDF.
  - DOCX: generate a structured document from the same workout data, matching the branded content as closely as DOCX allows.
- Testing:
  - Unit tests for pace/speed/duration/readiness logic.
  - Component tests for key states.
  - Playwright for mobile/desktop end-to-end upload, generate, save, and export flows.

## GStack Execution Workflow

Use gstack as the quality pipeline for each implementation phase:

1. Planning: keep this document as the source of truth.
2. Design review: run a gstack design review after the first UI shell and again after export templates exist.
3. Engineering review: run a gstack engineering review before wiring parsing/export/auth together.
4. QA: run gstack QA after each major vertical slice.
5. Ship: when ready, use the gstack ship flow to commit, push, and prepare the PR.

## Information Architecture

### Public

- `/login`: login form.
- `/register`: account creation for local MVP.

### Authenticated

- `/app`: dashboard with recent saved workouts and a primary "New workout" action.
- `/app/new`: upload/paste and tailoring flow.
- `/app/workouts/[id]`: saved workout detail, regenerate, edit settings, export.
- `/app/settings`: default paces, preferred output view, brand/export preferences.

## Core User Flow

1. User logs in.
2. User chooses "New workout".
3. User uploads a screenshot or pastes workout text.
4. App extracts the workout into editable structured data:
   - workout title
   - sport/activity type
   - warm-up
   - session blocks
   - intervals/repeats
   - rests
   - cool down
   - target paces and pace windows
5. App asks for tailoring inputs:
   - free run or treadmill
   - output format
   - easy/warm-up pace
   - cool-down pace
   - walking rest pace when applicable
   - feeling `1-10`
   - push level
6. App generates adjusted workout.
7. App asks: "Are you satisfied with this?"
8. If yes:
   - save workout
   - export image/PDF/DOCX
9. If no:
   - user describes what feels wrong
   - app regenerates from the same structured workout plus feedback
   - keep previous versions in a simple revision history

## Data Model

### User

- `id`
- `email`
- `passwordHash`
- `createdAt`
- `updatedAt`

### UserSettings

- `userId`
- `defaultEasyPace`
- `defaultCooldownPace`
- `defaultRestWalkSpeed`
- `preferredOutputMode`
- `preferredDisplayStyle`: `table` or `steps`
- `brandTheme`

### Workout

- `id`
- `userId`
- `title`
- `activityType`: initially `running`
- `sourceType`: `image` or `text`
- `sourceText`
- `sourceImagePath`
- `parsedWorkoutJson`
- `createdAt`
- `updatedAt`

### WorkoutAdjustment

- `id`
- `workoutId`
- `inputsJson`
- `adjustedWorkoutJson`
- `displayStyle`
- `feedbackPrompt`
- `revisionNumber`
- `createdAt`

## Tailoring Engine

Move the current `running/run-tailor/scripts/run_tailor.py` rules into app source as a TypeScript domain module. Keep the Python script as reference until parity tests pass.

Suggested modules:

- `src/domain/pace.ts`
  - parse pace
  - format pace
  - pace to km/h
  - distance/time conversions
  - round up to 10 seconds
- `src/domain/workout-schema.ts`
  - typed workout blocks
  - interval/repeat/rest models
- `src/domain/readiness.ts`
  - feeling/push adjustment lane
- `src/domain/run-tailor.ts`
  - generated adjusted workout
- `src/domain/export-model.ts`
  - canonical render model shared by app screen and exports

Important rule: the export template, app output card, PDF, DOCX, and image export should all render from the same adjusted workout model.

## Parsing Strategy

Use a two-stage parsing pipeline:

1. Extract raw workout text from uploaded image or pasted input.
2. Normalize raw workout text into structured workout JSON.

The parser must return uncertainty flags:

- missing warm-up/cool-down
- unclear rest duration
- unclear repeat count
- missing pace window
- unknown workout type

If uncertainty exists, show an "Review extracted workout" step before tailoring. Do not silently guess important workout structure.

## UI Plan

### Visual Direction

Use a polished running-app aesthetic closer to Runna:

- dark-first interface with bright brand accents
- energetic but controlled color
- large readable workout cards
- clear step hierarchy for intervals and blocks
- mobile-first upload flow
- desktop dashboard with denser saved workout history

Avoid making it feel like a generic document generator. The core object on screen should be the adjusted workout card.

### Key Components

- `AppShell`
- `WorkoutUploader`
- `WorkoutTextInput`
- `ExtractedWorkoutReview`
- `TailoringInputForm`
- `AdjustedWorkoutCard`
- `WorkoutStepTable`
- `WorkoutStepList`
- `SatisfactionPrompt`
- `ExportMenu`
- `SavedWorkoutList`
- `SettingsForm`

## Export Plan

### Image Export

Render the branded `AdjustedWorkoutCard` and export it as PNG. This should match the visible app card as closely as possible.

### PDF Export

Use the same render model as the workout card. The PDF should include:

- workout title
- original workout summary
- user inputs
- adjusted workout
- notes/revision feedback when relevant

### DOCX Export

Use a structured document:

- heading and metadata
- user inputs
- adjusted workout table
- notes

DOCX does not need to be pixel-identical to the app, but it should use the same brand colors and content hierarchy.

## Implementation Phases

### Phase 0: App Scaffold

1. Create a Next.js TypeScript app inside the repo.
2. Add Tailwind CSS.
3. Add formatting, linting, and test scripts.
4. Add a basic responsive app shell.
5. Confirm mobile and desktop layouts render locally.

Acceptance criteria:

- Local dev server runs.
- `/login`, `/app`, and `/app/new` routes exist.
- App shell is responsive.

### Phase 1: Domain Logic

1. Port pace conversion and readiness logic from `run_tailor.py` to TypeScript.
2. Define workout and adjusted workout schemas.
3. Add unit tests for:
   - pace parsing
   - km/h conversion
   - time rounding
   - distance-based output
   - feeling/push lane adjustments
   - interval progression examples

Acceptance criteria:

- Existing examples can be reproduced by tests.
- The domain module does not depend on React or database code.

### Phase 2: Manual Input MVP

1. Build pasted-text workout input.
2. Add a simple structured workout editor/review screen.
3. Build tailoring input form with remembered defaults.
4. Generate adjusted workout card.
5. Add satisfaction prompt and regeneration feedback field.

Acceptance criteria:

- User can paste a workout and generate an adjusted output.
- User can say not satisfied and regenerate with feedback.
- Table/list display preference works.

### Phase 3: Auth And Persistence

1. Add local auth.
2. Add Prisma with SQLite.
3. Persist user settings.
4. Save workouts and revisions.
5. Add dashboard with recent workouts.

Acceptance criteria:

- User can register/login locally.
- Saved workouts appear after refresh.
- Defaults prefill but remain editable.

### Phase 4: Image Upload And Parsing

1. Add image upload UI.
2. Store uploaded source image locally.
3. Extract raw text/structure through a parser provider interface.
4. Show extracted workout review before tailoring.
5. Add uncertainty flags and correction fields.

Acceptance criteria:

- User can upload a screenshot.
- App extracts a structured workout or asks for correction.
- The same tailoring flow works after image extraction.

### Phase 5: Export System

1. Implement PNG export from the branded workout card.
2. Implement PDF export.
3. Implement DOCX export.
4. Add export menu and export states.
5. Test exports on mobile and desktop layouts.

Acceptance criteria:

- Image, PDF, and DOCX exports work for all example workouts.
- Export content matches the current adjusted workout revision.
- Branded colors are used consistently.

### Phase 6: Polish, QA, And Local Release

1. Run gstack QA on the full local app.
2. Fix mobile layout issues.
3. Fix export rendering edge cases.
4. Add seed/demo workouts from `running/examples/`.
5. Update README with local setup and app usage.

Acceptance criteria:

- Full flow works on mobile viewport and desktop viewport.
- No console errors during core flow.
- README explains how to run the app locally.

## Future Phases

- Public deployment.
- Cloud database and production auth provider.
- Better manual step editing.
- Calendar/schedule view.
- Training history and progress-aware pace defaults.
- Cycling workout tailoring.
- Gym workout tailoring.
- Garmin/TrainingPeaks/Runna import integrations.

## Risks And Decisions To Watch

- Image parsing quality: the app must show review/correction before tailoring.
- Export fidelity: image and PDF should share a render model to avoid drift.
- Auth scope: local credentials are fine for MVP, but public deployment should revisit auth/security.
- Workout algorithm trust: users need to see why paces changed, especially when feeling and push conflict.
- Mobile ergonomics: upload, review, and export must be usable one-handed on a phone.

## First Build Order

1. Scaffold app and routes.
2. Port `run-tailor` logic to TypeScript with tests.
3. Build manual text flow end to end.
4. Add auth/settings/save.
5. Add image upload and extraction.
6. Add exports.
7. Run gstack QA and polish.
