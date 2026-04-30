# Tempo 3km Example

## Original Workout

- Warm-up: 2 km at conversational pace, no faster than 5:10/km.
- Session: 3 km at 4:10/km, range 4:00-4:20/km.
- Rest: 150 sec walking rest.
- Cool down: 1.5 km at conversational pace or slower.

## User Inputs

- Treadmill mode: time-based.
- Easy/warm-up pace: 6:15/km.
- Cool-down pace: 6:50/km.
- Rest walking pace: 4.8 km/h.
- Feeling: 3/10.
- Desired push: hard.

## Adjustment Logic

Feeling is low but desired push is hard, so this becomes controlled-hard: still a proper tempo effort, but not the fastest end of the 4:00-4:20/km window. The block starts at 4:20/km and moves to 4:10/km instead of forcing 4:00/km.

## Adjusted Treadmill Workout

| Step | Treadmill instruction | Notes |
| --- | --- | --- |
| Warm-up | 9.6 km/h (6:15/km) for 750 sec | 2 km easy |
| Tempo 1 | 13.8 km/h (4:20/km) for 260 sec | First 1 km controlled |
| Tempo 2 | 14.4 km/h (4:10/km) for 500 sec | Final 2 km at target effort |
| Walk | 4.8 km/h walk for 150 sec | Prescribed rest |
| Cool down | 8.8 km/h (6:50/km) for 620 sec | 1.5 km cooldown, rounded up from 615 sec |
