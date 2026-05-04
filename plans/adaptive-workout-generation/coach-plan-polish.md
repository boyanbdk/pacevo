# Coach Plan Polish

## Decision

Continue the corrected coach plan with a focused polish pass that closes the gaps surfaced during the May 4, 2026 walkthrough. The previous rebuild fixed the mileage engine, dates, copy, intensity defaults, race estimates, and information architecture. This pass tightens the surfaces around them: where warnings appear, what paces the app prescribes, how the user navigates a plan, how short-runway plans are handled, how tailored workouts are read, and how planned workouts feed the tailoring engine.

This is not a rewrite. Each item is local — most live in one or two files — but together they decide whether the app feels like a coach or like a rigid generator.

## Inputs

- Walkthrough screenshots from May 4, 2026 covering plan view, mobile week list, plan header, and an 18-step tailored intervals card.
- User feedback captured the same day on pace pressure, plan-length flexibility, step density, and tailoring entry points.
- Current canonical plan: `plans/adaptive-workout-generation/coach-plan-rebuild.md` (Phases 1–7 implemented).

## Walkthrough Findings

1. Week-scoped warnings ("Week 6: ...", "Week 7: ...") render under Week 1 because the plan-warning list is global.
2. Plan header still shows "5:17 /km easy" — auto-derived easy pace contradicts the rule that easy/recovery effort should not carry pace pressure.
3. Mobile week list dates are too dim; date strings are the most important wayfinding text on that surface and they should be the most legible.
4. Plan navigation is week-by-week with arrows; there is no continuous calendar surface for browsing the whole plan.
5. Plan onboarding hard-blocks a goal date inside `MIN_WEEKS`; a runner who decides 2 weeks out cannot generate a plan at all.
6. Tailored intervals card expands every rep + recovery into its own row (18 steps for 8×800m), drowning the structural pattern.
7. Tailoring requires manual paste/upload even when the workout the user wants to tailor is already in their plan.

## Non-Negotiable Rules

- Easy and recovery paces are user-set in Settings. The app never auto-prescribes an easy pace anywhere on the user-facing surface.
- A plan must generate for any future goal date. Short runways are coached with a warning, not refused.
- Week-scoped warnings render on their week, not on the active week.
- Repeating workout patterns collapse to "Repeat Nx" by default; full step-by-step is recoverable but not the visual default.
- Tailoring must be reachable from the plan without copy-paste.
- Date strings must read at first glance on every plan surface.

## Execution Phases

### Phase 1: Week-Scoped Warning Placement

Goal: deliver each warning on the week it concerns.

Tasks:

1. In `src/domain/training-plan/build-plan.ts` (warnings produced around lines 569–595) and `src/domain/training-plan/adapt-plan.ts`, ensure every week-scoped warning string starts with a stable prefix like `Week 6:` (already true for most). Add a structured field if needed: `{ weekIndex, message }`.
2. In `src/app/app/plans/[id]/page.tsx` (the `.plan-warnings` panel near lines 893–901), bucket warnings by leading "Week N:" prefix and render only the active week's warnings beside the active week. Keep plan-level warnings (no week prefix) in the plan header.
3. Update `coach-plan-rebuild.md`'s Phase 3 reference if needed; do not revisit that plan.

Acceptance criteria:

- Loading Week 1 of a plan does not render Week 6/Week 7 warnings.
- Navigating to Week 6 surfaces the Week 6 warning under that week.
- Plan-level warnings still appear at the top.

Codex/gstack expansion:

- Keep persisted `TrainingPlan.warnings` as `string[]` for Phase 1 to avoid storage and export migration churn.
- Add a domain warning helper that formats week warnings and parses persisted strings into `{ planWarnings, warningsByWeekNumber }` at the view boundary.
- Route new week-scoped engine warnings through the formatter instead of hand-built strings.
- Add unit coverage for warning formatting and bucketing so later calendar work does not regress warning placement.

Likely files:

- `src/app/app/plans/[id]/page.tsx`
- `src/domain/training-plan/build-plan.ts`
- `src/domain/training-plan/adapt-plan.ts`
- `src/domain/training-plan/warnings.ts`

### Phase 2: Remove Auto-Derived Easy Pace From User Surfaces

Goal: stop the app from prescribing easy/recovery pace; honor the user's Settings values only.

Tasks:

1. In `src/app/app/plans/[id]/page.tsx` plan header (around line 494), remove the `formatPace(paces.E_low) + " easy"` string. Replace with the user's `settings.defaultEasyPace` if present, labelled as their setting, not as a derived target. Do the same for recovery.
2. Audit `src/domain/training-plan/training-intensity.ts` for any code path that still emits an easy/recovery pace string in primary card metadata. Suppress on easy/recovery types unless the explicit "show easy-run pace targets" setting is on.
3. Confirm export surfaces (`src/lib/export.ts`, `AdjustedWorkoutCard`) follow the same rule.
4. Update Settings copy if needed so the user understands these values drive what the app shows.

Acceptance criteria:

- A new plan generated with default settings shows no auto-derived easy pace anywhere (header, week card, session detail, export).
- Hard-session pace targets (tempo, intervals, threshold) still display.
- Toggling "show easy-run pace targets" still works for users who want it.

Likely files:

- `src/app/app/plans/[id]/page.tsx`
- `src/domain/training-plan/training-intensity.ts`
- `src/app/app/plans/[id]/sessions/[sessionId]/page.tsx`
- `src/lib/export.ts`
- `src/components/AdjustedWorkoutCard.tsx`

### Phase 3: Date Legibility On Plan Surfaces

Goal: make dates the most legible labels on the plan view.

Tasks:

1. In `src/app/globals.css`, raise the contrast of `.week-card-date` (currently `var(--muted)`) and any other faint date class on the mobile week list and the per-day cards. Use `var(--text)` or a near-`--text` token; bump weight to 600 if needed.
2. Verify desktop calendar `.cal-date` is already legible; tighten only if the visual hierarchy is wrong.

Acceptance criteria:

- Dates on the mobile week list and per-day rows are visibly the primary text, not subdued.
- Visual scanning the plan answers "what's on May 9?" without zoom.

Likely files:

- `src/app/globals.css`

### Phase 4: Continuous Calendar Surface

Goal: let the user scroll through the whole plan rather than clicking week-by-week.

Tasks:

1. In `src/app/app/plans/[id]/page.tsx`, replace (or supplement) the week-arrow navigator with a vertically scrollable calendar that lists all weeks with sticky week headers (week label + date range + total km).
2. Keep an "active week" concept for context (today's week scrolls into view on mount, week-scoped warnings still render against their week).
3. Maintain a compact "Jump to week N" affordance for plans longer than ~12 weeks.
4. Mobile: the existing list view stays primary; ensure it scrolls to today's week on mount.

Acceptance criteria:

- A 13-week plan can be browsed end-to-end with one scroll gesture.
- Today's week is the default focus on plan open.
- Week-scoped warnings still bind to their week (Phase 1 remains correct under the new layout).

Likely files:

- `src/app/app/plans/[id]/page.tsx`
- `src/app/globals.css`

### Phase 5: Remove Hard Minimum-Weeks Gate

Goal: accept any future goal date; coach short runways with a warning instead of refusal.

Tasks:

1. In `src/app/app/plans/new/page.tsx`, replace `infeasibleReason`'s minimum-weeks check with a soft `shortRunwayWarning` returned alongside the form state. The Continue button stays enabled.
2. In `src/domain/training-plan/build-plan.ts` (around lines 657–663), remove the throw on `weeksTotal < minWks`. Allow the curve builder to produce a sensible plan: short plans collapse mostly into taper + race-prep specific work. Add tests covering 2-week, 3-week, and 4-week plans for each goal race.
3. Surface the short-runway warning prominently on the generated plan's header so the runner understands the trade-off.

Acceptance criteria:

- A user can generate a marathon plan with a 14-day runway. The plan shows a clear "Short runway — focus on safe sharpening" warning.
- Existing tests still pass; new tests cover 2/3/4-week plans without throws.
- The user is never blocked from generating a plan for a future date.

Likely files:

- `src/app/app/plans/new/page.tsx`
- `src/domain/training-plan/build-plan.ts`
- `src/domain/training-plan/build-plan.test.ts`

### Phase 6: Collapse Repeated Steps In Tailored Workouts

Goal: render "8x [800 m, 90 s walk]" as one repeat block, not 16 rows.

Tasks:

1. In `src/domain/run-tailor.ts` (around lines 117–142), keep the per-rep `AdjustedStep[]` data (treadmill mode and exports may still need them) but add a derived "groups" structure: contiguous identical (or near-identical) rep+rest pairs collapse into `{ reps: N, run: Step, rest: Step }`.
2. In `src/components/AdjustedWorkoutCard.tsx`, render the grouped form by default. Provide a small "Show every rep" toggle for treadmill execution mode.
3. PNG/PDF/DOCX exports: render the grouped form. Treadmill DOCX may still expand per rep if that is the established treadmill execution format — verify against the existing export tests.
4. Add tests covering: 8 identical reps collapse to one block; 6 identical + one decoy collapse to "Repeat 6x" plus the decoy; mixed paces don't collapse.

Acceptance criteria:

- The 18-step intervals card from the walkthrough renders as ~5 visual rows: warm-up, repeat 8x [800m / walk 90s], cool-down.
- No data is lost; toggling shows full step list.
- Exports follow the same default.

Likely files:

- `src/domain/run-tailor.ts`
- `src/domain/run-tailor.test.ts`
- `src/components/AdjustedWorkoutCard.tsx`
- `src/lib/export.ts`

### Phase 7: Plan-Aware Tailoring Entry

Goal: pick a planned workout to tailor without copy-pasting.

Tasks:

1. In `src/app/app/tailoring/page.tsx`, add a primary "Pick from your plan" picker that lists upcoming sessions from the active plan (today first, then the next 7 days).
2. When a planned session is selected, hydrate the tailoring `parsedWorkout` from the recipe's warmup / main set / cooldown structure. The user proceeds through the same readiness/feeling/push controls.
3. Save the tailored result back as a revision linked to the planned session id; the plan's session detail view should surface today's tailored variant.
4. Keep paste/upload available as an alternative path under the picker, not above it.

Acceptance criteria:

- An active plan owner can tailor today's session in two clicks (open Tailoring → pick today).
- Saved tailored output appears on the planned session detail page as the latest revision.
- Paste/upload still works for ad-hoc workouts.

Likely files:

- `src/app/app/tailoring/page.tsx`
- `src/app/app/plans/[id]/sessions/[sessionId]/page.tsx`
- `src/lib/plan-storage.ts`
- `src/lib/storage.ts`
- `src/domain/run-tailor.ts`

### Phase 8: QA And Regression Coverage

Goal: lock the polish pass.

Tasks:

1. Add tests for week-bucketed warning rendering (unit-level helper).
2. Add tests confirming no auto-derived easy pace string appears in plan header / session detail snapshots.
3. Add tests for short-runway plans (2/3/4 weeks per goal race).
4. Add tests for repeated-step grouping.
5. Manual QA checklist:
   - Open a plan: dates legible on every surface.
   - Week 6 warning appears on Week 6, not Week 1.
   - Plan header shows no "/km easy" string by default.
   - Continuous calendar scrolls; today's week auto-focuses.
   - 14-day marathon plan generates with a short-runway warning.
   - 8×800m tailored card collapses to a "Repeat 8x" block.
   - Tailoring lists today's planned session as the first option.

Likely files:

- `src/domain/training-plan/build-plan.test.ts`
- `src/domain/run-tailor.test.ts`
- `src/app/app/plans/[id]/page.tsx` (snapshot-style assertions if added)
- `README.md` (refresh route descriptions if Tailoring picker changes the IA)

## File-Level Priority Map

Highest user impact:

- `src/app/app/plans/[id]/page.tsx` — Phases 1, 2, 3 (via classes), 4
- `src/components/AdjustedWorkoutCard.tsx` — Phase 6
- `src/app/app/tailoring/page.tsx` — Phase 7

Engine surface area:

- `src/domain/training-plan/build-plan.ts` — Phases 1, 5
- `src/domain/run-tailor.ts` — Phase 6, 7
- `src/domain/training-plan/training-intensity.ts` — Phase 2

Style:

- `src/app/globals.css` — Phase 3, 4

Docs:

- `plans/adaptive-workout-generation/coach-plan-polish.md`
- `README.md`

## Recommended Implementation Order

1. Phase 2 (auto pace removal) — directly addresses the strongest user feedback; small surface.
2. Phase 1 (week-scoped warnings) — removes a visible UX bug.
3. Phase 3 (date legibility) — small CSS pass; pairs naturally with Phase 4.
4. Phase 5 (remove min-weeks gate) — unlocks short-runway users.
5. Phase 6 (collapse repeated steps) — biggest improvement to tailored card readability.
6. Phase 4 (continuous calendar) — larger UI change; benefits from earlier phases settling first.
7. Phase 7 (plan-aware tailoring) — depends on Phase 6 grouping for the saved revision view.
8. Phase 8 (QA) — final.

Start work with:

> Continue implementing `plans/adaptive-workout-generation/coach-plan-polish.md`, starting with Phase 2.

## GSTACK Review Notes

CEO/product review:

- Easy-pace prescription contradicts the product position. Removing it is non-negotiable, not a polish item.
- "We generate any plan you ask for" is a real differentiator vs. Runna. The minimum-weeks gate gives that away for no reason.
- Plan-aware tailoring is the bridge that makes the plan and the tailoring engine feel like one product.

Design review:

- Dates are wayfinding, not metadata — they must outrank surrounding text.
- A continuous scroll matches how runners think about their plan ("what's the next two weeks like?") better than week-by-week clicking.
- Repeating intervals should look like one idea, not eighteen.

Engineering review:

- Phase 1 needs a structured warning shape, not regex on rendered strings — fix it at the source.
- Phase 5 needs tests for very short plans before shipping; the curve builder must not throw.
- Phase 6 should preserve the per-rep data model and only group at render time — exports and treadmill mode still depend on the literal step list.
