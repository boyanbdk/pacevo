---
name: run-tailor
description: Adapt running workouts from screenshots or text using the user's current readiness, desired effort, warm-up/cooldown paces, rest pace, and preferred output format. Use when the user provides intervals, tempo runs, threshold runs, marathon or long-run blocks, distances in km/m, paces in min/km, walking rests, or asks to adapt a run for treadmill or general execution. Always ask for output mode, easy/cooldown pace, rest walking pace when rests exist, current feeling from 1-10, and desired push level before finalizing.
---

# Pacevo Adapt

This folder is the legacy `run-tailor` skill origin. Keep the folder and skill name stable until the internal adapter refactor is planned and tested.

## Purpose

Adapt running workouts into clear execution plans using:

- User-provided easy/warm-up and cool-down paces.
- User-provided walking rest speed when the workout has walking rests.
- A readiness adjustment from how the user feels and how hard they want to push.
- The user's preferred output format: treadmill time-based, treadmill distance-based, or general running plan.

Always display run intensity as both speed and pace: `12.0 km/h (5:00/km)`.

## Required Questions

Before converting or adapting any new workout, ask these questions unless the user already provided the answers in the same request:

1. Should the output be treadmill time-based, treadmill distance-based, or a general running plan?
2. What are your easy/warm-up pace and cool-down pace?
3. What is your rest walking pace? Skip this question when the workout has no walking rests.
4. How well do you feel today from `1` to `10`?
5. How hard do you want to push yourself: `easy`, `normal`, or `hard`?

Do not produce the final adjusted workout until these are known. If the user provides only one conversational pace, ask whether it should be used for both warm-up and cool-down.

## Workflow

1. Ask the required questions above.
2. Extract every workout step from the user text or image: warm-up, rests, repeats, intervals, threshold blocks, marathon/long-run blocks, and cool down.
3. Decide target workout paces using the readiness algorithm.
4. Format run segments for the chosen output mode:
   - Treadmill time-based: `km/h (pace/km) for N sec`.
   - Treadmill distance-based: `km/h (pace/km) until N km` or `km/h (pace/km) until N m`.
   - General running plan: `pace/km [km/h] for the prescribed distance/time`, keeping the original run structure.
5. Convert time-based treadmill run segments:
   - `seconds = distance_km * pace_seconds_per_km`
   - `rounded_seconds = ceil(seconds / 10) * 10`
   - `speed_kmh = 3600 / pace_seconds_per_km`
6. Convert distance-based treadmill run segments:
   - Preserve the workout distance.
   - Show the target treadmill speed and the distance to stop at.
   - Do not convert run segments to time unless the user asks for a time estimate.
7. Convert walking rests:
   - Use the user-provided rest walking speed.
   - If the rest is prescribed by time, keep it time-based and round up to the next 10 seconds for treadmill-ready output.
   - If the rest is prescribed by distance, follow the selected output mode unless the user says otherwise.
8. Present the adjusted workout as a numbered list or table with speed plus pace, chosen target, and repeat/rest structure.

## Readiness Algorithm

Use the user's desired push as the main lane, then adjust with how they feel.

- Feeling `1-3`: downshift one lane. `hard` becomes controlled-hard/normal, `normal` becomes easy-normal, `easy` stays easy.
- Feeling `4-7`: use the requested lane.
- Feeling `8-10`: allow one small upshift for `normal` or `hard`; keep `easy` easy unless the user explicitly asks to finish faster.

Do not blindly make a bad-feeling hard day into the hardest version. Keep it hard enough to satisfy the user's intent, but remove the most aggressive finish or make the first half more conservative. Do not make a good-feeling easy day hard; at most let the final rep/block move toward normal if it still feels easy.

## Interval Pace Selection

When an interval workout provides a target pace and a pace window, use the window and the readiness lane to choose the reps.

For a workout like `800m at 4:00/km` with a `3:50-4:10/km` window:

- `easy`: make most intervals near the slow end, `4:10/km`; start around `4:15-4:20/km` if that is still reasonable for the workout.
- `normal`: start around `4:10/km`; put most intervals around target, `4:00/km`; finish around `3:55-3:50/km`.
- `hard`: start around target, `4:00/km`; put most intervals around `3:55-3:50/km`; finish faster than the displayed window only if readiness supports it, around `3:45-3:40/km`.

For interval counts:

- First rep: normally the slowest hard rep.
- Middle reps: hold the main lane pace.
- Last 1-2 reps: progress only when lane and feeling allow.

If there are few reps, keep the progression smaller. If there are many reps, use a gentler ramp and avoid making too many reps faster than the workout window.

## Non-Interval Workouts

For threshold runs, marathon long runs, tempo blocks, steady runs, or workouts without walking rest:

- Skip the rest walking pace question if there is no walking rest.
- Use the same readiness logic, but adjust whole blocks instead of individual reps.
- For `easy`, use the slower side of the prescribed range or add a conservative warm-in.
- For `normal`, use the stated target or the middle of the range.
- For `hard`, use the faster side of the range only if the feeling score supports it.
- Keep long runs and marathon blocks controlled; do not turn them into interval-style progression unless the workout says to progress.

## Conversion Rules

For time-based treadmill run segments:

```text
pace_seconds_per_km = minutes * 60 + seconds
speed_kmh = 3600 / pace_seconds_per_km
segment_seconds = distance_km * pace_seconds_per_km
rounded_segment_seconds = ceil(segment_seconds / 10) * 10
```

For distance-based treadmill run segments:

```text
speed_kmh = 3600 / pace_seconds_per_km
treadmill_target = original_workout_distance
```

Round displayed speeds to one decimal place unless the user asks for more precision.

Important: speed always comes from the target pace. In time-based mode, rounding upward can make the treadmill cover slightly more than the original distance, but it preserves the intended effort. In distance-based mode and general plans, preserve the workout's distance/time structure unless the user asks to transform it.

## Rounding Rule

For treadmill time-based output, always round durations up to a number divisible by 10:

- `93 sec -> 100 sec`
- `61 sec -> 70 sec`
- `192 sec -> 200 sec`
- `188 sec -> 190 sec`

Do not round to the nearest 10; always round upward.

## Script

Use `scripts/run_tailor.py` for deterministic pace, speed, duration, and interval calculations. The script name is legacy and will be renamed in a later internal refactor.

Examples:

```bash
python3 scripts/run_tailor.py --distance 0.8 --pace 4:00
python3 scripts/run_tailor.py --distance 0.8 --pace 4:00 --mode distance
python3 scripts/run_tailor.py --distance 1.6 --pace 6:40
python3 scripts/run_tailor.py --rest-seconds 90 --rest-speed 5
python3 scripts/run_tailor.py --reps 8 --target-pace 4:00 --pace-window 3:50-4:10 --push normal --feeling 7
```

## Output Style

Time-based treadmill:

```text
Warm-up
1. 9.0 km/h (6:40/km) for 640 sec
2. 5.0 km/h walk for 90 sec

Main set
1. 14.4 km/h (4:10/km) for 200 sec, then 5.0 km/h walk for 90 sec
...
```

Distance-based treadmill:

```text
Warm-up
1. 9.0 km/h (6:40/km) until 2.0 km
2. 5.0 km/h walk for 90 sec

Main set
1. 14.4 km/h (4:10/km) until 400 m, then 5.0 km/h walk for 60 sec
...
```

General running plan:

```text
Warm-up
1. 2.0 km at 6:40/km (9.0 km/h)

Main set
1. 800 m at 4:10/km (14.4 km/h), then 90 sec walk
...
```
