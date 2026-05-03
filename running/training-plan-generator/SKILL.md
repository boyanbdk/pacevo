# Training Plan Generator Skill

## Trigger

Use this skill when the user asks for a personalised multi-week running training
plan. Triggers include: "build me a training plan", "I want to run a half
marathon in October", "generate a 16-week marathon plan", "I'm training for a
5K", "make me a plan to run my first 10K". Also triggers when the user provides
their current weekly mileage, a goal race, and a goal date.

Do NOT use for single-workout tailoring — that is handled by the `run-tailor`
skill.

## Contract

**Input:** a JSON object matching `schemas/inputs.schema.json`.  
**Output:** a JSON object matching `schemas/plan.schema.json`, printed to stdout.  
**Error:** a JSON object `{"error": "<message>"}` with exit code 1 when the
inputs are invalid or the plan cannot be generated safely.

## How to invoke

```bash
echo '<inputs_json>' | python3 running/training-plan-generator/scripts/build_plan.py
```

Or from any agent that can call Python:

```python
import json, subprocess
result = subprocess.run(
    ["python3", "running/training-plan-generator/scripts/build_plan.py"],
    input=json.dumps(inputs),
    capture_output=True, text=True
)
plan = json.loads(result.stdout)
```

## Required inputs

| Field | Type | Notes |
|---|---|---|
| `goal_race` | `"5K" \| "10K" \| "half" \| "marathon"` | Race distance |
| `goal_date` | ISO date string | Race day |
| `current_weekly_km` | number | 4-week average weekly km |
| `longest_recent_km` | number | Longest run in past 4 weeks |
| `age` | integer | For HRmax estimation |
| `days_per_week` | integer 3–7 | Available training days |

## Optional inputs

| Field | Default | Notes |
|---|---|---|
| `recent_race.distance_m` + `.time_s` | null | Enables VDOT-based paces |
| `max_hr` | Tanaka estimate | Measured HRmax overrides formula |
| `resting_hr` | null | Used for HR zone display |
| `session_minutes_cap` | null | Caps session length |
| `long_run_day` | `"saturday"` | Preferred day for long run |
| `surface` | `"road"` | Road/trail/treadmill/track/mixed |
| `injury_flags` | `[]` | Text flags; currently informational only |

## What the output contains

- `meta`: goal, level (inferred), VDOT, HRmax, plan length, start date.
- `paces`: Daniels zone paces in s/km (E_low, E_high, M, T, I, R).
- `hr_zones`: Z1–Z5 as [low_bpm, high_bpm] pairs.
- `weeks[]`: one object per week with:
  - `phase`: base / build / peak / taper
  - `is_deload`: boolean
  - `total_km`, `long_run_km`, `quality_count`, `acwr`
  - `sessions[]`: one per day (1=Monday), each with type, target_km,
    pace range, HR zone, RPE, description, rationale, warmup, main set,
    cooldown.
- `warnings[]`: soft guardrail alerts (non-fatal).

## Guardrails enforced automatically

- Level is inferred, not chosen: `classify_runner()` uses weekly km, long run, and VDOT.
- Volume and quality never both increase in the same week (Daniels).
- Deload every 4 weeks (Pfitzinger).
- Long run capped at 33% of weekly volume (Daniels).
- Taper drops 40–50% from actual peak volume (Bosquet 2007).
- ACWR computed from week 5 onward; surfaced in `warnings` if > 1.3.
- Beginner plans contain no interval or repetition sessions in weeks 1–4.

## Validating a plan separately

```bash
cat plan.json | python3 running/training-plan-generator/scripts/validate_plan.py
```

Returns `{"valid": true, "errors": [], "warnings": []}`.

## Minimum plan lengths

| Goal | Beginner | Intermediate | Advanced |
|---|---|---|---|
| 5K | 8 wk | 6 wk | 4 wk |
| 10K | 10 wk | 8 wk | 6 wk |
| Half | 12 wk | 10 wk | 8 wk |
| Marathon | 16 wk | 14 wk | 12 wk |

If the goal date is too soon, the skill returns an error with the minimum weeks
required and suggests either a later date or a shorter goal distance.
