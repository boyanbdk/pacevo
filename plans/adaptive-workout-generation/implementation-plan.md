# Adaptive Workout Generation Implementation Plan

## Purpose

Move Run Tailor from a plan builder that mostly assembles fixed workout descriptions into a real workout-generation engine.

The product goal is:

- Generate workouts from the user's goal, race estimate, current training, level, schedule, and preferences.
- Keep enough workout variety that the plan feels coached, not templated.
- Let users like, dislike, favourite, and swap workouts.
- Feed those preferences back into future workout selection without compromising progression, recovery, or intensity distribution.
- Let every workout render in pace, RPE, or heart-rate mode, with sensible defaults by workout type.

This is the working plan for implementation across multiple chats.

## Product Evaluation

The user's preference-feedback idea is correct and should be built.

The important constraint is that preference must bias the algorithm, not control it completely. If a runner favourites intervals, the engine should give them more interval-style variety within safe limits. It should not turn an easy/base week into three hard sessions. If a runner dislikes tempo runs, the engine should offer threshold alternatives such as cruise intervals or progression runs, not remove threshold stimulus entirely.

Recommendation: implement a controlled personalization loop.

- Likes increase the score of a workout family and similar recipes.
- Favourites increase the score more strongly, but only after cooldown and safety checks.
- Dislikes decrease the score and trigger a "switch to similar workout" option.
- Swaps preserve the intended training stimulus, load, and phase purpose.
- Safety rules always beat preferences.

This gives the user agency while keeping the app trustworthy.

## Research Baseline

Runna's public materials show a useful product pattern:

- Plans are personalized by goal race, duration, experience level, current performance or recent PB, run days, long-run day, and optional strength or mobility support.
- Training preferences separate volume from difficulty.
- Difficulty affects hard-run count, hard-run difficulty, and long-run structure.
- Pace targets are based on estimated race time rather than manually selected workout examples.
- Training focus changes workout mix: speed, endurance, or balanced.

Sources:

- Runna training plans: https://www.runna.com/training/training-plans
- Runna homepage: https://www.runna.com/
- Runna training preferences: https://support.runna.com/en/articles/10393191-how-to-use-training-preferences
- Runna training focus: https://support.runna.com/en/articles/11598487-how-to-choose-your-training-focus

Heart-rate zone baseline:

- Polar and Garmin both use the common default five-zone model based on max HR.
- CDC supports 0-10 relative perceived exertion, where moderate is about 5-6 and vigorous starts around 7-8.

Sources:

- Polar HR zones: https://support.polar.com/e_manuals/polar-loop/polar-loop-user-manual-english/heart-rate-zones.htm
- Garmin HR zones: https://www8.garmin.com/manuals/webhelp/forerunner935/EN-AU/GUID-A8716C0B-B267-4C42-B45F-B9C7928BCA19.html
- CDC intensity and RPE: https://www.cdc.gov/physical-activity-basics/measuring/index.html

## Training Intensity Model

Use this as the app's V1 zone table when max HR is known:

| Zone | Name | Percent Max HR | Primary Use |
| --- | --- | ---: | --- |
| Z1 | Recovery / Very Easy | 50-60% | Recovery runs, warmups, cooldowns |
| Z2 | Easy | 60-70% | Easy runs, most long runs |
| Z3 | Aerobic / Steady | 70-80% | Steady long-run blocks, progression runs |
| Z4 | Threshold | 80-90% | Tempo, cruise intervals, threshold blocks |
| Z5 | VO2 Max | 90-100% | VO2 intervals, short hard efforts |

Recommended display policy:

- Recovery and Easy: HR target is the recommended primary mode.
- Long Runs: HR target by default, with pace for planned steady or race-pace blocks.
- Tempo Runs: pace or RPE primary; HR secondary because HR lag makes it less precise.
- Intervals: pace or RPE primary; HR is informational only.

RPE mapping:

| Workout Type | RPE |
| --- | ---: |
| Recovery | 2-3 |
| Easy | 3-4 |
| Long easy | 4-5 |
| Long steady block | 5-6 |
| Tempo / Threshold | 6-8 |
| Intervals | 8-9 |
| Repetition / Fast relaxed | 7-9, with full recovery |

## User Inputs

Extend onboarding and settings to capture:

- Goal race: 5K, 10K, half, marathon.
- Goal date.
- Estimated race time for the selected distance.
- Current weekly kilometres.
- Longest recent run.
- Available run days per week.
- Preferred long-run day.
- Experience level: beginner, intermediate, advanced.
- Optional inferred level confirmation if the app disagrees with self-selection.
- Max HR.
- Resting HR, optional.
- Preferred intensity display: pace, RPE, HR.
- Injury flags and return-from-break flags.
- Training preference sliders:
  - Volume: gradual, steady, progressive.
  - Difficulty: comfortable, balanced, challenging.
  - Focus: balanced, speed, endurance.

Important decision:

The app should ask for experience level, but the engine should still compute an inferred level from weekly volume, longest recent run, and race estimate. If self-selected and inferred levels disagree, the UI should show a short explanation and default to the safer lower level unless the user explicitly confirms.

## Workout Taxonomy

Keep user-facing workout types simple:

- Recovery
- Easy
- Long Run
- Tempo Run
- Interval Workout

Use internal workout families for variety:

Recovery:

- short recovery jog
- recovery plus mobility prompt
- recovery with strides, advanced only and only when safe

Easy:

- plain easy
- easy plus strides
- aerobic progression
- easy trail or treadmill variant

Long Run:

- easy long run
- fast-finish long run
- long run with steady middle
- long run with tempo blocks
- marathon-pace segment long run
- cutback long run

Tempo:

- continuous tempo
- cruise intervals
- progression tempo
- threshold ladder
- race-pace tempo

Intervals:

- short intervals, for example 12 x 400 m
- medium intervals, for example 6 x 800 m
- long intervals, for example 5 x 1000 m
- VO2 max intervals, for example 4 x 1200 m
- hills as strength-speed intervals
- fartlek as less rigid interval work

## Recipe System

Create a `WorkoutRecipe` model.

Suggested fields:

```ts
type WorkoutFamily =
  | "recovery"
  | "easy"
  | "long_easy"
  | "long_steady"
  | "long_tempo_blocks"
  | "tempo_continuous"
  | "tempo_cruise"
  | "tempo_progression"
  | "interval_short"
  | "interval_medium"
  | "interval_long"
  | "hills"
  | "fartlek";

type WorkoutRecipe = {
  id: string;
  family: WorkoutFamily;
  sessionType: "recovery" | "easy" | "long" | "tempo" | "interval";
  goalRaces: GoalRace[];
  levels: Level[];
  phases: Phase[];
  minWeeklyKm: number;
  maxWeeklyKm?: number;
  minDaysPerWeek: number;
  stressScore: 1 | 2 | 3 | 4 | 5;
  stimulus: "recovery" | "aerobic" | "threshold" | "vo2max" | "speed" | "race_specific";
  tags: string[];
  cooldownWeeks: number;
  build: (ctx: WorkoutContext) => PlannedSession;
};
```

Recipe examples:

- `easy_steady_30_60`
- `easy_strides_6x20s`
- `long_easy`
- `long_fast_finish`
- `long_mp_middle_third`
- `tempo_20min_continuous`
- `tempo_3x8min_cruise`
- `tempo_progression_3_blocks`
- `interval_12x400`
- `interval_6x800`
- `interval_5x1000`
- `interval_4x1200`
- `hills_8x60s`
- `fartlek_8x1min`

## Recipe Selection Algorithm

Use scoring, not random selection.

High-level flow:

1. Determine the intended stimulus for the session from plan phase, goal race, level, and week structure.
2. Filter recipes by hard constraints:
   - compatible goal race
   - compatible level
   - compatible phase
   - enough weekly mileage
   - enough days per week
   - not in cooldown
   - not unsafe after previous hard session
3. Score remaining recipes.
4. Pick the highest-scoring recipe with light deterministic tie-breaking.
5. Render the recipe into a `PlannedSession`.
6. Validate the full week.

Base score inputs:

- phase fit
- goal-race fit
- level fit
- focus fit
- variety bonus
- preference score
- fatigue penalty
- recent repetition penalty
- safety penalty

Scoring sketch:

```ts
score =
  phaseFit * 4 +
  goalFit * 3 +
  levelFit * 3 +
  focusFit * 2 +
  varietyBonus +
  preferenceBias -
  recentRepeatPenalty -
  fatiguePenalty -
  safetyPenalty;
```

Preference bias must be capped. Suggested cap:

- Like: +1 to recipe, +0.5 to family.
- Favourite: +2 to recipe, +1 to family.
- Dislike: -3 to recipe, -1.5 to family.
- Recent swap away: -2 to recipe for 6 weeks.
- Maximum total preference bias: +/- 3.

This prevents a user from accidentally breaking the plan by repeatedly favouriting hard workouts.

## Feedback Data Model

Add workout feedback to local storage first. Later, move to Prisma or server persistence.

```ts
type WorkoutFeedbackType = "like" | "dislike" | "favourite" | "unfavourite" | "swap";

type WorkoutFeedback = {
  id: string;
  planId: string;
  sessionId: string;
  recipeId: string;
  recipeFamily: WorkoutFamily;
  type: WorkoutFeedbackType;
  reason?: string;
  createdAt: string;
};

type UserWorkoutPreference = {
  recipeId: string;
  recipeFamily: WorkoutFamily;
  score: number;
  likes: number;
  dislikes: number;
  favourites: number;
  swapsAway: number;
  updatedAt: string;
};
```

Recommended reason options for dislikes:

- Too hard
- Too boring
- Too long
- Too much speed
- Too much treadmill/track structure
- Did not fit my schedule
- Other

The reason matters. "Too hard" should reduce intensity or volume. "Too boring" should increase variety without reducing the training stimulus.

## Swap Similar Workout Flow

A dislike should offer: "Switch to a similar workout."

Swap rules:

- Keep the same date.
- Keep the same top-level type where possible.
- Keep the same stimulus.
- Keep target load within +/- 10%.
- Keep hard/easy spacing unchanged.
- Respect level and phase.
- Prefer recipes with different structure tags.

Examples:

- Disliked `tempo_20min_continuous`:
  - offer `tempo_3x8min_cruise`
  - offer `tempo_progression_3_blocks`
- Disliked `interval_5x1000`:
  - offer `interval_6x800`
  - offer `fartlek_8x2min`
- Disliked `long_mp_middle_third`:
  - offer `long_fast_finish`
  - offer `long_steady_middle`

If no safe equivalent exists, the UI should say:

"No safe swap is available this week because this session is protecting the plan structure."

## Variety Guardrails

Hard rules:

- Do not repeat the exact same quality recipe within 3 weeks.
- Do not schedule two hard sessions on adjacent days.
- Do not increase weekly volume and hard-session count in the same week.
- Beginners get at most one hard session per week.
- Beginners should not get VO2 intervals in the first 4 weeks.
- Long-run workout complexity increases by level and phase.
- Every fourth week should bias toward simpler workouts and lower load.
- Taper keeps some intensity but reduces volume and complexity.

Soft rules:

- Rotate tempo formats across continuous, cruise, and progression.
- Rotate interval lengths across short, medium, and long.
- Use hills and fartlek as lower-precision alternatives when the user dislikes strict track workouts.
- Use race-specific long-run blocks more often for half and marathon plans, less for 5K/10K plans.

## Personalization Guardrails

Preferences can only affect choice inside a safe candidate set.

Safety priority order:

1. Medical/injury flags.
2. Current load and ACWR limits.
3. Hard/easy spacing.
4. Phase purpose.
5. Goal-race specificity.
6. User preference.
7. Novelty.

This order should be explicit in code comments and tests.

## Intensity Rendering

Each generated session should store canonical training intent, then render targets based on user preference.

Canonical session fields:

- recipeId
- recipeFamily
- stimulus
- targetKm
- targetDurationMin
- targetPaceRange
- targetHrZone
- targetHrPercentRange
- targetRpeRange
- structure blocks
- explanation

Display modes:

Pace mode:

- Show pace prominently.
- Show RPE and HR as secondary.

RPE mode:

- Show RPE prominently.
- Show pace range as optional reference.
- Useful for hills, heat, trail, wind, and treadmill mismatch.

HR mode:

- Recovery/easy/long easy: show HR prominently.
- Tempo/interval: show warning that HR lags and pace/RPE is more reliable.
- Always show RPE fallback.

## Dashboard Plan

The dashboard should not show default easy pace, cooldown pace, or other settings-level values. Those are not dashboard decisions. They belong in Settings and in the session execution view.

Dashboard job:

1. Show what the runner should do next.
2. Show whether the current plan is on track.
3. Surface recent adaptations, missed sessions, and imported runs.
4. Give fast entry points into plan creation, today's session, logging, import, and feedback.

Recommended dashboard layout:

### Empty State

When there is no active plan:

- Primary panel: "No active training plan" with `Build a plan`.
- Secondary action: `Create one-off workout`.
- Small setup checklist:
  - Choose goal race
  - Add race estimate
  - Add max HR
  - Pick training days

Do not show pace default cards in the empty state.

### Active Plan State

Top summary:

- Active goal: race, date, weeks remaining.
- Current week: week number, phase, planned weekly kilometres.
- Plan status: on track, behind, adapted this week, or needs attention.

Primary panel:

- Today's session or next upcoming session.
- Workout type, distance/duration, target mode, and one-line purpose.
- CTA: `View session` or `Log session`.
- If no session today, show next run date and a recovery/rest message.

Useful metric cards:

- Weekly progress: completed km / planned km.
- Sessions completed this week: logged / planned.
- Next long run: date, distance, complexity tag.
- Recent adaptation: latest rule or "No changes this week".
- Preference signal: favourite workout family or "No preferences learned yet".

Secondary sections:

- This week: compact list of upcoming sessions.
- Recent activity: imported/logged sessions and adaptations.
- Feedback prompt: show only when the latest completed workout has no like/dislike/favourite signal.

Dashboard anti-goals:

- Do not show default easy pace.
- Do not show cooldown pace.
- Do not show all pace zones.
- Do not duplicate the full plan calendar.
- Do not make the dashboard a settings page.

Design note:

This is an operational training dashboard, not a marketing page. Keep it dense, scannable, and action-oriented. The user should know their next workout within 3 seconds.

## Implementation Phases

### Phase 1: Profile And Inputs

Goal: collect the data the generator needs.

Tasks:

1. Extend `PlanInputs` with self-selected level, race estimate, training focus, volume preference, difficulty preference, and intensity mode.
2. Update onboarding to ask for estimated race time for the selected race.
3. Keep inferred level and compare it with selected level.
4. Add a safe-level resolver.
5. Update settings so the user can change intensity mode later.

Acceptance criteria:

- User can enter 5K, 10K, half, or marathon estimate.
- Plan generation derives paces from that estimate.
- If selected level is riskier than inferred level, UI explains and defaults safer.
- Existing tests still pass.

### Phase 2: Pace, RPE, And HR Target Model

Goal: centralize all intensity targets.

Tasks:

1. Create `training-intensity.ts`.
2. Define HR zone table from max HR.
3. Define RPE ranges per workout type and stimulus.
4. Define intensity rendering adapters.
5. Update session pages to support Pace, RPE, and HR display modes.

Acceptance criteria:

- Every generated workout has pace, RPE, and HR metadata where applicable.
- Easy and recovery workouts recommend HR by default.
- Intervals and tempo warn when HR is selected as primary.

### Phase 3: Workout Recipe Library

Goal: replace fixed workout text with parameterized workouts.

Tasks:

1. Add `workout-recipes.ts`.
2. Implement recipe model and recipe metadata.
3. Add at least:
   - 4 easy/recovery recipes
   - 5 long-run recipes
   - 5 tempo recipes
   - 7 interval recipes
4. Add recipe builders that scale reps, durations, and target paces by level and volume.
5. Add unit tests for each recipe family.

Acceptance criteria:

- No quality session is hardcoded as only `5x1000`.
- A beginner 5K, intermediate half, and advanced marathon all receive different appropriate workouts.
- Recipe output is deterministic for the same context.

### Phase 4: Recipe Selector And Variety Engine

Goal: choose varied, suitable workouts.

Tasks:

1. Add `select-workout-recipe.ts`.
2. Implement hard filters.
3. Implement scoring.
4. Implement recent recipe cooldown.
5. Add deterministic tie-breaking using plan id, week index, and session slot.
6. Integrate selector into `build-plan.ts`.

Acceptance criteria:

- No repeated quality recipe within 3 weeks.
- Workout families rotate by phase and goal.
- Hard/easy spacing remains valid.
- Existing build-plan guardrails still pass.

### Phase 5: Feedback And Preference Loop

Goal: let the user like, dislike, favourite, and influence future workouts.

Tasks:

1. Add feedback types and storage helpers.
2. Add UI controls on session detail:
   - like
   - dislike
   - favourite
   - switch similar workout
3. Add preference score calculation.
4. Feed preference bias into selector.
5. Cap preference bias.
6. Log feedback in version history or a new preference timeline.

Acceptance criteria:

- Liking/favouriting a workout biases future selection.
- Disliking a workout lowers that recipe/family score.
- Preference can never increase hard-session count above safe limits.
- Feedback persists after refresh.

### Phase 6: Similar Workout Swap

Goal: let users swap disliked workouts without breaking the plan.

Tasks:

1. Add `find-similar-workouts.ts`.
2. Find candidates with same stimulus and similar load.
3. Present 2-3 options when available.
4. Apply the selected swap as a new plan version.
5. Store swap feedback.

Acceptance criteria:

- A disliked tempo can become a cruise interval or progression tempo.
- A disliked interval workout can become a structurally different interval/fartlek.
- Plan version history records the swap.
- No unsafe swap is offered.

### Phase 7: Adaptive Preference-Aware Replanning

Goal: make future adaptations respect user taste.

Tasks:

1. Pass preference profile into adaptive replanning.
2. Re-score future workouts after feedback.
3. Keep completed and past sessions immutable.
4. Add "why this changed" text that mentions preference influence when relevant.

Acceptance criteria:

- Future sessions change after feedback where safe.
- Past sessions are never rewritten.
- The user can see whether a change came from training load, injury, or preference.

### Phase 8: QA And Product Polish

Goal: validate the app behaves like a coach, not a random workout generator.

Tasks:

1. Add golden plans for all race distances and levels.
2. Add property tests for variety and safety.
3. Add UI tests for feedback and swap flows.
4. Run mobile and desktop QA.
5. Update README and user-facing explanations.

Acceptance criteria:

- Every race distance has varied workouts across a full plan.
- Every level receives appropriate workout complexity.
- Feedback changes future plans but does not violate training guardrails.
- Core plan creation, session viewing, feedback, swap, and adaptation flows work on mobile.

### Phase 9: Training Dashboard

Goal: replace settings-style dashboard cards with a useful training cockpit.

Tasks:

1. Remove default easy pace and cooldown pace cards from `/app`.
2. Add active-plan summary: goal, date, week, phase, weeks remaining.
3. Add today's or next upcoming session card.
4. Add weekly progress cards:
   - completed km / planned km
   - sessions logged / planned
   - next long run
   - latest adaptation or attention item
5. Add a compact "This week" session list.
6. Add recent activity feed for logs, imports, adaptations, and swaps.
7. Add feedback prompt for the latest completed workout when no preference has been recorded.
8. Improve empty state for users with no active plan.

Acceptance criteria:

- Dashboard no longer displays default easy pace or cooldown pace.
- A runner with an active plan can identify the next workout in under 3 seconds.
- A runner can see weekly completion progress without opening the full plan.
- Empty dashboard focuses on creating a plan, not on settings.
- Mobile layout preserves the same information priority.

## File-Level Implementation Map

Likely new files:

- `src/domain/training-plan/training-intensity.ts`
- `src/domain/training-plan/workout-recipes.ts`
- `src/domain/training-plan/select-workout-recipe.ts`
- `src/domain/training-plan/workout-preferences.ts`
- `src/domain/training-plan/find-similar-workouts.ts`
- `src/domain/training-plan/workout-recipes.test.ts`
- `src/domain/training-plan/select-workout-recipe.test.ts`
- `src/domain/training-plan/workout-preferences.test.ts`
- `src/lib/workout-feedback-storage.ts`

Likely edited files:

- `src/domain/training-plan/types.ts`
- `src/domain/training-plan/build-plan.ts`
- `src/domain/training-plan/build-plan.test.ts`
- `src/app/app/plans/new/page.tsx`
- `src/app/app/plans/[id]/sessions/[sessionId]/page.tsx`
- `src/app/app/plans/[id]/page.tsx`
- `src/app/app/page.tsx`
- `src/app/globals.css`
- `plans/adaptive-workout-generation/implementation-plan.md`

## Test Strategy

Unit tests:

- race estimate to paces
- HR zone calculation
- RPE mapping
- recipe eligibility filters
- recipe scaling by level
- recipe selection variety
- preference score cap
- similar swap candidate safety

Golden tests:

- beginner 5K
- intermediate 10K
- intermediate half
- advanced marathon

Property tests:

- no adjacent hard sessions
- no exact recipe repeat within 3 weeks
- no beginner VO2 in first 4 weeks
- no preference score can violate hard-session cap
- long-run complexity matches level and phase

UI tests:

- user creates plan with race estimate
- user changes display mode
- user likes and favourites workout
- user dislikes workout and swaps similar workout
- future workouts reflect preference safely
- dashboard shows next session and weekly progress
- dashboard empty state does not show pace defaults

## Open Decisions

1. Should self-selected level ever override inferred level?
   - Recommendation: only downward by default. Upward override requires explicit confirmation.

2. Should favourites affect the current plan immediately?
   - Recommendation: affect future uncompleted sessions only, never past or current week unless user asks to replan.

3. Should HR mode be allowed for intervals?
   - Recommendation: yes, but with a warning and RPE fallback. Do not hide pace for intervals.

4. Should the app support custom user-created recipes in V1?
   - Recommendation: no. Ship recipe feedback first.

5. Should dislikes ask for a reason?
   - Recommendation: yes, with one-tap options. The reason is what lets the algorithm improve correctly.

## Implementation Order For Future Chats

1. Phase 1: extend inputs and onboarding.
2. Phase 2: build intensity target model.
3. Phase 3: create recipe library.
4. Phase 4: replace fixed quality-session selection.
5. Phase 5: add feedback controls and preference storage.
6. Phase 6: add similar workout swaps.
7. Phase 7: make adaptations preference-aware.
8. Phase 8: QA, docs, and polish.

Start the next chat with:

> Continue implementing `plans/adaptive-workout-generation/implementation-plan.md`, starting with Phase 1.
