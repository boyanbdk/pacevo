# 400m Repeats Example

## Original Workout

- Warm-up: 2 km at conversational pace, no faster than 5:10/km.
- Rest: 90 sec walking rest.
- Main set 1: 5 x 400 m at 3:40/km, range 3:30-3:50/km.
- Rest after each rep: 60 sec walking rest.
- Extra rest: 60 sec walking rest.
- Main set 2: 5 x 400 m at 3:40/km, range 3:30-3:50/km.
- Rest after each rep: 60 sec walking rest.
- Extra rest: 60 sec walking rest.
- Cool down: 1 km at conversational pace or slower.

## User Inputs

- Treadmill mode: time-based.
- Easy/warm-up pace: 6:00/km.
- Cool-down pace: 6:30/km.
- Rest walking pace: 5.0 km/h.
- Feeling: 9/10.
- Desired push: easy.

## Adjustment Logic

The desired push is easy, so the workout stays mostly on the slower end of the 3:30-3:50/km interval window. Because feeling is high at 9/10, the final rep is allowed to touch the stated target pace, but the session does not become a hard workout.

## Adjusted Treadmill Workout

| Step | Treadmill instruction | Notes |
| --- | --- | --- |
| Warm-up | 10.0 km/h (6:00/km) for 720 sec | 2 km easy |
| Walk | 5.0 km/h walk for 90 sec | Pre-set rest |
| Rep 1 | 15.3 km/h (3:55/km) for 100 sec | Softer first 400 m |
| Rest | 5.0 km/h walk for 60 sec | Walking rest |
| Reps 2-5 | 15.7 km/h (3:50/km) for 100 sec | First set controlled |
| Rest after each | 5.0 km/h walk for 60 sec | Walking rest |
| Extra rest | 5.0 km/h walk for 60 sec | Between sets |
| Reps 6-9 | 15.7 km/h (3:50/km) for 100 sec | Second set controlled |
| Rest after each | 5.0 km/h walk for 60 sec | Walking rest |
| Rep 10 | 16.4 km/h (3:40/km) for 90 sec | Final rep reaches target |
| Extra rest | 5.0 km/h walk for 60 sec | Optional after final rep |
| Cool down | 9.2 km/h (6:30/km) for 390 sec | 1 km cooldown |
