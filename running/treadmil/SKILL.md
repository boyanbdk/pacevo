---
name: treadmil
description: Convert outdoor running workouts from distances and paces into treadmill-ready steps with km/h speed plus either time-based or distance-based instructions. Use when the user provides a running workout, screenshot, intervals, distances in km/m, paces in min/km, walking rests, conversational pace, threshold runs, marathon long runs, or asks what treadmill speed and time/distance to use. Always ask whether the output should be time-based or distance-based, easy/cooldown pace, rest walking pace when rests exist, current feeling from 1-10, and desired push level before converting. For time-based output, always round run/rest durations up to the next 10-second increment.
---

# Treadmil

## Purpose

Convert distance-based run workouts into treadmill instructions using:

- Treadmill speed in km/h.
- Either time in seconds or treadmill distance targets, depending on what the user chooses.
- Time-based durations rounded up to the next multiple of 10.
- User-provided easy/warm-up and cool-down paces.
- User-provided walking rest speed when the workout has walking rests.
- A readiness adjustment from how the user feels and how hard they want to push.

The skill name is intentionally `treadmil`.

## Required Questions

Before converting any new workout, ask these questions unless the user already provided the answers in the same request:

1. Should this be time-based or distance-based on the treadmill?
2. What are your easy/warm-up pace and cool-down pace?
3. What is your rest walking pace? Skip this question when the workout has no walking rests.
4. How well do you feel today from `1` to `10`?
5. How hard do you want to push yourself: `easy`, `normal`, or `hard`?

Do not produce the final treadmill conversion until these are known. If the user provides only one conversational pace, ask whether it should be used for both warm-up and cool-down.

## Workflow

1. Ask the required questions above.
2. Extract every workout step from the user text or image: warm-up, rests, repeats, intervals, threshold blocks, marathon/long-run blocks, and cool down.
3. Decide target workout paces using the readiness algorithm.
4. Convert each run segment for the chosen output mode:
   - Time-based: show `km/h (pace/km) for N sec`.
   - Distance-based: show `km/h (pace/km) until N km` or `km/h (pace/km) until N m`.
5. Convert time-based run segments:
   - `seconds = distance_km * pace_seconds_per_km`
   - `rounded_seconds = ceil(seconds / 10) * 10`
   - `speed_kmh = 3600 / pace_seconds_per_km`
6. Convert distance-based run segments:
   - Preserve the workout distance.
   - Show the target treadmill speed and the distance to stop at.
   - Do not convert run segments to time unless the user asks for a time estimate.
7. Convert each walking rest:
   - Use the user-provided rest walking speed.
   - If the rest is prescribed by time, keep it time-based and round up to the next 10 seconds.
   - If the rest is prescribed by distance, follow the selected output mode unless the user says otherwise.
8. Present the treadmill workout as a numbered list or table with speed plus pace, chosen target (`time` or `distance`), and repeat/rest structure.

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

For time-based run segments:

```text
pace_seconds_per_km = minutes * 60 + seconds
speed_kmh = 3600 / pace_seconds_per_km
segment_seconds = distance_km * pace_seconds_per_km
rounded_segment_seconds = ceil(segment_seconds / 10) * 10
```

Round displayed speeds to one decimal place unless the user asks for more precision.
Always display pace beside speed for runs: `12.0 km/h (5:00/km)`. For walking rests, display speed and add pace only if the user asks.

For distance-based run segments:

```text
speed_kmh = 3600 / pace_seconds_per_km
treadmill_target = original_workout_distance
```

Important: speed always comes from the target pace. In time-based mode, rounding upward can make the treadmill cover slightly more than the original distance, but it preserves the intended effort. In distance-based mode, preserve the exact workout distance and skip duration rounding for run segments.

## Rounding Rule

Always round durations up to a number divisible by 10:

- `93 sec -> 100 sec`
- `61 sec -> 70 sec`
- `192 sec -> 200 sec`
- `188 sec -> 190 sec`

Do not round to the nearest 10; always round upward.

## Script

Use `scripts/treadmil_convert.py` for deterministic calculations or to check arithmetic.

Examples:

```bash
python3 scripts/treadmil_convert.py --distance 0.8 --pace 4:00
python3 scripts/treadmil_convert.py --distance 0.8 --pace 4:00 --mode distance
python3 scripts/treadmil_convert.py --distance 1.6 --pace 6:40
python3 scripts/treadmil_convert.py --rest-seconds 90 --rest-speed 5
python3 scripts/treadmil_convert.py --reps 8 --target-pace 4:00 --pace-window 3:50-4:10 --push normal --feeling 7
```

## Output Style

Prefer this concise format:

Time-based:

```text
Warm-up
1. 9.0 km/h (6:40/km) for 640 sec
2. 5.0 km/h walk for 90 sec

Main set
1. 14.4 km/h (4:10/km) for 200 sec, then 5.0 km/h walk for 90 sec
...

Cool down
9.0 km/h (6:40/km) for 400 sec
```

Distance-based:

```text
Warm-up
1. 9.0 km/h (6:40/km) until 2.0 km
2. 5.0 km/h walk for 90 sec

Main set
1. 14.4 km/h (4:10/km) until 400 m, then 5.0 km/h walk for 60 sec
...

Cool down
9.0 km/h (6:40/km) until 1.0 km
```

Include the source pace in parentheses for interval runs when useful, especially if the workout has progression.
