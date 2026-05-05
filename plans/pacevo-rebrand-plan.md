# Pacevo Rebrand Implementation Plan

Date: 2026-05-05
Status: Done

## Source Brand Direction

New product name: **Pacevo**

Motto: **Plan. Adapt. Learn.**

Logo direction from supplied assets:

- Primary mark: stylized neon volt `P` with speed strokes inside a circular outline.
- Primary dark lockups:
  - `/Users/boyanbudakov/Downloads/ChatGPT Image May 5, 2026 at 11_48_06 AM.png`
  - `/Users/boyanbudakov/Downloads/ChatGPT Image May 5, 2026 at 11_51_44 AM (1).png`
  - `/Users/boyanbudakov/Downloads/ChatGPT Image May 5, 2026 at 11_51_44 AM (2).png`
- Light-background variants:
  - `/Users/boyanbudakov/Downloads/ChatGPT Image May 5, 2026 at 11_51_45 AM (3).png`
  - `/Users/boyanbudakov/Downloads/ChatGPT Image May 5, 2026 at 11_51_45 AM (4).png`

Brand interpretation:

- Pacevo is not just a workout converter. The app has grown into a running coach that helps runners plan training, adapt workouts, and learn from feedback.
- The old name, Run Tailor, maps narrowly to workout tailoring. Pacevo should cover the full product: dashboard, plan builder, workout generator, tailoring, session logging, imports, adaptations, exports, settings, and docs.
- The motto should appear where it reinforces product comprehension, not as repeated decoration on every screen.

## Rebrand Goals

1. Replace all user-facing Run Tailor references with Pacevo.
2. Update the app shell, auth experience, metadata, exported artifacts, README, planning docs, and local skills references.
3. Introduce a brand system that can render the logo correctly in dark UI, light exports, mobile topbar, auth hero, favicons, and generated documents.
4. Preserve existing data for users with `run-tailor:*` localStorage keys.
5. Keep internal domain terminology stable where it describes behavior, unless the name itself is brand-specific.
6. Verify every route and export surface after the rebrand.

## Product Positioning

Primary one-liner:

> Pacevo helps runners plan smarter, adapt daily, and learn from every session.

Short app description:

> Adaptive running plans, workout tailoring, and session feedback in one local training cockpit.

Auth hero copy:

> Plan your race build, adapt each run to today, and learn from the feedback loop.

Dashboard subcopy:

> Today&apos;s run, weekly progress, and what Pacevo learned from your recent training.

Export brand line:

> PACEVO / PLAN. ADAPT. LEARN.

## Current App Inventory

Framework and app shape:

- Next.js app router.
- Main app routes:
  - `/login`
  - `/register`
  - `/app`
  - `/app/new`
  - `/app/tailoring`
  - `/app/workouts/[id]`
  - `/app/plans`
  - `/app/plans/new`
  - `/app/plans/[id]`
  - `/app/plans/[id]/sessions/[sessionId]`
  - `/app/settings`
- Major reusable components:
  - `src/components/AppShell.tsx`
  - `src/components/AuthForm.tsx`
  - `src/components/AuthGate.tsx`
  - `src/components/AdjustedWorkoutCard.tsx`
  - `src/components/ExportMenu.tsx`
- Brand-sensitive libraries:
  - `src/lib/storage.ts`
  - `src/lib/plan-storage.ts`
  - `src/lib/export.ts`
  - `src/lib/plan-display.ts`
  - `src/lib/training-dashboard.ts`
- Current brand strings:
  - `Run Tailor`
  - `RUN TAILOR`
  - `RT`
  - `run-tailor-app`
  - `run-tailor:*` localStorage keys
  - `running/run-tailor/` skill references

## Brand System Tasks

### Logo Assets

Create a dedicated brand asset folder:

- `public/brand/pacevo-mark-dark.png`
- `public/brand/pacevo-mark-light.png`
- `public/brand/pacevo-lockup-dark.png`
- `public/brand/pacevo-lockup-light.png`
- `public/brand/pacevo-social-card.png`
- `public/favicon.ico`
- `public/icon.svg` or `public/icon.png`
- `public/apple-touch-icon.png`

Implementation notes:

- Use the circular mark for small surfaces: sidebar, mobile topbar, favicon, app icon.
- Use the horizontal lockup where there is enough width: auth hero, README screenshots if added, social card.
- Crop or regenerate assets into transparent PNG/WebP where possible. The current images include black or white backgrounds, so do not place them directly into tight UI controls unless the background matches.
- Keep the existing text fallback while images load.

### Color Tokens

Current tokens in `src/app/globals.css`:

- `--bg: #111417`
- `--panel: #171d21`
- `--brand: #c9ff40`
- `--brand-2: #28d2ae`

Pacevo token plan:

- Keep volt as the primary color because it matches the logo.
- Reduce teal prominence unless needed for semantic contrast. Pacevo should read as black, graphite, volt, white, and small secondary accents.
- Add explicit brand tokens:
  - `--pacevo-volt`
  - `--pacevo-ink`
  - `--pacevo-graphite`
  - `--pacevo-mist`
  - `--pacevo-positive`
  - `--pacevo-warning`
  - `--pacevo-danger`
- Map legacy variables to the new tokens initially so the rebrand can land without a full CSS rewrite.

### Typography And Tone

Keep the current system font stack for speed and reliability.

Tone rules:

- More coach-like and adaptive.
- Less utility-only "converter" language.
- Avoid making Pacevo sound like medical advice or a guaranteed performance predictor.
- Use "plan", "adapt", and "learn" consistently for the three product pillars.

## Implementation Phases

## Phase 1: Brand Constants And Assets

Goal: create one source of truth for brand naming and asset references.

Files:

- `src/lib/brand.ts` new file
- `src/app/layout.tsx`
- `src/app/globals.css`
- `public/brand/*` new files

Tasks:

1. Add `src/lib/brand.ts`:
   - `BRAND_NAME = "Pacevo"`
   - `BRAND_MOTTO = "Plan. Adapt. Learn."`
   - `BRAND_DESCRIPTION = "Adaptive running plans, workout tailoring, and session feedback in one local training cockpit."`
   - `BRAND_EXPORT_LABEL = "PACEVO / PLAN. ADAPT. LEARN."`
   - asset path constants for mark and lockup variants.
2. Copy or process supplied image files into `public/brand`.
3. Update Next metadata in `src/app/layout.tsx`:
   - title: `Pacevo`
   - description: brand description
   - theme color: keep dark graphite or use Pacevo ink.
4. Add favicon and touch icon references if using Next metadata icons.
5. Update CSS brand tokens.

Acceptance criteria:

- No user-facing component imports hard-coded brand strings directly.
- Browser tab title says Pacevo.
- Favicon/app icon is Pacevo-branded.

## Phase 2: App Shell And Navigation

Goal: make the product feel renamed immediately in every authenticated screen.

Files:

- `src/components/AppShell.tsx`
- `src/components/AuthGate.tsx`
- `src/app/globals.css`

Tasks:

1. Replace sidebar `RT` mark with the Pacevo mark image.
2. Replace sidebar text `Run Tailor` with `Pacevo`.
3. Replace mobile topbar brand.
4. Update loading state from `Loading Run Tailor...` to `Loading Pacevo...`.
5. Consider whether nav labels should stay task-oriented:
   - `Dashboard` stays.
   - `New workout` stays unless changed to `Build workout`.
   - `Tailor workout` can become `Adapt workout` for stronger alignment with the motto.
   - `Training plans` can become `Plans`.
6. Keep settings available but not over-prominent, matching the existing plan docs that demote settings from primary day-to-day navigation.

Acceptance criteria:

- Desktop and mobile shell both show Pacevo.
- Logo does not stretch, crop badly, or create layout shift.
- Existing active nav logic still works.

## Phase 3: Auth And First Impression

Goal: make `/login` and `/register` introduce the complete Pacevo product instead of the old workout-tailoring MVP.

Files:

- `src/components/AuthForm.tsx`
- `src/app/login/page.tsx`
- `src/app/register/page.tsx`
- `src/app/globals.css`

Tasks:

1. Replace auth hero mark and name with Pacevo logo.
2. Replace current copy:
   - Old: "Convert a coach plan into a clear treadmill or outdoor execution card for how you feel today."
   - New: "Plan your race build, adapt each run to today, and learn from every feedback loop."
3. Update metric row:
   - `Plan` / `Race-ready weeks`
   - `Adapt` / `Today&apos;s readiness`
   - `Learn` / `Feedback loop`
4. Keep auth form labels unchanged unless tone polish is needed.
5. Replace "Local MVP account storage" with a less prototype-coded line:
   - "Local account storage keeps your training workspace on this device."

Acceptance criteria:

- First viewport says Pacevo and communicates the full app.
- Motto is visible on auth without being repeated in every form control.

## Phase 4: Dashboard Copy

Goal: align the landing surface with Pacevo&apos;s plan/adapt/learn promise.

Files:

- `src/app/app/page.tsx`
- `src/lib/training-dashboard.ts`

Tasks:

1. Update page subcopy:
   - "Today&apos;s run, weekly progress, and what Pacevo learned from your recent training."
2. Empty state:
   - "No active training plan" can stay.
   - Body should mention Pacevo building a plan, then adapting from logs and feedback.
3. Feedback prompt:
   - "Rate your latest workout" can stay.
   - Supporting copy can become "Pacevo uses feedback to shape future sessions."
4. Recent activity labels should stay clear and factual.
5. Ensure no `Run Tailor` remains in dashboard helpers or activity details.

Acceptance criteria:

- Dashboard reads as the Pacevo cockpit.
- No change to plan status, adaptation, or completed-session behavior.

## Phase 5: Workout Generation Surface

Goal: make `/app/new` feel like Pacevo builds an appropriate run, not a generic recipe picker.

Files:

- `src/app/app/new/page.tsx`
- `src/domain/training-plan/workout-recipes.ts`

Tasks:

1. Consider title change:
   - Option A: keep `New workout`
   - Option B: `Build workout`
   - Recommendation: use `Build workout` in page H1, keep nav as `New workout` if user familiarity matters.
2. Update subcopy:
   - "Choose a workout type and duration. Pacevo will suggest sessions that fit today."
3. Update empty state:
   - "Choose a type and duration, then let Pacevo suggest options."
4. Save button can stay `Save workout`.
5. Domain recipe descriptions do not require brand language unless shown prominently.

Acceptance criteria:

- One-off workout flow uses Pacevo voice but does not overbrand every card.
- Recipe selection remains deterministic and tests stay stable.

## Phase 6: Workout Adaptation Surface

Goal: shift old "tailor" language toward Pacevo&apos;s "Adapt" pillar while preserving route compatibility.

Files:

- `src/app/app/tailoring/page.tsx`
- `src/domain/run-tailor.ts`
- `src/domain/planned-session-tailoring.ts`
- `src/domain/workout-schema.ts`
- `running/run-tailor/*`

Tasks:

1. User-facing label:
   - Page H1: `Adapt workout`
   - Nav: `Adapt workout`
   - Keep route `/app/tailoring` initially for backward compatibility.
2. Update subcopy:
   - "Paste a workout, upload a screenshot, or pick a planned session. Pacevo adapts it to how you feel today."
3. Step labels:
   - `1. Source` can stay.
   - `2. Review extracted workout` can stay.
   - `3. Tailoring inputs` should become `3. Adaptation inputs`.
4. Buttons:
   - `Generate adjusted workout` can become `Generate adapted workout`.
   - `Save to plan session` stays.
5. Internal function `tailorWorkout` can remain for now because it is domain behavior and has many tests.
6. Create a follow-up optional refactor plan to rename `run-tailor` internals to `workout-adapter` only after the user-facing rebrand is stable.

Acceptance criteria:

- No visible "Tailor workout" remains unless intentionally kept for route/history docs.
- Existing tests around `run-tailor` do not require mass churn.

## Phase 7: Workout Detail And Cards

Goal: update saved workout detail, regenerated cards, and visual exports.

Files:

- `src/app/app/workouts/[id]/page.tsx`
- `src/components/AdjustedWorkoutCard.tsx`
- `src/components/ExportMenu.tsx`
- `src/lib/export.ts`

Tasks:

1. Replace card kicker:
   - Old: `Run Tailor / {workout.lane}`
   - New: `Pacevo / {workout.lane}` or `Pacevo Adapt / {workout.lane}`
2. Replace export labels:
   - Old PDF: `RUN TAILOR / ...`
   - New PDF: `PACEVO / ...`
   - Old DOCX: `Run Tailor / ...`
   - New DOCX: `Pacevo / ...`
3. Add motto in a subdued position in workout PDF/DOCX:
   - `Plan. Adapt. Learn.`
4. Check PNG export background against the neon mark and dark card theme.
5. Keep filenames based on workout title, not brand name.

Acceptance criteria:

- PNG, PDF, and DOCX exports contain Pacevo branding.
- Export styling remains legible on dark backgrounds.

## Phase 8: Training Plans List

Goal: make `/app/plans` fit the new brand without sacrificing clarity.

Files:

- `src/app/app/plans/page.tsx`

Tasks:

1. Title can stay `Training plans` or become `Plans`.
2. Subcopy:
   - "Your personalised race-prep plans." can become "Race builds Pacevo can adapt as you train."
3. Empty state:
   - "No training plans yet." stays.
   - Button can stay `Build your first plan`.
4. Active/archive labels stay unchanged.

Acceptance criteria:

- Plans list speaks in Pacevo terms but stays scannable.

## Phase 9: Plan Onboarding

Goal: rebrand the six-step plan builder and align it with "Plan".

Files:

- `src/app/app/plans/new/page.tsx`

Tasks:

1. Page header/back surface:
   - Ensure any page title/subtitle says Pacevo or "Build your plan" as appropriate.
2. Step names can stay:
   - Goal
   - Training
   - Performance
   - Preferences
   - Schedule
   - Health
3. Final button:
   - Old: `Build my plan`
   - Option: `Build my Pacevo plan`
   - Recommendation: `Build my plan` is cleaner; reinforce Pacevo in header copy instead.
4. Generation error copy can stay factual.
5. Update any "we&apos;ll" wording to Pacevo where it improves clarity:
   - "Pacevo will verify this against your training data and use the safer estimate."

Acceptance criteria:

- Onboarding still feels like a form, not a marketing page.
- Stepper text remains compact on mobile.

## Phase 10: Plan Detail, Calendar, Imports, Adaptations, History

Goal: apply the new brand to every tab of `/app/plans/[id]`.

Files:

- `src/app/app/plans/[id]/page.tsx`
- `src/lib/plan-display.ts`
- `src/lib/export.ts`

Tasks:

1. Page heading can remain `{Goal} plan`.
2. Tabs:
   - `Plan`
   - `Adaptations`
   - `Import runs`
   - `History`
   These can stay.
3. Adaptations intro:
   - "Every time Pacevo adjusts based on your logged sessions, the reason is recorded here."
4. No-adaptations state:
   - "No adaptations yet. Log sessions and Pacevo will adjust automatically."
5. Plan summary card labels:
   - `Goal`, `Plan`, `Settings` can stay.
6. Export plan PDF/DOCX:
   - Title can remain `{Goal} Training Plan`.
   - Add Pacevo footer/header or subtitle:
     - `PACEVO / PLAN. ADAPT. LEARN.`
7. Imported activity panel copy should stay provider-neutral.

Acceptance criteria:

- Plan detail surfaces use Pacevo name only where it clarifies the adaptive system.
- Exports are branded.

## Phase 11: Session Detail, Logging, Feedback, Swaps

Goal: make learning and adaptation copy explicitly Pacevo-owned.

Files:

- `src/app/app/plans/[id]/sessions/[sessionId]/page.tsx`

Tasks:

1. Session header can stay activity-focused.
2. Log form:
   - `Log this session`, `Save log`, `Update log` stay.
3. Adaptation banner:
   - `Plan adapted` can stay.
   - Body is generated by domain rules and should remain plain English.
4. Feedback controls:
   - Use "Pacevo learns from this feedback" where currently generic.
5. Legacy metadata message:
   - Old: "This older session has no recipe metadata, so feedback cannot be learned from it."
   - New: "This older session has no recipe metadata, so Pacevo cannot learn from this feedback."
6. Swap options:
   - Do not overbrand; focus on workout stimulus and safety.

Acceptance criteria:

- Session detail reinforces "Learn" without making every label longer.
- Feedback and swap behavior unchanged.

## Phase 12: Settings

Goal: make settings part of Pacevo but keep them utility-first.

Files:

- `src/app/app/settings/page.tsx`
- `src/domain/workout-schema.ts`
- `src/lib/storage.ts`

Tasks:

1. Header:
   - `Settings` can stay.
   - Subcopy: "Defaults stay editable on every Pacevo workout."
2. `brandTheme: "volt"` currently exists. Decide whether to:
   - Keep `"volt"` as the theme ID, or
   - Rename to `"pacevo-volt"` with migration.
3. Recommendation: keep `"volt"` until theme choices exist; it is not visibly user-facing.
4. Ensure settings explanations say "Pacevo" only where needed.

Acceptance criteria:

- Settings remain clear and compact.
- Existing settings load without migration errors.

## Phase 13: Storage And Data Migration

Goal: preserve user data while gradually moving away from `run-tailor:*` keys.

Files:

- `src/lib/storage.ts`
- `src/lib/plan-storage.ts`
- `src/lib/storage.test.ts`
- `src/lib/plan-storage.test.ts`

Current keys:

- `run-tailor:user`
- `run-tailor:settings`
- `run-tailor:workouts`
- `run-tailor:plans`

New key plan:

- `pacevo:user`
- `pacevo:settings`
- `pacevo:workouts`
- `pacevo:plans`

Migration plan:

1. Add constants for new keys and legacy keys.
2. Read new key first.
3. If new key is missing, read legacy key.
4. On next save, write only the new key.
5. Do not delete legacy keys in the first rebrand release.
6. Add tests proving:
   - Legacy settings load.
   - Legacy workouts load.
   - Legacy plans load.
   - Saving writes Pacevo keys.
   - Corrupt legacy JSON still fails safely as today.

Acceptance criteria:

- Existing local users do not lose plans, workouts, settings, or auth gate state.
- Tests cover migration before changing defaults.

## Phase 14: Internal Names, Package Metadata, And Imports

Goal: distinguish user-facing brand from internal domain code.

Files:

- `package.json`
- `package-lock.json`
- `src/domain/run-tailor.ts`
- `src/domain/run-tailor.test.ts`
- `running/run-tailor/SKILL.md`
- `running/run-tailor/agents/openai.yaml`
- `running/run-tailor/scripts/run_tailor.py`

Tasks:

1. Rename package:
   - `run-tailor-app` to `pacevo-app`.
2. Keep source file `src/domain/run-tailor.ts` for the first pass unless the user explicitly wants internal rename now.
3. Update local skill display metadata:
   - Display name: `Pacevo Workout Adapter` or `Pacevo Adapt`
   - Short description should mention adapting running workouts.
4. Keep the folder `running/run-tailor/` initially if it is referenced by existing docs and scripts; add a note that it is the legacy skill origin.
5. Optional later refactor:
   - `src/domain/run-tailor.ts` to `src/domain/workout-adapter.ts`
   - Update imports in app, tests, exports, and planned-session tailoring.

Acceptance criteria:

- Package metadata no longer exposes the old brand.
- Internal rename is either completed safely or deliberately deferred.

## Phase 15: Documentation

Goal: rebrand all repo docs that a user or future agent will read.

Files:

- `README.md`
- `plans/README.md`
- `plans/adaptive-workout-generation/*.md`
- `running/run-tailor/SKILL.md`
- `running/training-plan-generator/SKILL.md`
- `running/run-tailor/agents/openai.yaml`

Tasks:

1. README:
   - Title: `# Pacevo`
   - Intro: "Adaptive running plans, workout tailoring, and feedback-led learning."
   - Replace `Run Tailor Web App` with `Pacevo Web App`.
   - Refresh page table names if nav labels change.
   - Add a short Brand section with motto and asset path.
2. Plan docs:
   - Update product references from Run Tailor to Pacevo.
   - Preserve historical context where useful:
     - "Run Tailor" can appear only when describing legacy architecture or old plans.
3. Skills:
   - Update display names and descriptions.
   - Avoid changing algorithm instructions unless the behavior changes.

Acceptance criteria:

- `rg "Run Tailor|RUN TAILOR|run-tailor-app"` returns only allowed legacy/internal references.
- README accurately describes current routes and brand.

## Phase 16: Visual QA

Goal: catch brand regressions across viewport sizes and export formats.

Routes to verify:

- `/login`
- `/register`
- `/app`
- `/app/new`
- `/app/tailoring`
- `/app/workouts/[id]`
- `/app/plans`
- `/app/plans/new`
- `/app/plans/[id]`
- `/app/plans/[id]/sessions/[sessionId]`
- `/app/settings`

Checks:

1. Desktop sidebar logo is crisp and vertically centered.
2. Mobile topbar logo fits without pushing the action button.
3. Auth hero logo does not pixelate or crop.
4. Volt-on-dark contrast is accessible.
5. Light-background assets are used only on light surfaces.
6. Buttons and labels do not overflow on mobile.
7. Exported workout PNG/PDF/DOCX show Pacevo.
8. Exported plan PNG/PDF/DOCX show Pacevo.
9. No old brand appears in browser tab, loading state, cards, exports, or docs.

Suggested commands:

```bash
npm test
npm run build
rg -n "Run Tailor|RUN TAILOR|run-tailor-app|Loading Run Tailor|RT" src README.md package.json plans running
```

## Phase 17: Release Checklist

Before shipping:

- [x] Brand constants added.
- [x] Assets copied into `public/brand`.
- [x] Metadata updated.
- [x] App shell updated.
- [x] Auth updated.
- [x] Dashboard updated.
- [x] Workout generation updated.
- [x] Workout adaptation updated.
- [x] Workout card updated.
- [x] Workout exports updated.
- [x] Plans list updated.
- [x] Plan onboarding updated.
- [x] Plan detail tabs updated.
- [x] Plan exports updated.
- [x] Session feedback copy updated.
- [x] Settings copy updated.
- [x] Storage migration implemented and tested.
- [x] Package metadata updated.
- [x] README updated.
- [x] Skill docs updated.
- [x] `npm test` passes.
- [x] `npm run build` passes.
- [x] Manual route QA complete on desktop and mobile.
- [x] Export QA complete for PNG, PDF, and DOCX.

## Post-Implementation Design Review

Review date: 2026-05-05
Skill: `/design-review`
Status: DONE_WITH_CONCERNS

The rebrand is broadly in place: metadata uses Pacevo, the shell uses the Pacevo mark, visible source search no longer shows old brand strings in normal app UI, storage migration preserves `run-tailor:*` legacy keys, and PDF/DOCX export code uses the Pacevo brand line.

Two rebrand-specific misses remain:

1. Auth mobile density misses the rebrand's first-impression target. At 375px wide, the auth brand panel renders at roughly 530px high, the form starts around 572px, and the primary submit action lands below the first viewport. The page says Pacevo, but the brand panel dominates the first-run task.
2. Plan week PNG export is not visibly Pacevo-branded. `exportPlanWeekImage()` captures the selected week DOM, but the exported `ContinuousWeek` / `WeekCard` content does not include `PACEVO / PLAN. ADAPT. LEARN.` or the mark. Full-plan PDF and DOCX exports are branded; week PNG export is the gap.

Verification notes:

- `rg "Run Tailor|RUN TAILOR|run-tailor-app|Loading Run Tailor|RT" src README.md package.json plans running` only returned expected legacy/internal/doc references, plus the rebrand plan's own inventory and examples.
- `npm test` passed: 17 test files, 273 tests.
- `npm run build` passed.
- Browser check at `http://localhost:3002/login` showed document title `Pacevo` and no old brand in the visible auth surface.
- Signed-out `/app` redirects to `/login`, so full authenticated route screenshots still need a seeded session or test user to make the "Manual route QA complete" checkbox defensible.

### Phase 18: Rebrand Closure Pass

Files:

- `src/app/globals.css`
- `src/components/AuthForm.tsx`
- `src/app/app/plans/[id]/page.tsx`
- `src/lib/export.ts`

Tasks:

1. Tighten auth first-impression mobile layout:
   - Add a `max-width: 600px` auth override.
   - Reduce auth page padding, brand panel padding, mark size, and hero heading size on narrow screens.
   - Make the proof-point row compact enough that the form heading and first field are visible in the first 375px viewport.
   - Keep the Pacevo mark crisp and avoid adding extra decorative effects.
2. Brand plan week PNG exports:
   - Add a compact export-only Pacevo header or footer inside the DOM region passed to `exportPlanWeekImage()`.
   - Use `BRAND_EXPORT_LABEL` so PNG, PDF, and DOCX share the same export brand language.
   - Verify both desktop `ContinuousWeek` and mobile `WeekCard` export paths, since the current export function can capture either node.
3. Re-run visual QA with evidence:
   - `/login` at 1440px and 375px.
   - `/register` at 1440px and 375px.
   - One authenticated dashboard route at desktop and mobile.
   - One plan detail route at desktop and mobile.
   - Workout PNG/PDF/DOCX export.
   - Plan PNG/PDF/DOCX export.
4. Update the release checklist only after evidence exists:
   - Keep manual route QA checked only if screenshots were captured.
   - Keep export QA checked only if generated files were inspected for Pacevo branding.

Acceptance criteria:

- The auth page still feels like Pacevo, but mobile users reach the form without the brand panel taking over the first viewport.
- Plan week PNG exports visibly carry Pacevo branding.
- The rebrand checklist is backed by repeatable browser and export evidence.

Phase 18 completion evidence:

- Auth screenshots captured at 375px and 1440px for `/login` and `/register` in `/tmp/pacevo-phase18-shots/`.
- 375px auth layout measured `scrollWidth: 375`, form top at 252px, first email field at 400px, and submit button at 539px.
- Authenticated screenshots captured at 375px and 1440px for `/app` and `/app/plans/phase18-plan` in `/tmp/pacevo-phase18-shots/`.
- Plan week PNG exports verified on both desktop `ContinuousWeek` and mobile `WeekCard`; both show `PACEVO / PLAN. ADAPT. LEARN.`.
- Export files generated in `/tmp/pacevo-phase18-downloads/`: workout PNG/PDF/DOCX and plan PNG/PDF/DOCX.
- Plan PDF/DOCX were inspected for `PACEVO / PLAN. ADAPT. LEARN.`; workout PDF/DOCX were inspected for Pacevo branding.

## Review Notes From Gstack Planning Lenses

CEO review:

- Pacevo should be treated as a product expansion, not a cosmetic rename. The name has to cover planning, adaptation, and learning, otherwise the old narrow "workout tailoring" positioning will keep leaking through the UX.

Design review:

- The supplied assets are high-energy and neon. The app should use the mark sparingly and let the interface stay calm and operational. Avoid turning every panel into a glowing logo surface.

Engineering review:

- Storage migration is the highest-risk non-visual part. Do not change `run-tailor:*` localStorage keys without compatibility reads and tests.
- Exports are separate rendering paths and must be audited explicitly.

DX review:

- Future agents will follow README, plan docs, package metadata, and skill names. Rebrand those surfaces or the codebase will keep reintroducing "Run Tailor" in future work.

## Recommended First Implementation PR

Scope:

1. Add brand constants and assets.
2. Update metadata, app shell, auth, loading state, visible cards, and export labels.
3. Add storage key migration tests and implementation.
4. Update README.

Defer:

- Internal source file renames.
- Route rename from `/app/tailoring` to `/app/adapt`.
- Full CSS redesign beyond token cleanup.
- Historical plan doc rewrites beyond product-name references.

This first PR gives users the Pacevo brand everywhere they can see it while keeping behavioral risk low.
