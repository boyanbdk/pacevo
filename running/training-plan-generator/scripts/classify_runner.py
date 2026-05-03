"""
Classify a runner as beginner / intermediate / advanced.

Source: thresholds adapted from Pfitzinger Advanced Marathoning (3rd ed.)
and Hal Higdon Novice/Intermediate/Advanced plan entry criteria.

Classification is deterministic from inputs — the user does not choose their level.
"""

from __future__ import annotations

LEVEL_BEGINNER = "beginner"
LEVEL_INTERMEDIATE = "intermediate"
LEVEL_ADVANCED = "advanced"

# Weekly km thresholds for intermediate / advanced entry, keyed by goal race.
# Below the first threshold -> beginner. Above the second -> advanced.
_WEEKLY_KM_THRESHOLDS: dict[str, tuple[float, float]] = {
    "5K":       (25, 60),
    "10K":      (30, 70),
    "half":     (35, 75),
    "marathon": (50, 90),
}

# Longest-recent-run thresholds (km) for goal race.
_LONG_RUN_THRESHOLDS: dict[str, tuple[float, float]] = {
    "5K":       (5,  12),
    "10K":      (8,  16),
    "half":     (10, 20),
    "marathon": (16, 29),
}

# VDOT thresholds for goal race: (intermediate_entry, advanced_entry).
# A runner near the top of beginner VDOT range who has the mileage is treated
# as intermediate if weekly km also qualifies.
_VDOT_THRESHOLDS: dict[str, tuple[int, int]] = {
    "5K":       (42, 55),
    "10K":      (40, 53),
    "half":     (38, 50),
    "marathon": (36, 48),
}


def classify_runner(
    goal_race: str,
    current_weekly_km: float,
    longest_recent_km: float,
    vdot: int | None = None,
) -> str:
    """
    Return 'beginner', 'intermediate', or 'advanced'.

    All three inputs (weekly_km, long_run_km, and optionally vdot) must agree
    on at least the same level; when they disagree, the most conservative
    (lowest) level wins.
    """
    _normalize = {"5k": "5K", "10k": "10K", "half": "half", "marathon": "marathon"}
    goal = _normalize.get(goal_race.lower().replace(" ", ""), goal_race)
    if goal not in _WEEKLY_KM_THRESHOLDS:
        raise ValueError(f"Unknown goal race: {goal_race!r}")

    km_int, km_adv = _WEEKLY_KM_THRESHOLDS[goal]
    lr_int, lr_adv = _LONG_RUN_THRESHOLDS[goal]

    # Score each signal independently
    levels = []

    if current_weekly_km >= km_adv:
        levels.append(LEVEL_ADVANCED)
    elif current_weekly_km >= km_int:
        levels.append(LEVEL_INTERMEDIATE)
    else:
        levels.append(LEVEL_BEGINNER)

    if longest_recent_km >= lr_adv:
        levels.append(LEVEL_ADVANCED)
    elif longest_recent_km >= lr_int:
        levels.append(LEVEL_INTERMEDIATE)
    else:
        levels.append(LEVEL_BEGINNER)

    if vdot is not None:
        v_int, v_adv = _VDOT_THRESHOLDS[goal]
        if vdot >= v_adv:
            levels.append(LEVEL_ADVANCED)
        elif vdot >= v_int:
            levels.append(LEVEL_INTERMEDIATE)
        else:
            levels.append(LEVEL_BEGINNER)

    # Conservative: take the minimum level across all signals.
    order = [LEVEL_BEGINNER, LEVEL_INTERMEDIATE, LEVEL_ADVANCED]
    return min(levels, key=order.index)
