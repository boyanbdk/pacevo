#!/usr/bin/env python3
"""Convert running workout segments to treadmill speed and rounded duration."""

from __future__ import annotations

import argparse
import math


PUSH_ORDER = ["easy", "normal", "hard"]


def parse_pace(value: str) -> int:
    parts = value.strip().split(":")
    if len(parts) != 2:
        raise argparse.ArgumentTypeError("pace must be in M:SS format, e.g. 4:00")
    try:
        minutes = int(parts[0])
        seconds = int(parts[1])
    except ValueError as exc:
        raise argparse.ArgumentTypeError("pace must contain numbers, e.g. 4:00") from exc
    if minutes < 0 or seconds < 0 or seconds >= 60:
        raise argparse.ArgumentTypeError("pace seconds must be 0-59")
    return minutes * 60 + seconds


def format_pace(seconds: int) -> str:
    minutes, remainder = divmod(seconds, 60)
    return f"{minutes}:{remainder:02d}"


def parse_pace_window(value: str) -> tuple[int, int]:
    parts = value.strip().split("-")
    if len(parts) != 2:
        raise argparse.ArgumentTypeError("pace window must be FAST-SLOW, e.g. 3:50-4:10")
    first = parse_pace(parts[0])
    second = parse_pace(parts[1])
    return min(first, second), max(first, second)


def round_to_5(seconds: float) -> int:
    return int(round(seconds / 5.0) * 5)


def round_up_10(seconds: float) -> int:
    return int(math.ceil(seconds / 10.0) * 10)


def format_distance(distance_km: float) -> str:
    if distance_km < 1:
        return f"{distance_km * 1000:.0f} m"
    return f"{distance_km:.1f} km"


def format_run(distance_km: float, pace_seconds: int, mode: str) -> str:
    speed_kmh = 3600.0 / pace_seconds
    speed_and_pace = f"{speed_kmh:.1f} km/h ({format_pace(pace_seconds)}/km)"
    if mode == "distance":
        return f"{speed_and_pace} until {format_distance(distance_km)}"
    raw_seconds = distance_km * pace_seconds
    rounded_seconds = round_up_10(raw_seconds)
    return f"{speed_and_pace} for {rounded_seconds} sec (raw {raw_seconds:.0f} sec)"


def format_rest(rest_seconds: int, rest_speed: float) -> str:
    return f"{rest_speed:.1f} km/h walk for {round_up_10(rest_seconds)} sec"


def adjusted_push(push: str, feeling: int) -> str:
    if feeling <= 3:
        if push == "hard":
            return "controlled-hard"
        if push == "normal":
            return "easy-normal"
        return "easy"
    if feeling >= 8:
        if push == "hard":
            return "hard-plus"
        if push == "normal":
            return "normal-plus"
    return push


def interval_paces(reps: int, target: int, pace_window: tuple[int, int], push: str, feeling: int) -> list[int]:
    fast, slow = pace_window
    lane = adjusted_push(push, feeling)
    controlled_fast = round_to_5((target + fast) / 2.0)
    easy_start = slow + (10 if feeling <= 6 else 5)
    hard_finish = fast - (10 if lane == "hard-plus" else 5)

    if reps <= 0:
        raise ValueError("reps must be positive")

    if lane == "easy":
        paces = [easy_start] + [slow] * max(0, reps - 1)
        if feeling >= 8 and reps >= 4:
            paces[-1] = min(target, slow)
        return paces[:reps]

    if lane == "easy-normal":
        paces = [easy_start] + [slow] * max(0, reps - 1)
        if reps >= 4:
            paces[-1] = target
        return paces[:reps]

    if lane == "controlled-hard":
        paces = [slow] + [target] * max(0, reps - 1)
        if reps >= 4:
            paces[-1] = controlled_fast
        return paces[:reps]

    if lane == "normal":
        paces = [slow] + [target] * max(0, reps - 1)
        if reps >= 6:
            paces[-2:] = [controlled_fast, fast]
        elif reps >= 3:
            paces[-1] = controlled_fast
        return paces[:reps]

    if lane == "normal-plus":
        paces = [slow] + [target] * max(0, reps - 1)
        if reps >= 5:
            paces[-3:] = [controlled_fast, controlled_fast, fast]
        elif reps >= 3:
            paces[-1] = fast
        return paces[:reps]

    paces = [target] + [controlled_fast] * max(0, reps - 1)
    if reps >= 4:
        paces[-2:] = [fast, hard_finish]
    elif reps >= 2:
        paces[-1] = fast
    return paces[:reps]


def print_interval_plan(
    reps: int,
    target_pace: int,
    pace_window: tuple[int, int],
    push: str,
    feeling: int,
    interval_distance: float | None,
    mode: str,
) -> None:
    paces = interval_paces(reps, target_pace, pace_window, push, feeling)
    print(f"adjusted push: {adjusted_push(push, feeling)}")
    for index, pace_seconds in enumerate(paces, start=1):
        speed_kmh = 3600.0 / pace_seconds
        suffix = ""
        if interval_distance is not None:
            if mode == "distance":
                suffix = f", until {format_distance(interval_distance)}"
            else:
                suffix = f", {round_up_10(interval_distance * pace_seconds)} sec"
        print(f"{index}. {speed_kmh:.1f} km/h ({format_pace(pace_seconds)}/km){suffix}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Convert run distance+pace or rest duration to treadmill instructions."
    )
    parser.add_argument("--distance", type=float, help="Run segment distance in km.")
    parser.add_argument("--pace", type=parse_pace, help="Run pace in M:SS per km.")
    parser.add_argument("--mode", choices=["time", "distance"], default="time", help="Output run segments by time or distance.")
    parser.add_argument("--rest-seconds", type=int, help="Walking rest duration in seconds.")
    parser.add_argument("--rest-speed", type=float, default=5.0, help="Walking rest speed in km/h.")
    parser.add_argument("--reps", type=int, help="Number of interval reps to plan.")
    parser.add_argument("--target-pace", type=parse_pace, help="Workout target pace in M:SS per km.")
    parser.add_argument("--pace-window", type=parse_pace_window, help="Workout pace window, e.g. 3:50-4:10.")
    parser.add_argument("--push", choices=PUSH_ORDER, help="Desired push: easy, normal, or hard.")
    parser.add_argument("--feeling", type=int, choices=range(1, 11), help="Feeling score from 1 to 10.")
    parser.add_argument("--interval-distance", type=float, help="Optional interval distance in km for durations.")
    args = parser.parse_args()

    if args.distance is not None or args.pace is not None:
        if args.distance is None or args.pace is None:
            parser.error("--distance and --pace must be provided together")
        print(format_run(args.distance, args.pace, args.mode))

    if args.rest_seconds is not None:
        print(format_rest(args.rest_seconds, args.rest_speed))

    interval_args = [args.reps, args.target_pace, args.pace_window, args.push, args.feeling]
    if any(value is not None for value in interval_args):
        if any(value is None for value in interval_args):
            parser.error("--reps, --target-pace, --pace-window, --push, and --feeling must be provided together")
        print_interval_plan(
            args.reps,
            args.target_pace,
            args.pace_window,
            args.push,
            args.feeling,
            args.interval_distance,
            args.mode,
        )

    if args.distance is None and args.rest_seconds is None and all(value is None for value in interval_args):
        parser.error("provide run, rest, or interval-planning arguments")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
