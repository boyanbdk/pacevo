# Deload And Race-Week Optimization Plan

Generated: 2026-05-07

## Research Summary

- Bosquet et al. taper meta-analysis: race taper performance is best supported by reducing volume, keeping intensity, and avoiding unnecessary drops in frequency. Practical target: reduce training volume first; keep frequency at roughly 80%+ of normal when possible. Sources: https://pubmed.ncbi.nlm.nih.gov/17762369/ and https://www.farwestnordic.org/articles/Effects%20of%20Tapering.pdf
- TrainingPeaks taper guidance: taper frequency usually stays the same while session duration and interval volume drop; full rest days are athlete-dependent, not mandatory in every reduced week. Source: https://www.trainingpeaks.com/coach-blog/endurance-coaching-tapering-faqs/
- Runner's World deload guidance: cutback weeks commonly occur every 3-6 weeks, but the "extra recovery day" is optional and depends on the runner and plan structure; volume and quality can be reduced through shorter sessions and shorter long runs instead. Source: https://www.runnersworld.com/training/a62149398/deload-weeks/
- Race-week sharpening guidance: early-week reduced-volume workouts at or around race pace keep the runner sharp without trying to gain fitness in race week. Source: https://www.active.com/running/articles/race-week-workouts-for-success

## Policy By Level

Beginner:
- Ordinary deload weeks should mainly reduce volume and long-run length.
- Do not remove a training day on every deload; beginners already tend to train fewer days.
- Add an extra rest day only in the final pre-race taper week when the runner trains 4+ days/week.
- Race week gets either a very small race-effort tune-up early in the week or no quality session if the race is too early in the week.

Intermediate:
- Ordinary deload weeks keep run frequency and reduce distance/session stress.
- Keep one low-stress quality touch when the week has enough running days.
- Add an extra rest day only in the final pre-race taper week for 5+ day runners.
- Race week gets one short race-specific workout on Monday, Tuesday, or Wednesday when the race is Thursday-Sunday.

Advanced:
- Preserve frequency on ordinary deloads; advanced runners usually recover better from shorter easy runs than from repeatedly breaking rhythm.
- Keep quality low-volume, not high-stress.
- Add an extra pre-race rest day only for marathon runners training 6+ days/week.
- Race week gets one short race-specific workout early in the week, with marathon plans using marathon-pace work instead of faster interval work.

## Implementation Phases

### Phase 1 - Replace Blanket Deload Rest Day

Status: Completed.

- Update `src/domain/training-plan/build-plan.ts`.
- Replace the current blanket `isDeload && runDays >= 4` day removal with a level-aware function.
- Detect final pre-race week and pass that into weekly layout.
- Keep ordinary deloads as volume reductions, not frequency reductions.

### Phase 2 - Add Race-Week Tune-Up

Status: Completed.

- Add a deterministic race-week tune-up session builder.
- Schedule it only on Monday, Tuesday, or Wednesday.
- Require at least two days before race day.
- Keep the session race-specific and low-volume.
- Use:
  - 5K/10K: short reps near race effort.
  - Half: short tempo/race-effort blocks.
  - Marathon: short marathon-pace blocks.

### Phase 3 - Test Coverage

Status: Completed.

- Update existing deload tests so ordinary deloads keep run frequency.
- Add pre-race taper tests for the extra-rest exception.
- Add race-week tests that assert a race-specific session exists early in race week.
- Run the focused Vitest file, then the full test suite if focused tests pass.

## NOT In Scope

- Rewriting the Python legacy generator. The app path uses the TypeScript generator.
- Adding new UI controls for rest-day preferences.
- Adding readiness/adaptive feedback into initial plan generation.
- Changing deload volume factors.

## Existing Code Reused

- `buildPlan()` already computes phases, deload flags, race week detection, session layout, and race distance.
- `qualityCountForWeek()` already caps taper/race-week quality count.
- Existing recipe/session shape supports race-specific sessions without schema changes.

## Execution Notes

Sequential implementation, no parallelization opportunity. The behavior is concentrated in `src/domain/training-plan/build-plan.ts` and `src/domain/training-plan/build-plan.test.ts`.

## Verification

- `npm run typecheck`
- `npm test -- src/domain/training-plan/build-plan.test.ts`
- `npm test`
