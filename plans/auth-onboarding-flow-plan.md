# Pacevo Auth Onboarding Flow Plan

Date: 2026-05-05
Status: Proposed

## Goal

Create a frictionless first-run auth flow for Pacevo that lets a new runner register quickly, lets an existing runner log in without hunting for the right page, and makes both paths feel like part of the recent Pacevo rebrand.

The flow should keep the existing backend shape:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `src/components/AuthForm.tsx`
- `src/lib/auth-client.ts`

## Product Principle

The user should never need to know whether `/login` or `/register` is the "right" first page. Pacevo should present one auth entry point, then make the account state obvious:

- New to Pacevo: create an account.
- Already have an account: log in.
- Tried the wrong path: switch modes in place without losing the email.
- Session already active: continue directly to the dashboard.

## Current State

The app already has working route-level separation:

- `/login` renders `AuthForm mode="login"`.
- `/register` renders `AuthForm mode="register"`.
- Auth success redirects to `/app`.
- Missing sessions are guarded by `AuthGate` and redirected to `/login`.

The rebrand is also mostly in place:

- `src/lib/brand.ts` owns `BRAND_NAME`, `BRAND_MOTTO`, and asset paths.
- Auth uses the Pacevo mark, motto, and plan/adapt/learn language.
- Global tokens define dark graphite, volt, mist, signal, and semantic colors.

The main UX gap is not capability. It is decision friction. Login and register are separate pages with similar layouts, the mode switch is a text link at the bottom, and the form copy is functional rather than welcoming or state-aware.

## Proposed Flow

### One Primary Auth Surface

Use one shared auth experience for both `/login` and `/register`.

- `/login` defaults to the login mode.
- `/register` defaults to the create-account mode.
- Both routes render the same component and the same visual shell.
- A segmented control at the top of the form switches between `Log in` and `Create account`.
- Switching modes updates the route with `router.replace()` so refresh/share keeps the selected mode.
- Email remains filled when switching modes.
- Password clears when switching modes to avoid accidental submission with the wrong intent.

### Returning User Path

1. User lands on `/login`.
2. Pacevo checks `/api/auth/me` in the background.
3. If a valid session exists, show a brief `Continuing to Pacevo...` state and redirect to `/app`.
4. If no session exists, show `Log in`.
5. User submits email and password.
6. On success, redirect to `/app`.
7. On failure, show a plain-language inline error and keep the email filled.

### New User Path

1. User lands on `/register` or selects `Create account`.
2. Form headline becomes `Create your Pacevo account`.
3. User enters email and password.
4. On success, redirect to `/app`.
5. First authenticated screen should be the dashboard if training data exists, or the strongest first task if empty:
   - Preferred empty-state CTA: `Build a plan`.
   - Secondary CTA: `Adapt a workout`.

### Wrong Path Recovery

If registration fails because the email already exists:

- Error text: `That email already has a Pacevo account. Log in instead.`
- Provide an inline action button: `Log in with this email`.
- Clicking it switches to login mode and keeps the email.

If login fails because the account does not exist:

- Error text: `No Pacevo account exists for that email. Create one instead.`
- Provide an inline action button: `Create account with this email`.
- Clicking it switches to register mode and keeps the email.

This requires either mapping server error messages in `src/lib/auth-client.ts` or returning stable error codes from `src/lib/server/auth.ts` through the API routes.

## Information Architecture

```text
/login or /register
+-- Auth shell
    +-- Brand panel
    |   +-- Pacevo mark
    |   +-- Plan. Adapt. Learn.
    |   +-- Pacevo
    |   +-- One-sentence product promise
    |   +-- Three proof points: Plan / Adapt / Learn
    +-- Auth panel
        +-- Segmented mode control: Log in | Create account
        +-- Contextual heading
        +-- Contextual supporting copy
        +-- Email
        +-- Password
        +-- Inline error or success state
        +-- Primary submit button
        +-- Secondary route-switch text link
```

Primary hierarchy:

1. `Pacevo` and the product promise tell users they are in the right place.
2. The segmented control answers "Do I have an account already?"
3. The form asks only for email and password.
4. Recovery actions fix wrong-path mistakes without starting over.

## Visual Direction

Keep the auth page in tone with the Pacevo rebrand:

- Dark graphite page background.
- Volt primary action.
- Pacevo mark inside the existing circular brand container.
- Small signal-teal accents only for focus rings and selected secondary states.
- No marketing-style hero layout, no extra cards inside cards, and no decorative blobs.
- Use the current 8px radius system.
- Keep text tight and product-specific. Pacevo should feel like a training cockpit, not a startup landing page.

Recommended auth copy:

- Brand panel kicker: `Plan. Adapt. Learn.`
- Brand panel headline: `Pacevo`
- Brand panel body: `Plan your race build, adapt each run to today, and learn from the feedback loop.`
- Login heading: `Welcome back`
- Login body: `Log in to continue your training workspace.`
- Register heading: `Create your Pacevo account`
- Register body: `Start with a private training workspace for plans, adaptations, and session feedback.`
- Session redirect text: `Continuing to Pacevo...`

## Interaction States

| State | What the user sees | Behavior |
| --- | --- | --- |
| Initial login | `Welcome back`, email, password, `Log in` | Email input focused on desktop |
| Initial register | `Create your Pacevo account`, email, password, `Create account` | Email input focused on desktop |
| Switching modes | Same panel, new heading and CTA | Preserve email, clear password, replace route |
| Submitting | Disabled form, primary button shows `Logging in...` or `Creating account...` | Prevent double submit |
| Login success | Brief redirect state if visible | Save user, redirect to `/app` |
| Register success | Brief redirect state if visible | Save user, redirect to `/app` |
| Existing email on register | Inline warning with `Log in with this email` | Switch to login mode |
| Missing account on login | Inline warning with `Create account with this email` | Switch to register mode |
| Invalid password | Inline warning, email preserved | Keep mode unchanged |
| Empty fields | Inline field hints or disabled submit | Do not show server-style failure |
| Network/server failure | Inline warning: `Pacevo could not connect. Try again.` | Keep entered values |

## Mobile Behavior

At small widths:

- Stack brand panel above auth panel.
- Reduce brand panel height so the form is visible without a long scroll.
- Keep the segmented control and submit button full-width.
- Keep touch targets at least 44px tall.
- Keep the metric row readable with three equal columns if it fits, otherwise stack it.
- Avoid hero-scale copy inside the form panel.

## Accessibility

- Use a real tab/segmented control pattern with `aria-pressed` or a semantic radio group.
- Associate labels with email and password inputs.
- Set `autoComplete="email"` on email.
- Set `autoComplete="current-password"` for login and `autoComplete="new-password"` for register.
- Add `required` to both inputs.
- Use `aria-live="polite"` for auth errors and redirect messages.
- Move focus to the error region after failed submit only when the error is not adjacent to the submit button.
- Ensure focus rings remain visible against graphite surfaces.

## Implementation Tasks

### Phase 1: Auth Component Shape

Files:

- `src/components/AuthForm.tsx`
- `src/app/login/page.tsx`
- `src/app/register/page.tsx`

Tasks:

1. Keep `AuthForm` as the shared component, but let it manage an internal `activeMode`.
2. Initialize `activeMode` from the route mode prop.
3. Add a segmented mode switch above the heading.
4. Replace the bottom-only link with both the segmented switch and a small text fallback.
5. Preserve email and clear password when mode changes.
6. Update route with `router.replace(activeMode === "login" ? "/login" : "/register")`.

Acceptance criteria:

- A user can switch between login and registration without leaving the page or retyping email.
- `/login` and `/register` remain valid direct entry URLs.

### Phase 2: Account-State Recovery

Files:

- `src/lib/auth-client.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/register/route.ts`
- `src/lib/server/auth.ts`

Tasks:

1. Return stable auth error codes, not only prose strings:
   - `missing_credentials`
   - `invalid_credentials`
   - `account_exists`
   - `account_not_found`
   - `server_error`
2. Map those codes to user-facing messages in `AuthForm`.
3. Add inline recovery actions for `account_exists` and `account_not_found`.

Acceptance criteria:

- Registering with an existing email offers a one-click switch to login.
- Logging in with an unknown email offers a one-click switch to registration.
- Invalid password does not imply the user needs a new account.

### Phase 3: Session-Aware Entry

Files:

- `src/components/AuthForm.tsx`
- `src/lib/auth-client.ts`

Tasks:

1. On auth page mount, call `currentUser()`.
2. If authenticated, show `Continuing to Pacevo...` and redirect to `/app`.
3. If unauthenticated, render the form normally.
4. Avoid a full-page flash by using the existing auth page background while checking.

Acceptance criteria:

- A signed-in user who visits `/login` or `/register` does not see a dead-end form.
- A signed-out user does not wait longer than the `/api/auth/me` request requires.

### Phase 4: Visual Polish

Files:

- `src/app/globals.css`
- `src/components/AuthForm.tsx`

Tasks:

1. Add `.auth-mode-switch` styling using existing `.segmented` behavior or a focused auth-specific variant.
2. Add `.auth-error-action` for wrong-path recovery buttons.
3. Tighten mobile auth layout so form content is visible on 375px wide screens.
4. Keep current Pacevo colors and radius tokens.

Acceptance criteria:

- Desktop auth page feels like the rebranded app shell.
- Mobile auth page can be completed without awkward scrolling.
- Text does not overflow segmented controls, buttons, or metric cards.

### Phase 5: Verification

Run:

```bash
npm test
npm run lint
npm run typecheck
```

Manual checks:

- `/login` default state.
- `/register` default state.
- Switch login to register and back with email preserved.
- Existing email during registration.
- Unknown email during login.
- Invalid password.
- Valid registration redirects to `/app`.
- Valid login redirects to `/app`.
- Signed-in user visiting `/login` redirects to `/app`.
- Mobile viewport at 375px width.

## Design Review

Initial score: 7/10.

The current auth experience works and already carries the new Pacevo brand. It loses points because account intent is split across two pages, wrong-path recovery depends on generic errors, and session-aware entry is not specified on the auth surface.

Target score: 10/10.

### Pass 1: Information Architecture

Score: 8/10 after this plan.

The plan defines a single shared auth surface, a clear mode switch, and wrong-path recovery. A 10/10 implementation should make the selected mode visible before any form field and keep the route synchronized for shareability.

### Pass 2: Interaction States

Score: 9/10 after this plan.

The state table covers initial, loading, success, common auth failures, and network failure. A 10/10 implementation should use stable server error codes so UX does not depend on parsing message strings.

### Pass 3: Emotional Experience

Score: 9/10 after this plan.

The flow treats wrong-path mistakes as recoverable. A 10/10 implementation should make the redirect and recovery states calm and short, avoiding blame language like "invalid user" or "bad credentials."

### Pass 4: Specific UI

Score: 8/10 after this plan.

The plan specifies the form layout, segmented control, copy, and error actions. A 10/10 implementation should verify the exact mobile layout with a browser screenshot before shipping.

### Pass 5: Brand Alignment

Score: 9/10 after this plan.

The plan reuses Pacevo's graphite, volt, mark, motto, and plan/adapt/learn message. A 10/10 implementation should avoid adding new colors or rounded marketing cards outside the existing token system.

### Pass 6: Accessibility And Responsive Behavior

Score: 8/10 after this plan.

The plan covers labels, autocomplete, required fields, touch targets, live regions, and focus. A 10/10 implementation should confirm keyboard-only mode switching and screen-reader announcement behavior.

### Pass 7: Implementation Fit

Score: 9/10 after this plan.

The plan preserves existing routes, APIs, storage, and brand constants. A 10/10 implementation should add focused tests around auth error-code mapping and mode switching if the test stack supports component or route-level coverage.

## Post-Implementation Design Review

Review date: 2026-05-05
Skill: `/design-review`
Status: DONE_WITH_CONCERNS

The current implementation still falls short of the intended auth onboarding design in four user-visible ways:

1. The auth mode is still controlled only by the route prop, so the page does not yet provide the planned in-panel segmented `Log in` / `Create account` switch.
2. Wrong-path recovery still depends on prose error strings. The API does not return stable `account_exists` or `account_not_found` codes, so the UI cannot offer the planned one-click recovery actions reliably.
3. The auth page does not call `currentUser()` on mount, so a signed-in user can still land on a dead-end login/register form instead of seeing the planned `Continuing to Pacevo...` redirect state.
4. Mobile layout is too tall. At 375px wide, the brand panel renders at roughly 530px high, the form starts around 572px, and the submit button sits below the first viewport. This misses the plan's requirement that the form be visible without awkward scrolling.

Verification notes:

- `npm test` passed: 17 test files, 273 tests.
- `npm run build` passed.
- `npm run lint` failed because `next lint` is no longer a valid verification command in this project setup; it is interpreted as a project directory named `lint`.
- Browser check at `http://localhost:3002/login` found no console errors.

### Phase 6: Post-Implementation Closure Pass

Files:

- `src/components/AuthForm.tsx`
- `src/lib/auth-client.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/register/route.ts`
- `src/lib/server/auth.ts`
- `src/app/globals.css`
- `package.json`

Tasks:

1. Reconcile `AuthForm` with the planned interaction model:
   - Add internal `activeMode` state initialized from the route mode prop.
   - Add the segmented auth mode control above the heading.
   - Preserve email and clear password when modes switch.
   - Replace the route with `/login` or `/register` when mode changes.
2. Finish account-state recovery:
   - Return stable auth error codes from the auth API.
   - Map codes to user-facing messages in the client.
   - Add inline recovery buttons for existing-account and missing-account states.
3. Add session-aware entry:
   - Call `currentUser()` on mount.
   - Show `Continuing to Pacevo...` while redirecting authenticated users to `/app`.
   - Keep the auth background stable while the check runs.
4. Fix mobile auth density:
   - Reduce brand-panel padding, mark size, headline size, and metric row height below 600px.
   - Keep the auth form heading and first field visible in the first mobile viewport.
   - Prefer three compact metric columns or a tighter two-row layout over three full stacked cards on narrow screens.
5. Repair verification commands:
   - Replace `npm run lint` with a working lint/static-analysis command, or remove the script until ESLint is configured for Next 16.
   - Keep `npm test` and `npm run build` as required checks.
6. Add focused regression coverage where the current test stack supports it:
   - Auth error-code mapping.
   - Mode switching preserves email and clears password.
   - Existing session redirects away from auth pages.
7. Re-run visual QA:
   - `/login` and `/register` at 1440px.
   - `/login` and `/register` at 375px.
   - Keyboard-only mode switching and submit flow.

Acceptance criteria:

- The implemented auth surface matches the planned single-surface flow.
- Wrong-path account mistakes are recoverable without retyping email.
- A signed-in user never sees a usable login/register form.
- On 375px mobile, the brand panel no longer pushes the primary form action below an awkward scroll.
- Verification commands in the plan match commands that actually run in this repo.

## Open Decisions

Default recommendation: implement the shared segmented auth surface now, while keeping `/login` and `/register` as direct URLs.

Deferred decisions:

- Whether to add password reset later. It is out of scope until the backend supports email delivery or recovery tokens.
- Whether to add OAuth later. It would reduce password friction but expands security and provider setup work.
- Whether first registration should go to `/app/plans/new` instead of `/app`. This depends on whether the product wants plan creation as the default first job.

## GSTACK REVIEW REPORT

| Review | Skill | Focus | Runs | Status | Findings |
| --- | --- | --- | --- | --- | --- |
| CEO Review | `/plan-ceo-review` | Scope and strategy | 0 | NO REVIEWS YET | Not run for this auth-flow plan |
| Eng Review | `/plan-eng-review` | Architecture and tests | 0 | NO REVIEWS YET | Required before implementation |
| Design Review | `/plan-design-review` | UI and UX gaps | 1 | CLEAR WITH PLAN UPDATES | Auth mode, states, brand, responsive behavior specified |
| Implementation Design Review | `/design-review` | Implemented auth UI and verification gaps | 1 | DONE_WITH_CONCERNS | Added Phase 6 closure pass for missing segmented mode, stable auth codes, session redirect, mobile density, and lint command repair |
| DX Review | `/plan-devex-review` | Developer experience | 0 | NO REVIEWS YET | Not run for this auth-flow plan |
| Final Review | `/review` | Diff safety | 0 | NO REVIEWS YET | Run after implementation diff exists |
