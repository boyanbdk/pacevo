# Workout Adapter Internal Refactor Plan

Goal: rename the legacy `run-tailor` internals to `workout-adapter` after the Pacevo user-facing rebrand is stable.

## Scope

- Keep `/app/tailoring` as a compatibility route unless a redirect strategy is planned separately.
- Preserve existing saved workout data, localStorage keys, and exported workout history.
- Avoid changing adaptation behavior while renaming files, symbols, and skill metadata.

## Proposed Steps

1. Add compatibility exports from the current `src/domain/run-tailor.ts` API.
2. Move implementation to `src/domain/workout-adapter.ts`.
3. Update app imports from `tailorWorkout` only where the callsite copy already uses Adapt language.
4. Rename tests from `run-tailor.test.ts` to `workout-adapter.test.ts` while keeping focused behavior assertions.
5. Rename `running/run-tailor/` to `running/workout-adapter/` and update skill metadata.
6. Leave a short legacy note in docs for anyone searching old `run-tailor` references.
7. Run the full test suite and build before deleting the compatibility export.

## Acceptance Criteria

- No user-visible behavior changes.
- Existing saved workouts remain readable.
- Tests cover the adapter behavior under the new module name.
- Legacy references remain only in compatibility notes or migration comments.
