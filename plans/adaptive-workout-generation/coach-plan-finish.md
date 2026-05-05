# Coach Plan Finish

## Decision

A second polish pass to close the gaps surfaced during the May 5, 2026 walkthrough. The previous polish pass (`coach-plan-polish.md`) addressed warning placement, easy-pace prescription on the plan header, date legibility, the continuous calendar surface, the minimum-weeks gate, repeated-step grouping, and plan-aware tailoring. This pass tightens the surfaces that those changes exposed: how the calendar reacts to scroll, what belongs in the primary navigation, where the plan actually ends, what we display for easy/recovery sessions on the session detail surface, and how imported activities bind to planned sessions.

Each item is local. Together they decide whether the app reads as a confident coach or as a noisy generator.

## Inputs

- Walkthrough screenshots from May 5, 2026: continuous calendar with sidebar week list, session detail Structure card.
- User feedback captured the same day on calendar animation, navigation hierarchy, plan completion, easy-pace targets in the Structure card, and activity-to-session linking.
- Current canonical plan: `plans/adaptive-workout-generation/coach-plan-polish.md` (Phases 1–8 implemented).

## Walkthrough Findings

1. **Sidebar reacts too fast to scroll.** The IntersectionObserver in `src/app/app/plans/[id]/page.tsx` (~line 827) flips the active sidebar week the instant the next week crosses the threshold. The active-state change drives a visible color/border/glow swap — at scroll speed it strobes between weeks and is unpleasant.
2. **Settings lives in the primary nav.** `src/components/AppShell.tsx:16` puts Settings as a top-level sidebar item alongside Dashboard, New workout, Tailor, and Training plans. Settings is configuration, not a place a runner goes during a session — it doesn't belong in the day-to-day navigation.
3. **Plan ends one week before the goal date.** A plan generated with `goal_date = 2026-08-09` (a Sunday) renders weeks 1–13 ending Aug 2, with no week 14 and no race-day session on Aug 9. `weeksTotal = Math.ceil((goalDateObj - today) / msPerWeek)` in `src/domain/training-plan/build-plan.ts:668` is computed from the raw `today` rather than from week 1's aligned Monday, so it can come up one short. There is also no race-day session inserted on `goal_date`.
4. **Structure card prescribes easy pace.** Session detail still shows `5.6 km at easy pace (5:17–6:18 /km)` on a Monday Easy run, even though `defaultEasyPace` in Settings is the user's input and `showEasyRunPaceTargets` defaults off. The Structure copy comes from `session.main_set` somewhere that still injects pace metadata for easy/recovery sessions. For these sessions the Structure card should display RPE and HR-zone guidance only.
5. **Imported activities can't be relinked.** `matchImportedActivities` in `src/domain/training-plan/activity-import.ts:202` chooses the best-scoring planned session by date+distance and writes it to a completed entry. If the user disagrees (it picked the wrong one, or attached an activity to a planned session that wasn't actually that run), there is no UI to change the link or detach.

## Non-Negotiable Rules

- The active sidebar week must change in a way that doesn't strobe under fast scroll. One change per scroll-stop, not one change per week boundary crossed.
- The primary nav holds running surfaces only (Dashboard, New, Tailor, Plans). Settings moves out of that nav.
- A plan generated for goal date D contains a week that includes D, and inserts a race-day session on D.
- The Structure card on Easy/Recovery sessions does not show pace targets. RPE and HR zones only, with the user's Settings pace optionally surfaced as "your easy pace setting" — never as a derived prescription.
- Every imported activity's link to a planned session is editable: the user can re-link to a different session or detach entirely, including after the activity was imported as completed.

## Execution Phases

### Phase 1: Calmer Sidebar Active-Week Behavior

Goal: remove the strobing active-state swap as the user scrolls the continuous calendar.

Tasks:

1. In `src/app/app/plans/[id]/page.tsx` (the IntersectionObserver around line 827), debounce the active-week change. Two options, pick the one that feels right after a quick spike:
   - Use `rootMargin` to widen the dead zone so only the dominant week in view becomes active.
   - Throttle `setWeekIndex` updates to fire at most once every ~200 ms while a scroll is in flight, then settle on the final week on `scrollend` (or on a debounced trailing edge).
2. Soften the active-state visual on the sidebar card in `src/app/globals.css`. Whatever the current treatment is (border / background / glow), add `transition: ... 180ms ease-out` so even an instant flip fades rather than snaps. Drop any transform/scale from the active state — pure color is enough.
3. Don't auto-scroll the sidebar to the active card on every change; only scroll into view when the active week is fully outside the sidebar viewport.

Acceptance criteria:

- Scrolling smoothly through a 13-week plan does not produce visible color flashes on the sidebar.
- Stopping scroll on any week settles the sidebar on that week within ~200 ms.
- Sidebar list does not auto-scroll while the active card is already visible.

Likely files:

- `src/app/app/plans/[id]/page.tsx`
- `src/app/globals.css`

### Phase 2: Demote Settings From Primary Nav

Goal: take Settings out of the day-to-day surface; make it a profile-level affordance.

Tasks:

1. In `src/components/AppShell.tsx`, remove Settings from `navItems`. Add a small profile/settings button at the bottom of the sidebar (above or beside Sign out) that links to `/app/settings` with a gear icon and a label like "Settings".
2. In the mobile top bar, expose the same affordance via a small icon button on the right (next to or replacing the existing one), or via a profile menu — pick whichever is least disruptive to the current mobile IA.
3. Verify deep links to `/app/settings` still work; verify pathname highlighting on the new affordance doesn't depend on it being in `navItems`.

Acceptance criteria:

- Settings is reachable in one click from any app surface, but is no longer one of the four primary nav rows.
- Sign out remains where it is.
- Mobile IA still has a path to Settings.

Likely files:

- `src/components/AppShell.tsx`
- `src/app/globals.css` (only if the new affordance needs styling)

### Phase 3: Race-Day Week And Race-Day Session

Goal: every plan ends on a week that contains the goal date and includes a Race session on that date.

Tasks:

1. In `src/domain/training-plan/build-plan.ts`:
   - Snap `weekOneStart` to the Monday of `today`'s week (or whatever start-of-week the rest of the plan assumes).
   - Compute `weeksTotal` as the number of week buckets needed for the goal date to fall inside the final bucket: `weeksTotal = Math.ceil((goalDateObj - weekOneStart) / msPerWeek + 1e-9)`. Add a unit test for the Aug 9 case (goal Sunday) and a Monday-goal case to lock down off-by-one behavior.
   - Insert a `race_day` (or equivalent `SessionType`) session on the day matching `goal_date` in the final week. The session's main_set is the goal race itself: e.g. "Goal race: 10K." The taper plan should not double-book that day with another session.
2. Update `src/domain/training-plan/types.ts` if a new `SessionType` value is needed; otherwise reuse an existing tag.
3. Update Structure / session-detail rendering to recognize the race-day session and show race-specific copy ("Race day. Trust the taper. Warm up easy, run your goal pace, race smart.") rather than a generic recipe.
4. Tests:
   - `build-plan.test.ts`: a plan with `goal_date` on a Sunday, Monday, and mid-week each contain a final week that includes the goal date.
   - The final week's last session is the race-day session, on `goal_date`.
   - The plan's total km includes the race distance.

Acceptance criteria:

- The screenshot scenario (goal Aug 9, plan opened May 5) generates a 14th week ending Aug 9 with a Race session on Aug 9.
- No regression for users whose goal date already aligned to a clean week count.

Likely files:

- `src/domain/training-plan/build-plan.ts`
- `src/domain/training-plan/build-plan.test.ts`
- `src/domain/training-plan/types.ts`
- `src/app/app/plans/[id]/sessions/[sessionId]/page.tsx`
- `src/lib/plan-display.ts`

### Phase 4: Strip Easy-Pace Prescription From The Structure Card

Goal: Easy/Recovery Structure copy expresses effort, not a derived target pace.

Tasks:

1. Trace how the Structure card text "5.6 km at easy pace (5:17–6:18 /km)" is built. Candidates:
   - A `main_set` writer in `build-plan.ts` or a per-session formatter that decorates the recipe string with `paces.E_low`/`E_high`.
   - A view-side enrichment in `src/app/app/plans/[id]/sessions/[sessionId]/page.tsx`.
   Whichever path is responsible, gate it behind `EASY_PACE_SUPPRESSED_TYPES` (already defined in `training-intensity.ts`) and `settings.showEasyRunPaceTargets`.
2. For Easy/Recovery sessions, the Structure card should read like the recipe ("X km easy at conversational effort, Z1–Z2") with no `(M:SS–M:SS /km)` suffix unless `showEasyRunPaceTargets` is on.
3. The session card's primary intensity block already shows RPE and HR via `renderIntensity` with `displayMode = "hr"` for these types — confirm both are present. Keep "your easy pace setting" copy from Settings as a quiet secondary line, not a target.
4. Tests:
   - Snapshot/unit: Easy and Recovery sessions render Structure copy without a pace range under default settings.
   - Toggling `showEasyRunPaceTargets` brings the user's `defaultEasyPace` back, labelled as a setting.

Acceptance criteria:

- Opening any Easy/Recovery session under default settings shows no `(M:SS–M:SS /km)` in Structure.
- Hard sessions (tempo/threshold/intervals/MP/strides) still show pace targets unchanged.
- Tests cover the new rule.

Likely files:

- `src/app/app/plans/[id]/sessions/[sessionId]/page.tsx`
- `src/domain/training-plan/training-intensity.ts`
- `src/domain/training-plan/build-plan.ts` (only if main_set is decorated there)
- `src/lib/plan-display.ts`

### Phase 5: Link / Unlink Imported Activities

Goal: the user owns the binding between an imported activity and a planned session.

Tasks:

1. **Storage shape.** In `src/lib/plan-storage.ts` (and corresponding `storage.ts` if completed sessions live there), make sure each `CompletedSession` retains a stable `activityId` reference and that an `ImportedActivity` has its own persisted record with a `linkedSessionRef: { weekIndex, dayIndex } | null`. If the schema doesn't already separate them, split it: an activity exists independently, and a completed-session entry points to it.
2. **Import flow.** In `src/domain/training-plan/activity-import.ts`, keep the existing `matchImportedActivities` scoring, but treat its output as a *suggestion only*. Status `auto` becomes `pre-selected` — the user still confirms before the activity is committed as a logged session.
3. **UI: review screen.** The plan's import tab (in `src/app/app/plans/[id]/page.tsx`) already lists matches. Add per-row controls:
   - "Change" → opens a small picker of all unlogged sessions in a ±10 day window around the activity date.
   - "Detach" → keeps the activity in the imports list but removes its `linkedSessionRef`. Activities with no link can later be linked manually.
4. **UI: per-session detail.** On `src/app/app/plans/[id]/sessions/[sessionId]/page.tsx`, when a logged activity is attached, show "Linked to: <activity name>, <date>" with an "Unlink" button. When unlinked, the planned session reverts to unlogged. An "Attach activity" affordance shows when no activity is linked and there are unlinked activities in the plan's import history.
5. **Tests:**
   - `activity-import.test.ts`: matching still works; user override does not regress score-based suggestions.
   - New unit tests in `plan-storage.test.ts` cover relink and detach: cycle activity A from session X → detach → reattach to session Y, then verify both X and Y states are correct.

Acceptance criteria:

- A user who imported a wrong-matched activity can detach it and attach it to the right session in three clicks.
- Detaching an activity returns the source planned session to "unlogged".
- The activity itself is not deleted on detach; it remains available to reattach.

Likely files:

- `src/domain/training-plan/activity-import.ts`
- `src/domain/training-plan/activity-import.test.ts`
- `src/lib/plan-storage.ts`
- `src/lib/plan-storage.test.ts`
- `src/app/app/plans/[id]/page.tsx`
- `src/app/app/plans/[id]/sessions/[sessionId]/page.tsx`

### Phase 6: QA And Regression Coverage

Goal: lock the finish pass.

Tasks:

1. Manual QA checklist:
   - Sidebar does not strobe under fast scroll on a 13-week plan.
   - Settings is no longer in the primary nav; still reachable.
   - A plan with `goal_date = 2026-08-09` (created on 2026-05-05) shows week 14 ending Aug 9, with a Race session on Aug 9.
   - No `(M:SS–M:SS /km)` text on Easy/Recovery Structure under default settings; toggling the easy-pace-targets setting brings the user's setting back.
   - Imported activity attached to wrong session can be re-linked or detached; a detached activity can be reattached.
2. Run the existing unit suites and the new tests added per phase.

Likely files:

- `src/domain/training-plan/build-plan.test.ts`
- `src/lib/plan-storage.test.ts`
- `src/domain/training-plan/activity-import.test.ts`
- `src/domain/training-plan/training-intensity.test.ts`
- `README.md` (only if the import / linking flow gains a new route)

## File-Level Priority Map

Highest user impact:

- `src/domain/training-plan/build-plan.ts` — Phase 3 (race-day week and session)
- `src/app/app/plans/[id]/sessions/[sessionId]/page.tsx` — Phases 4, 5
- `src/app/app/plans/[id]/page.tsx` — Phases 1, 5
- `src/components/AppShell.tsx` — Phase 2

Engine surface area:

- `src/domain/training-plan/activity-import.ts` — Phase 5
- `src/lib/plan-storage.ts` — Phase 5
- `src/domain/training-plan/training-intensity.ts` — Phase 4

Style:

- `src/app/globals.css` — Phase 1, 2 (light)

Docs:

- `plans/adaptive-workout-generation/coach-plan-finish.md`

## Recommended Implementation Order

1. Phase 3 (race-day week and session) — fixes a correctness bug; everything else is polish.
2. Phase 4 (strip easy-pace prescription) — directly user-flagged, small surface, completes the rule started in the previous pass.
3. Phase 2 (demote Settings) — small IA cleanup; unblocks any future sidebar additions.
4. Phase 1 (calmer sidebar) — UX polish around the continuous calendar.
5. Phase 5 (link/unlink activities) — biggest feature scope; landing it last lets the smaller fixes ship independently.
6. Phase 6 (QA) — final.

Start work with:

> Continue implementing `plans/adaptive-workout-generation/coach-plan-finish.md`, starting with Phase 3.

## GSTACK Review Notes

CEO/product review:

- A plan that doesn't include the race day on the race date is a credibility failure, not a polish item — Phase 3 is non-negotiable.
- Easy-pace prescription leaking back into the Structure card is the same rule we already committed to in the previous pass; finishing it everywhere is the point.
- Letting users own the activity-to-session link is what separates a coach app from an upload bucket. Auto-match is helpful; un-overrideable auto-match is hostile.
- Settings does not belong on the same shelf as "what am I doing today". Moving it out signals what the surface is for.

Design review:

- Strobing active-state on scroll is the loudest noise in the current UI; the rest of the calendar work is wasted as long as it's there.
- Race day on the calendar wants to read different from a regular session — the final card on the final week should look like a finish line, not another long run.
- A "Linked to: <activity>" line with an Unlink affordance on the session detail is the correct place for this control. Don't bury it in the import tab.

Engineering review:

- Phase 3's `weeksTotal` fix needs week-aligned arithmetic, not raw timestamp math. Add tests for goal dates on each weekday before changing the formula.
- Phase 4 should follow `EASY_PACE_SUPPRESSED_TYPES` and `showEasyRunPaceTargets` — both already exist; the work is finding the leak, not designing new state.
- Phase 5 wants a clean separation between "imported activity" and "completed session" in storage. If they're currently fused, splitting them is a prerequisite — don't shortcut it with a flag.
- Phase 1's IntersectionObserver fix should use scroll-end signals where supported, with a debounced fallback. Don't introduce framerate-coupled state.
