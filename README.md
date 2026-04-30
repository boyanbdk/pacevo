# workout

Tools to optimize and adapt workouts.

## Running

The `running/` folder contains a reusable workflow for tailoring running workouts from screenshots or text. The goal is to preserve the intent of the original workout while adjusting the actual execution based on:

- Easy/warm-up and cool-down paces.
- Walking rest speed when the workout has rests.
- How good the runner feels that day, from `1-10`.
- Desired push level: `easy`, `normal`, or `hard`.
- Output format: treadmill time-based, treadmill distance-based, or a general running plan.

The main skill lives in `running/run-tailor/`. It asks the required inputs before producing an adjusted workout, then returns each running segment with both speed and pace, for example `12.0 km/h (5:00/km)`.

## Examples

`running/examples/` stores complete sample conversions. Each file shows:

- The original workout.
- The user inputs.
- The adjustment logic.
- The final adjusted workout.

These examples cover intervals, tempo work, and long-run block workouts.
