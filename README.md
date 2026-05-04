# workout

Tools to optimise and adapt running workouts.

## Run Tailor Web App

A local Next.js app for tailoring individual workouts and building multi-week training plans.

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

### What the app includes

#### Workout tailoring

- Paste a workout or upload a screenshot, then review the extracted structure.
- Set tailoring inputs: run context (free run or treadmill), output format, easy pace, cool-down pace, walking rest pace, feeling (1–10), and push level (easy / normal / hard).
- Generate an adjusted workout with correct speeds and paces for each step.
- Satisfaction loop: describe what to change and regenerate.
- Save workouts and view revision history.
- Export the adjusted workout card as PNG, PDF, or DOCX.
- Four built-in demo workouts to try immediately: 800 m intervals, tempo 3 km, 400 m repeats, and a block long run.

#### Training plan generator

- Build a personalised multi-week race-prep plan from a five-step onboarding form.
- Supports goals: 5K, 10K, half marathon, marathon.
- Inputs: goal date, current weekly km, longest recent run, recent race time (for VDOT), constraints (days/week, session cap, long-run day, surface), and health data (age, HR, injury flags).
- Level (beginner / intermediate / advanced) is inferred from your inputs, not chosen.
- Plans follow VDOT-based pacing, polarised 80/20 intensity distribution, structured deload weeks, and evidence-based taper.
- Calendar view on desktop, week list on mobile; each session links to a detail screen with rationale and pace targets.
- Log sessions manually after each run.
- Import completed runs from GPX or TCX files (Garmin, Strava, Coros, Suunto, Apple Health exports). Same-date matches are applied automatically; date mismatches surface as suggestions.
- Adaptive layer: after logging, the plan checks ACWR load ratios, resting HR trends, aerobic deficit, and missed sessions; it creates a new plan version when an adjustment is needed, with a plain-English explanation for every change.
- Full version history — prior weeks are never mutated.
- Export the current plan as PNG (week card), PDF (full plan), or DOCX (structured tables).
- Archive and restore plans from the plans list.

### Pages

| Path | Description |
|------|-------------|
| `/login` `/register` | Local auth |
| `/app` | Dashboard — active plan + recent workouts |
| `/app/new` | New workout flow |
| `/app/workouts/[id]` | Saved workout detail, regenerate, export |
| `/app/plans` | All training plans |
| `/app/plans/new` | Plan onboarding form |
| `/app/plans/[id]` | Plan calendar, session logging, imports, adaptations |
| `/app/plans/[id]/sessions/[sessionId]` | Individual session detail |
| `/app/settings` | Default paces and display preferences |

---

## Running skill

`running/run-tailor/` contains the original Claude skill for tailoring workouts from screenshots or text. The web app is built on top of the same algorithm, ported to TypeScript in `src/domain/`.

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
