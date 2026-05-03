# Training Plan Generator Implementation Plan

## Goal

Build a Runna-style training plan generator that takes a runner's profile, current fitness, and goal race, and produces a tailored multi-week training plan. The plan is delivered as both:

1. A Claude skill (`running/training-plan-generator`) that any agent in this repo can invoke to produce a plan as structured JSON.
2. A user-facing feature inside the existing Run Tailor web app (see `plans/run-tailor-app/implementation-plan.md`) where the user fills in a form and gets a calendar-style plan they can view, save, adapt, and export.

The first version supports the four most common road goals: 5K, 10K, half marathon, marathon. Cross-training, trail, ultra, and track goals are explicitly out of scope for V1 but the schema should not block them later.

## Confirmed Product Decisions

- Levels supported: `beginner`, `intermediate`, `advanced`. Level is inferred from the user's inputs, not chosen by the user, so the algorithm cannot be gamed.
- Goal races: `5K`, `10K`, `half`, `marathon`.
- Plan length: derived from the gap between today and the goal race date. Minimum and maximum lengths are enforced per goal/level.
- Pace derivation: VDOT-based (Jack Daniels) when a recent race or time-trial is provided. Heart-rate and RPE fallback when it is not.
- Polarized intensity distribution: ~80/20 easy/hard, pyramidal for marathon-specific blocks.
- Deload cadence: every fourth week by default, drop 20–30% volume, keep one quality session at full intensity.
- Taper: 1 week (5K), 1–2 weeks (10K, half), 2–3 weeks (marathon). Volume drops 40–60%, intensity and frequency are preserved.
- Long-run cap: 30% of weekly volume, hard cap by goal (5K 12 km, 10K 16 km, half 22 km, marathon 35 km).
- Adaptive layer: post-run actuals (pace, HR, RPE, completion) feed back into next week's plan via an ACWR governor and aerobic-deficit checks.
- Persistence: a plan is a versioned object. Adaptations create new versions, never mutate prior weeks.
- Skill-first: the algorithm lives in a portable form (Python in the skill, mirrored in TypeScript in the app). The web app calls the same logic.

## Reference Material

The algorithm encodes well-established training science. Anything in this section that is encoded as a number must trace back to one of these sources, and the source should be cited inline in the code comment where the number lives.

- Daniels J. *Daniels' Running Formula*, 4th ed. — VDOT tables, E/M/T/I/R zones, long-run rules.
- Pfitzinger P. & Douglas S. *Advanced Marathoning*, 3rd ed. — 55/70/85+ mpw plans, MP-segment long runs.
- Humphrey L. *Hansons Marathon Method* — cumulative-fatigue model, 16-mi long-run cap variant.
- Higdon H. *Marathon: The Ultimate Training Guide* — Novice/Intermediate/Advanced templates.
- Seiler S. (2010) "What is best practice for training intensity distribution?" *IJSPP* 5:276–291 — 80/20 polarized model.
- Bosquet L. et al. (2007) "Effects of tapering on performance: meta-analysis" *MSSE* 39:1358 — taper volume reduction 41–60%.
- Buist I. et al. (2008) "No effect of a graded training program on running injuries" *AJSM* 36:33 — 10% rule caveats.
- Gabbett T. (2016) "Training-injury prevention paradox" *BJSM* 50:273 — ACWR 0.8–1.3.
- Tanaka H. (2001) "Age-predicted maximal heart rate revisited" *JACC* 37:153 — `HRmax = 208 − 0.7·age`.
- Foster C. (1998) "Monitoring training in athletes" *MSSE* 30:1164 — monotony and strain.
- Riegel P. (1981) — endurance race-time prediction `T₂ = T₁ × (D₂/D₁)^1.06`.

A condensed numbers-only reference lives in `running/training-plan-generator/references/`.

## Recommended Stack

- Skill core algorithm: Python 3.11, no runtime dependencies beyond the standard library. Pure functions, deterministic, fully unit tested.
- App mirror: TypeScript module under `src/domain/training-plan/`. Same rules, same test cases ported.
- Schema: a single JSON Schema (`plan.schema.json`) shared by the Python skill and the TypeScript app. Both implementations validate against it.
- App framework: continue using the Next.js + Tailwind + Prisma stack already chosen for Run Tailor.
- Adaptive layer: server-side. Reads completed sessions, writes new plan version.
- Calendar UI: a 7-day-by-N-week grid on desktop, vertical week list on mobile.
- Activity import (later phase): Strava OAuth, Apple HealthKit on iOS PWA, Garmin Connect file upload.
- Testing: golden-plan tests (input fixture → expected weekly volume curve and session counts), property tests for invariants (no week violates ACWR, deload cadence, taper math), and end-to-end Playwright for the form flow.

## GStack Execution Workflow

Use gstack as the quality pipeline at each phase boundary:

1. Planning: this document is the source of truth. Update it when decisions change.
2. Engineering review: run a gstack engineering review after the algorithm and schema are stable, before wiring the UI.
3. Design review: run a gstack design review after the calendar view and plan-detail screen are first rendered.
4. QA: run gstack QA after each vertical slice (skill MVP, app MVP, adaptive layer).
5. Ship: when ready, use the gstack ship flow to commit, push, and prepare the PR.

## Information Architecture (App Surface)

Authenticated only:

- `/app/plans`: list of the user's training plans (active, completed, archived).
- `/app/plans/new`: onboarding form that produces a plan.
- `/app/plans/[id]`: plan detail with calendar, weekly summary, and current-week focus.
- `/app/plans/[id]/sessions/[sessionId]`: single-session view with warmup, main set, cooldown, target paces, target HR, RPE, and rationale.
- `/app/plans/[id]/settings`: edit goal date, days/week, surfaces, constraints; trigger replan.
- `/app/plans/[id]/history`: revision history (every adaptation creates a new version).

Settings additions to the existing `/app/settings` page:

- VDOT or last race result.
- HRmax, resting HR, age.
- Default training days and time-per-session caps.
- Surface preferences and injury flags.

## Core User Flow

1. User chooses "New plan" from the dashboard.
2. User completes the onboarding form (5 short steps, see below).
3. App classifies level, derives paces, builds the plan, validates it, and shows a preview.
4. User confirms; the plan is saved and becomes the user's active plan.
5. Each day the app shows the current session with everything needed to execute it.
6. After each session, the user logs (or imports) the actual run.
7. Weekly the adaptive layer recomputes upcoming weeks and creates a new plan version when adjustments are needed.
8. User can ask "Why did this change?" and see the rule that fired.

### Onboarding Form

Five screens, each with the minimum field count needed:

1. Goal: race distance and goal date.
2. Current training: average weekly km over the last 4 weeks, longest run in the last 4 weeks.
3. Recent performance: most recent race time *or* a 5K time-trial *or* "I don't know" (drives VDOT).
4. Constraints: days per week available, max minutes per session, preferred long-run day, surface.
5. Health: age, resting HR, max HR (estimate offered), injury flags, pregnancy or post-injury return flag.

If the gap between today and the goal date is too short for the goal+level pair, the form blocks submission and recommends either a later date or a shorter goal.

## Data Model

Add to the existing Prisma schema. Keep `User` and `UserSettings` from the Run Tailor plan and extend.

### RunnerProfile

- `userId`
- `age`
- `restingHR`
- `maxHR`
- `vdot`
- `lastRaceDistanceMeters`
- `lastRaceTimeSeconds`
- `lastRaceDate`
- `injuryFlagsJson`
- `surfacePreference`
- `updatedAt`

### TrainingPlan

- `id`
- `userId`
- `goalRace`: `5K | 10K | half | marathon`
- `goalDate`
- `level`: `beginner | intermediate | advanced` (inferred)
- `daysPerWeek`
- `startDate`
- `weeksTotal`
- `status`: `draft | active | completed | archived`
- `createdAt`
- `updatedAt`

### TrainingPlanVersion

- `id`
- `planId`
- `versionNumber`
- `reason`: `initial | adaptation | user_edit`
- `planJson`: full plan payload, validated against `plan.schema.json`
- `createdAt`

### PlannedSession

- `id`
- `planVersionId`
- `weekIndex`
- `dayIndex`
- `date`
- `type`: `easy | long | tempo | interval | repetition | marathon_pace | recovery | rest | strides | cross`
- `targetDistanceMeters`
- `targetDurationSeconds`
- `targetPaceLowSecPerKm`
- `targetPaceHighSecPerKm`
- `targetHRZone`
- `targetRPE`
- `description`
- `phase`: `base | build | peak | taper`

### CompletedSession

- `id`
- `plannedSessionId`
- `actualDistanceMeters`
- `actualDurationSeconds`
- `avgHR`
- `maxHR`
- `rpe`
- `note`
- `source`: `manual | strava | garmin | health_kit`
- `createdAt`

### AdaptationEvent

- `id`
- `planId`
- `firedAt`
- `rule`: e.g. `ACWR_CAP`, `MISSED_SESSION`, `RHR_ELEVATED`, `AEROBIC_DEFICIT`
- `inputSnapshotJson`
- `appliedDeltaJson`
- `newVersionId`

## Algorithm Specification

### Inputs

```
goal_race          : {5K, 10K, half, marathon}
goal_date          : ISO date
current_weekly_km  : number
longest_recent_km  : number
recent_race        : {distance_m, time_s}?    # may be null
age                : number
resting_hr         : number?
max_hr             : number?                  # default Tanaka 208 − 0.7·age
days_per_week      : 3..7
session_minutes_cap: number?
surface            : {road, trail, treadmill, track, mixed}
injury_flags       : string[]
```

### Pipeline

1. Validate inputs and reject impossible plans (e.g. 4 weeks to a marathon from a 20 km/wk base).
2. Estimate `VDOT` from `recent_race` using the Daniels VDOT lookup table; fall back to a Riegel-extrapolated VDOT from the longest recent run if no race is available; fall back to RPE/HR-only zones if neither is available.
3. Classify `level` from the combination of `current_weekly_km`, `longest_recent_km`, and `vdot`. Level is a function of the inputs, not a user choice.
4. Compute `weeks_total = (goal_date - today) / 7` and split into phases:
   - `taper_weeks` = `{5K:1, 10K:1, half:2, marathon:3}[goal]`
   - `peak_weeks` = `round(0.20 × weeks_total)`
   - `build_weeks` = `round(0.35 × weeks_total)`
   - `base_weeks` = `weeks_total − taper − peak − build`
5. Set `start_weekly_km = max(current_weekly_km, floor[goal][level])` and `peak_weekly_km = peak[goal][level]`.
6. Generate the weekly volume curve:
   - Multiply by `1 + progression_rate[level]` each non-deload week.
   - Every 4th week, multiply by `0.75` (deload).
   - Cap at `peak_weekly_km`.
   - Set `long_run_km = min(0.30 × week_km, long_run_cap[goal])`.
7. For each week, lay out sessions:
   - 1 long run on the user's preferred long-run day.
   - `quality_count = quality_table[level][phase]` quality sessions, distributed with at least one easy day between them.
   - Fill remaining run days with easy runs at 80/20 ratio against quality.
   - At least one rest day adjacent to the long run.
8. Choose workout types by phase:
   - `base`: easy, strides, hills, light fartlek.
   - `build`: tempo at threshold (T), VO2 intervals (I) such as 5×1000m.
   - `peak`: race-pace work; for marathon, long runs with MP segments.
   - `taper`: short race-pace strides, long run cut, total volume −40 to −60%.
9. Run guardrail validators (see below). Any failure rebuilds the offending week with relaxed parameters or surfaces an explanation.
10. Emit the plan JSON, validated against `plan.schema.json`.

### Guardrails

The following rules are checked after generation. Any violation either auto-corrects (preferred) or fails loudly with a structured error.

- ACWR for every week stays in `[0.8, 1.3]`.
- Volume and quality count never both increase in the same week.
- Long run never exceeds 33% of weekly volume or the goal-specific hard cap.
- Deload week appears at least every 4 weeks once cumulative volume exceeds the start by 25%.
- Taper math holds: final-week volume between 40% and 60% of peak; intensity preserved; frequency preserved.
- Beginner plans contain no I or R sessions in the first 4 weeks.
- Beginner plans use Galloway run/walk ratios when target continuous run time exceeds current capability.

### Adaptive Layer

Runs once per week and on demand. Inputs: completed sessions for the past 14 days plus the current plan version. Rules, in order:

- `ACWR_CAP`: if the next week's planned load divided by the 4-week chronic average exceeds 1.3, flatten the week to bring it to 1.3.
- `RHR_ELEVATED`: if 7-day rolling resting HR is more than 7 bpm above 28-day baseline, insert a rest day and shift downstream sessions.
- `AEROBIC_DEFICIT`: if two or more "easy" runs in the past 14 days were executed above Z2, hold weekly volume flat and replace the next quality session with an easy run.
- `MISSED_SESSION`: redistribute up to one missed quality session within the same week, but never compound losses across weeks.
- `VDOT_UPDATE`: if a tempo or race effort implies a new VDOT, update paces from the next week onward only.
- `INJURY_FLAG`: if the user marks an injury, swap runs for cross-training or rest until the flag clears, capped at 2 weeks before recommending a coach/medical check.

Each fired rule writes an `AdaptationEvent` with the rule name and the diff, so the user can ask "why did this change?" and get an explainable answer.

## Skill Layout

```
running/training-plan-generator/
  SKILL.md                       # trigger description and contract
  references/
    vdot-table.md
    progression-rules.md
    workout-library.md
    plan-templates/
      5k-beginner.md
      5k-intermediate.md
      5k-advanced.md
      10k-beginner.md
      10k-intermediate.md
      10k-advanced.md
      half-beginner.md
      half-intermediate.md
      half-advanced.md
      marathon-beginner.md
      marathon-intermediate.md
      marathon-advanced.md
  schemas/
    plan.schema.json
    inputs.schema.json
  scripts/
    classify_runner.py
    paces_from_vdot.py
    riegel.py
    build_plan.py                # entry point: inputs.json → plan.json
    validate_plan.py             # guardrail checks
    adapt_plan.py                # adaptive layer
  tests/
    fixtures/
      beginner_5k_12wk.json
      intermediate_half_16wk.json
      advanced_marathon_18wk.json
    test_classify.py
    test_paces.py
    test_build_plan.py
    test_validate.py
    test_adapt.py
  agents/
    plan-reviewer.md             # subagent that critiques output vs principles
```

The skill must be self-contained: invoking `python scripts/build_plan.py < inputs.json > plan.json` produces a valid plan with no network access.

## App Surface (inside the Run Tailor app)

### New Components

- `PlanOnboardingForm`
- `PlanCalendarGrid` (desktop)
- `PlanWeekList` (mobile)
- `PlanSessionCard`
- `WhyThisChangedSheet`
- `PlanProgressHeader`
- `AdaptationEventTimeline`
- `ImportActivityButton`

### Reused From Run Tailor

- `AppShell`
- `SettingsForm` (extended with VDOT, HRmax, RHR, age)
- `ExportMenu` (plan-week and full-plan exports)

## Export Plan

Match the export pattern already established in Run Tailor — one render model, three formats.

- Image: a single-week summary card.
- PDF: full plan grouped by week with phase markers and a one-page key explaining zones and abbreviations.
- DOCX: structured tables, brand colors, no week-level images.

## Implementation Phases

### Phase 0: Algorithm Skeleton

1. Stand up the `running/training-plan-generator/` skill directory.
2. Encode the VDOT table, Riegel formula, Tanaka HRmax, and Daniels pace zones as pure Python modules.
3. Define `inputs.schema.json` and `plan.schema.json`.
4. Write fixtures for one beginner 5K, one intermediate half, and one advanced marathon plan.

Acceptance criteria:

- VDOT and pace functions match published Daniels tables to within rounding.
- Schemas validate the fixtures.

### Phase 1: Plan Builder

1. Implement classifier, phase splitter, weekly volume curve, and session layout.
2. Implement workout-type selection per phase.
3. Implement guardrail validators.
4. Wire `build_plan.py` end to end.
5. Write golden tests against the three fixtures.

Acceptance criteria:

- Each fixture produces a plan that satisfies all guardrails.
- Plan generation is deterministic given the same inputs.
- Beginner plans contain no I or R work in the first 4 weeks.

### Phase 2: Skill Surface

1. Write `SKILL.md` with a precise trigger description and the input/output contract.
2. Add a `plan-reviewer` subagent that critiques a generated plan against the reference material.
3. Add example prompts and expected outputs in `references/`.

Acceptance criteria:

- A fresh agent invoking the skill with a fixture input produces a valid plan in one shot.
- The reviewer subagent flags a deliberately corrupted plan and passes a valid one.

### Phase 3: TypeScript Mirror

1. Port the algorithm to `src/domain/training-plan/` in the app.
2. Reuse the JSON schemas as the contract.
3. Port all Python tests to TypeScript with the same fixtures and expected outputs.

Acceptance criteria:

- Python and TypeScript implementations agree byte-for-byte on the three fixtures (after canonical JSON serialization).
- TypeScript tests pass in CI.

### Phase 4: App Onboarding And Plan View

1. Build the 5-step onboarding form.
2. Generate a draft plan, show a confirmation preview, save on confirm.
3. Implement the calendar grid (desktop) and week list (mobile).
4. Implement the single-session view.

Acceptance criteria:

- A user can complete onboarding and see a saved plan in under 90 seconds.
- The plan renders correctly on a 360 px wide viewport and a 1440 px wide viewport.
- "Why this date is too soon" surfaces when the goal date is infeasible.

### Phase 5: Logging And Adaptive Layer

1. Manual session logging (distance, duration, HR, RPE).
2. Adaptive layer with the rules listed above.
3. `AdaptationEvent` timeline and `WhyThisChangedSheet`.
4. Plan version history.

Acceptance criteria:

- Logging two consecutive easy runs above Z2 triggers `AEROBIC_DEFICIT` and produces a new plan version.
- Marking an injury inserts cross-training or rest for the duration of the flag.
- Every adaptation is explainable in plain English in under 200 characters.

### Phase 6: Activity Import

1. Strava OAuth import for completed runs.
2. Apple HealthKit import via the iOS PWA.
3. File upload import (FIT/TCX/GPX) as a universal fallback.
4. Map imported activities to planned sessions by date and proximity.

Acceptance criteria:

- An imported run auto-populates a `CompletedSession` and feeds the adaptive layer.
- Mismatched dates surface as suggestions, never silent overwrites.

### Phase 7: Exports And Polish

1. Image export of a week card.
2. PDF export of the full plan.
3. DOCX export of the full plan.
4. Plan archival, copy/duplicate plan, post-race review screen.
5. Run gstack QA on the full app.

Acceptance criteria:

- All three exports match the on-screen plan content.
- Plans can be archived and a new plan can be started without losing history.

## Risks And Decisions To Watch

- VDOT accuracy without a recent race: the fallback chain must degrade gracefully and the UI must say what is being assumed.
- Adaptive layer trust: every change must be explainable. Silent changes will erode trust faster than any feature gain.
- Schema drift between Python and TypeScript: enforced by sharing `plan.schema.json` and the same fixtures in both test suites.
- Over-aggressive ACWR clamping in early weeks: the chronic baseline is small and noisy; use a 14-day floor in the first 4 weeks of any plan.
- Beginners pushed past their structural readiness: prefer Galloway run/walk progressions over forcing continuous runs in the first 4 weeks for any beginner whose `longest_recent_km < 5`.
- Goal-date pressure: when the date is too close, recommend a later date *or* a shorter goal rather than producing an unsafe plan.
- Injury and pregnancy flags: V1 only inserts rest or cross-training and a recommendation to consult a professional. The app must not pretend to give medical advice.
- Cross-platform parity: the iOS PWA cannot read HealthKit directly without a native shell; document the file-upload fallback prominently.

## First Build Order

1. Stand up the skill directory and encode the lookup tables.
2. Write the three plan fixtures and JSON schemas.
3. Implement `build_plan.py` and pass the fixture tests.
4. Add guardrail validators and the `plan-reviewer` subagent.
5. Port to TypeScript inside the app.
6. Build onboarding form and plan calendar.
7. Add manual logging and the adaptive layer.
8. Add activity import and exports.
9. Run gstack QA and ship.
