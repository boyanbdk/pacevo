# Coach Plan Rebuild

## Decision

Create a new canonical execution plan based on the legacy implementation plan plus the product corrections from the May 4, 2026 review.

Do not create a `.v2` sequel that waits until the current plan is finished. The current implementation plan has already been partially executed, and the remaining user-facing issues are not polish. Mileage progression, date visibility, intensity defaults, and the new-workout flow affect core trust. Deferring them until after the old plan would compound the wrong product shape.

The legacy plan remains useful as reference for the recipe system, preference loop, swaps, imports, dashboard, and adaptation engine. This plan supersedes its implementation order.

## Inputs Combined

This plan merges three sources:

- Legacy plan: `plans/adaptive-workout-generation/implementation-plan.md`
- Current app audit: training-plan domain, plan views, session detail, workout creation, storage, and tests
- Product critique from the May 4, 2026 review:
  - plan view lacks visible dates
  - mileage progression starts too high and peaks too low later
  - user-facing source/citation messages are not helpful
  - `New workout` and workout tailoring are mixed together
  - easy runs should default to HR/RPE guidance, not pace pressure
  - race estimate input should use structured time controls
  - race estimate distance should be independent from goal race

## Product Position

Run Tailor should feel like a coach, not like an academic plan generator.

The user should be able to answer three questions quickly:

1. What am I doing on a specific date?
2. Why is this safe and appropriate for me?
3. What can I do if today's workout does not fit how I feel?

Visible citations, sudden volume jumps, hidden dates, and pasted demo workouts all work against that.

## Current Implementation Reality

Keep and build on these implemented pieces:

- `WorkoutRecipe` library
- deterministic recipe selection
- workout feedback and preferences
- similar workout swap flow
- adaptive replanning hooks
- dashboard progress model
- GPX/TCX import support
- session detail intensity rendering

Fix or replace these areas:

- volume curve in `build-plan.ts`
- plan calendar/date rendering
- user-facing warning and rationale copy
- race estimate UI and data model
- default intensity display behavior
- `New workout` flow
- settings naming for recovery/cooldown paces

## Non-Negotiable Product Rules

- A plan must never start above the runner's recent weekly average unless the user explicitly confirms the jump.
- Race/level mileage floors are readiness warnings, not automatic week-one targets.
- The highest non-taper mileage should occur before taper and should make training sense for the selected goal.
- Base/build/peak should mainly change workout specificity and intensity mix, not produce a lower peak than early base weeks.
- Dates must be visible anywhere the user chooses or inspects workouts.
- Research sources can live in code/tests/docs, but not in primary user messages.
- Easy and recovery runs default to HR/RPE guidance. Pace is optional reference.
- One-off workout generation and planned-workout tailoring are separate product flows.

## Research Baseline For Mileage

Use conservative, practical constraints rather than a blind "10 percent rule."

Relevant baseline:

- Sudden changes in running load are associated with higher injury risk, but the evidence is limited and should be treated as guardrails, not a precise formula.
- IOC/BJSM load guidance supports managing acute versus chronic load rather than weekly mileage alone.
- Taper evidence supports meaningful volume reduction while maintaining some intensity.
- RPE and talk-test guidance are appropriate defaults for easy effort control.

Implementation implication:

- Start from recent actual training.
- Progress within preference-specific weekly caps.
- Apply deloads without destructive rebounds.
- Keep long runs within a safe percentage of weekly volume.
- Keep quality-count increases separate from volume increases.
- Treat taper as the final reduction from the true pre-taper peak.

## Execution Phases

### Phase 1: Mileage Engine Rebuild

Goal: make generated plans physiologically plausible and trustworthy.

Tasks:

1. Replace `startKm = max(current_weekly_km, floor)` with a baseline model:
   - `recentAverageKm = current_weekly_km`
   - race/level floor becomes a warning or readiness constraint
   - optional explicit confirmation can allow a higher start later
2. Define sustainable peak from:
   - current weekly km
   - goal race
   - level
   - weeks available
   - volume preference
   - difficulty preference
   - injury flags
3. Make `volume_preference` real:
   - gradual: lower weekly cap, lower peak target
   - steady: moderate cap and target
   - progressive: higher cap only when training history supports it
4. Make `session_minutes_cap` real:
   - cap individual sessions where possible
   - if impossible, warn clearly during plan creation
5. Keep deloads, but avoid post-deload rebounds that exceed safe progression from the pre-deload week.
6. Make taper reduce from the actual pre-taper peak, not from a stale theoretical peak.
7. Recompute sessions after any guardrail volume edits so distances and durations stay aligned.

Acceptance criteria:

- A low-mileage runner does not get week-one volume above their recent average by default.
- Peak mileage is greater than early base mileage unless the plan is too short or constrained.
- Build/peak phases do not show a 50 percent drop from base without an explicit taper/deload reason.
- `volume_preference` changes the generated curve in tests.
- `session_minutes_cap` changes session layout or produces a blocking warning.
- No generated warnings contain source citations.

Likely files:

- `src/domain/training-plan/build-plan.ts`
- `src/domain/training-plan/build-plan.test.ts`
- `src/domain/training-plan/types.ts`
- `src/app/app/plans/new/page.tsx`

### Phase 2: Calendar And Date Visibility

Goal: make the plan inspectable by date, not only by week number.

Tasks:

1. Add date range to each week card.
2. Add day-of-month to each desktop calendar cell.
3. Add full date to mobile expanded session rows.
4. Add date range to the selected week header.
5. Add session date to session detail header.
6. Ensure export image includes dates.

Acceptance criteria:

- Desktop plan view shows weekday plus date for every visible day.
- Mobile plan list shows session dates without opening a session.
- Session detail shows the exact session date.
- Week navigation remains unchanged.

Likely files:

- `src/app/app/plans/[id]/page.tsx`
- `src/app/app/plans/[id]/sessions/[sessionId]/page.tsx`
- `src/app/globals.css`
- `src/lib/export.ts`

### Phase 3: User-Facing Copy Cleanup

Goal: remove academic/debug copy from the primary product surface.

Tasks:

1. Remove `Source: ...` from workout rationales.
2. Remove source text from warnings.
3. Replace ACWR warning copy with actionable language.
4. Keep evidence/source comments in code or docs only.
5. Add a centralized copy helper if the same training guidance appears in multiple surfaces.

Acceptance criteria:

- No primary UI string contains `Source:`.
- Plan warnings tell the user what is happening and what to do.
- Session rationale explains training purpose in plain language.

Likely files:

- `src/domain/training-plan/workout-recipes.ts`
- `src/domain/training-plan/build-plan.ts`
- `src/app/app/plans/[id]/page.tsx`
- `src/app/app/plans/[id]/sessions/[sessionId]/page.tsx`

### Phase 4: Intensity Defaults And Recovery Naming

Goal: make easy effort guidance match how runners should execute easy days.

Tasks:

1. Change default app intensity mode away from pace for new users.
2. Keep easy/recovery sessions HR or RPE primary by default.
3. Add setting: show easy-run pace targets.
4. Hide easy/recovery pace targets from primary cards unless the setting is enabled.
5. Rename `Cooldown` user-facing copy to `Recovery`.
6. Migrate persisted settings defensively so old `defaultCooldownPace` continues to work internally.

Acceptance criteria:

- Easy runs default to HR/RPE guidance on new plans.
- Pace references for easy/recovery are hidden by default but can be enabled.
- Settings show `Recovery pace`, not `Cool-down pace`.
- Existing saved settings do not break.

Likely files:

- `src/lib/storage.ts`
- `src/domain/workout-schema.ts`
- `src/app/app/settings/page.tsx`
- `src/app/app/plans/new/page.tsx`
- `src/app/app/plans/[id]/sessions/[sessionId]/page.tsx`
- `src/domain/training-plan/training-intensity.ts`

### Phase 5: Race Estimate Input Rebuild

Goal: make performance input precise and convenient.

Tasks:

1. Replace text time fields with structured `hours`, `minutes`, `seconds` controls.
2. Allow estimate distance selection independent of goal race:
   - 5K
   - 10K
   - half marathon / 21.1K
   - marathon / 42.2K
3. Store estimate as distance plus time, not goal-race-only time.
4. Use Riegel/VDOT conversion to derive goal-appropriate paces from any supported estimate.
5. Keep recent actual race mode separate from estimated current ability.

Acceptance criteria:

- User can build a marathon plan using a 5K estimate.
- User can build a 5K plan using a half-marathon estimate.
- Invalid time values are impossible or blocked before generation.
- Tests cover all four supported estimate distances.

Likely files:

- `src/domain/training-plan/types.ts`
- `src/domain/training-plan/build-plan.ts`
- `src/domain/training-plan/build-plan.test.ts`
- `src/app/app/plans/new/page.tsx`

### Phase 6: Split New Workout From Tailoring

Goal: separate choosing a one-off workout from adapting an already planned workout.

Tasks:

1. Move current paste/upload adjustment flow into a dedicated Tailoring route.
2. Add navigation entry for Tailoring.
3. Rebuild `/app/new` as one-off workout creation:
   - choose type: recovery, easy, tempo, interval, long run
   - choose target by time or distance
   - choose optional intensity preference
   - show 3-10 safe candidate workouts
   - allow save
4. Reuse `WORKOUT_RECIPES` instead of demo workout buttons.
5. Keep screenshot/paste parsing only in Tailoring.

Acceptance criteria:

- `/app/new` no longer shows the four demo workouts as primary choices.
- User can generate multiple candidate workouts by type and duration/distance.
- Tailoring clearly means "adjust today's planned or pasted workout up/down."
- Saved one-off workouts still work with existing history/export screens.

Likely files:

- `src/app/app/new/page.tsx`
- `src/app/app/tailoring/page.tsx`
- `src/components/AppShell.tsx`
- `src/lib/demo-workouts.ts`
- `src/domain/training-plan/workout-recipes.ts`
- `src/lib/storage.ts`

### Phase 7: QA, Docs, And Regression Coverage

Goal: lock the corrected product behavior.

Tasks:

1. Add golden tests for low, moderate, and high current mileage across all goal races.
2. Add mileage-curve assertions:
   - start respects current baseline
   - deloads are intentional
   - peak occurs before taper
   - taper reduces from actual peak
3. Add UI-level tests or manual QA checklist for:
   - calendar dates
   - race estimate controls
   - easy HR/RPE default
   - new workout chooser
   - tailoring route
4. Update README route descriptions.
5. Run `npm test` and `npm run build`.

Acceptance criteria:

- Domain tests cover the screenshots' failure mode.
- Build succeeds.
- README matches the new information architecture.

## File-Level Priority Map

Highest risk:

- `src/domain/training-plan/build-plan.ts`
- `src/domain/training-plan/build-plan.test.ts`

Highest product clarity:

- `src/app/app/plans/[id]/page.tsx`
- `src/app/app/plans/[id]/sessions/[sessionId]/page.tsx`
- `src/app/app/new/page.tsx`
- `src/app/app/tailoring/page.tsx`

Shared contract files:

- `src/domain/training-plan/types.ts`
- `src/domain/workout-schema.ts`
- `src/lib/storage.ts`
- `src/lib/plan-storage.ts`

Docs:

- `README.md`
- `plans/adaptive-workout-generation/coach-plan-rebuild.md`
- `plans/adaptive-workout-generation/implementation-plan.md`

## Recommended Implementation Order

1. Phase 1: Mileage Engine Rebuild
2. Phase 2: Calendar And Date Visibility
3. Phase 3: User-Facing Copy Cleanup
4. Phase 4: Intensity Defaults And Recovery Naming
5. Phase 5: Race Estimate Input Rebuild
6. Phase 6: Split New Workout From Tailoring
7. Phase 7: QA, Docs, And Regression Coverage

Start future implementation work with:

> Continue implementing `plans/adaptive-workout-generation/coach-plan-rebuild.md`, starting with Phase 1.

## GSTACK Review Notes

CEO/product review:

- A delayed `.v2` sequel is the wrong product move because the mileage issue undermines trust now.
- Calendar dates and copy cleanup are not cosmetic; they change whether the plan feels usable.
- Splitting New Workout and Tailoring is necessary information architecture, not a preference.

Design review:

- Calendar-first planning is the correct primary view.
- Dates must be visible in both desktop and mobile contexts.
- The UI should guide action, not expose training literature snippets.

Engineering review:

- Replace the volume curve before layering more UI around it.
- Preserve the useful recipe and preference systems from the legacy plan.
- Add tests around the exact failure mode shown in the screenshots before refactoring further.
