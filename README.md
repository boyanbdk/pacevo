# Pacevo

Adaptive running plans, workout tailoring, and feedback-led learning.

## Pacevo Web App

A local Next.js app for building race plans, adapting individual workouts, and learning from session feedback.

## Brand

Motto: **Plan. Adapt. Learn.**

Brand constants live in `src/lib/brand.ts`; raster assets live in `public/brand/`.

### Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Register a local account to get started.

### Verification

```bash
npm test          # unit and domain tests
npm run build     # production build
npm audit --omit=dev
```

### Free Backend Setup

The app still supports local-only usage, but Strava automatic import needs a real backend because Strava webhooks require a public HTTPS URL and OAuth refresh tokens must be stored server-side.

Recommended free-first setup:

1. Create a free Supabase project.
2. Run `db/schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local` and fill in the Supabase and Strava values.
4. Set `NEXT_PUBLIC_APP_URL` to your deployed app URL in production.
5. In Strava API settings, set the authorization callback domain to your app domain.
6. Create a Strava webhook subscription pointing to:

```text
https://your-app.example.com/api/integrations/strava/webhook
```

Connect Strava from `/app/settings`. New Strava activity webhook events are stored server-side, and the plan import panel can load those runs with “Load Strava runs” and match them against planned sessions.

Login and registration also use the database once these env vars are configured. Passwords are hashed server-side, and browser access is controlled by an HttpOnly session cookie.

Current limitation: plans are still stored locally in the browser, so the webhook stores activities automatically, but applying them to a plan still happens when the app loads Strava runs into the existing matcher. The next backend migration should move `SavedPlan` records into Postgres so webhook processing can mark sessions completed without a browser round trip.

### Planning Docs

- Current finish pass: `plans/adaptive-workout-generation/coach-plan-finish.md`
- Baseline execution plan: `plans/adaptive-workout-generation/coach-plan-rebuild.md`
- Plan routing note: `plans/README.md`
- Legacy reference plan: `plans/adaptive-workout-generation/legacy-implementation-plan.md`

### What the app includes

#### One-off workouts (`/app/new`)

- Choose a workout type (recovery, easy, long, tempo, intervals), a target duration, and your level.
- See 3–10 candidate sessions generated from the recipe library — warmup, main set, and cool-down for each.
- Save any candidate to your workout history.

#### Workout adaptation (`/app/tailoring`)

- Paste a workout, upload a screenshot, or pick a planned session, then review the extracted structure.
- Set adaptation inputs: run context (free run or treadmill), output format, easy pace, recovery pace, walking rest pace, feeling (1–10), and push level (easy / normal / hard).
- Generate an adapted workout with correct speeds and paces for each step.
- Satisfaction loop: describe what to change and regenerate.
- Save adapted workouts and view revision history.
- Export the adapted workout card as PNG, PDF, or DOCX.
- Four built-in demo workouts to try immediately: 800 m intervals, tempo 3 km, 400 m repeats, and a block long run.

#### Training plan generator

- Build a personalised multi-week race-prep plan from a six-step onboarding form.
- Supports goals: 5K, 10K, half marathon, marathon.
- Inputs: goal date, current weekly km, longest recent run, recent race time, or a structured estimate (any of 5K / 10K / half / marathon — converted to your goal pace via Riegel), training focus, volume and difficulty preference, intensity display mode, constraints (days/week, session cap, long-run day, surface), and health data (age, HR, injury flags).
- Level (beginner / intermediate / advanced) can be selected, but the engine still infers a safe level from mileage, long-run history, and race estimate; riskier overrides are clamped to the safer level.
- Plans follow VDOT-based pacing, RPE and HR target metadata, polarised 80/20 intensity distribution, structured deload weeks, and evidence-based taper.
- Workouts are generated from a recipe library rather than fixed text, with varied easy, long-run, tempo, interval, hills, and fartlek sessions chosen by goal, phase, level, schedule, and preferences.
- Calendar view on desktop, week list on mobile; each session links to a detail screen with rationale, structure, and pace/RPE/HR display modes.
- Log sessions manually after each run.
- Import completed runs from GPX or TCX files (Garmin, Strava, Coros, Suunto, Apple Health exports). Same-date matches are pre-selected for import; the linked planned session can be changed, detached, or reattached later.
- Like, dislike, favourite, and swap workouts. Feedback persists locally and safely biases future workout selection without increasing hard-session count above guardrails.
- Adaptive layer: after logging or feedback, the plan checks injury flags, ACWR load ratios, aerobic deficit, missed sessions, fitness/VDOT changes, and learned preferences; it creates a new plan version when an adjustment is needed, with a plain-English explanation for every change.
- Full version history — prior weeks are never mutated.
- Export the current plan as PNG (week card), PDF (full plan), or DOCX (structured tables).
- Archive and restore plans from the plans list.

#### Dashboard

- `/app` shows the active goal, current week, phase, plan status, and the next unlogged run.
- Weekly progress cards show completed km, logged sessions, next long run, latest adaptation, learned preference signal, and saved one-off workouts.
- The dashboard includes a compact current-week list, recent logs/imports/adaptations/swaps, and a feedback prompt when the latest completed workout has not been rated.
- Empty state focuses on building a plan or creating a one-off workout; default easy/cool-down paces live in Settings.

### Pages

| Path | Description |
|------|-------------|
| `/login` `/register` | Local auth |
| `/app` | Dashboard — active plan, next run, weekly progress, recent activity |
| `/app/new` | One-off workout chooser — pick type, duration, and level; preview recipe-based candidates and save |
| `/app/tailoring` | Adapt a pasted, uploaded, or planned workout for how you feel today |
| `/app/workouts/[id]` | Saved workout detail, regenerate, export |
| `/app/plans` | All training plans |
| `/app/plans/new` | Plan onboarding form |
| `/app/plans/[id]` | Plan calendar, session logging, imports, adaptations |
| `/app/plans/[id]/sessions/[sessionId]` | Individual session detail, logging, and imported activity link controls |
| `/app/settings` | Default paces and display preferences |

---

## Running skill

`running/run-tailor/` contains the legacy Pacevo Adapt skill origin for adapting workouts from screenshots or text. The web app is built on top of the same algorithm, ported to TypeScript in `src/domain/`. The folder name is retained for compatibility until the optional internal adapter refactor.

## Training plan generator skill

`running/training-plan-generator/` contains the standalone Python skill for generating training plans.

```bash
python running/training-plan-generator/scripts/build_plan.py < inputs.json > plan.json
```

Schemas live in `running/training-plan-generator/schemas/`. Tests:

```bash
python -m pytest running/training-plan-generator/tests/
```

## Examples

`running/examples/` stores complete sample conversions showing the original workout, user inputs, adjustment logic, and final output. These are also the source of the demo workouts in the app.
