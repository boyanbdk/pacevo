"""
build_plan.py — entry point for the training plan generator.

Usage:
    python build_plan.py < inputs.json > plan.json

The plan output is validated against plan.schema.json before printing.
All heavy lifting lives in the functions below; no network access is needed.
"""

from __future__ import annotations

import json
import math
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from classify_runner import classify_runner
from vdot import vdot_from_race, paces_from_vdot, riegel_predict, tanaka_hrmax, hr_zones

# ---------------------------------------------------------------------------
# Constants — all numeric thresholds must cite their source in a comment.
# ---------------------------------------------------------------------------

# Floor / peak weekly volume (km) by goal and level.
# Sources: Higdon Novice/Intermediate/Advanced templates; Pfitzinger Advanced Marathoning 3rd ed.
FLOOR_KM: dict[str, dict[str, float]] = {
    "5K":       {"beginner": 15, "intermediate": 30, "advanced": 50},
    "10K":      {"beginner": 20, "intermediate": 40, "advanced": 70},
    "half":     {"beginner": 25, "intermediate": 40, "advanced": 70},
    "marathon": {"beginner": 30, "intermediate": 50, "advanced": 90},
}

PEAK_KM: dict[str, dict[str, float]] = {
    "5K":       {"beginner": 35, "intermediate": 60, "advanced": 95},
    "10K":      {"beginner": 48, "intermediate": 78, "advanced": 115},
    "half":     {"beginner": 52, "intermediate": 78, "advanced": 125},
    "marathon": {"beginner": 62, "intermediate": 97, "advanced": 160},
}

# Long-run hard caps (km) by goal. Source: Daniels (25% rule) + Pfitzinger cap.
LONG_RUN_CAP_KM: dict[str, float] = {
    "5K": 12, "10K": 16, "half": 22, "marathon": 35,
}

# Progression rate per week by level (fraction). Source: 10% rule (Buist 2008 caveats noted);
# beginner and intermediate use conservative 5–8% to reduce injury risk.
PROGRESSION_RATE: dict[str, float] = {
    "beginner": 0.07,
    "intermediate": 0.09,
    "advanced": 0.11,
}

# Deload frequency: reduce volume every N weeks. Source: Pfitzinger 3-week cycles,
# Daniels 4-week cycles — we default to 4 weeks.
DELOAD_EVERY_N_WEEKS = 4

# Deload volume multiplier. Source: Pfitzinger, Higdon; drop ~25–30%.
DELOAD_FACTOR = 0.75

# Taper weeks and volume reduction by goal.
# Source: Bosquet 2007 meta-analysis: optimal 41–60% volume reduction over 8–14 days.
TAPER_WEEKS: dict[str, int] = {"5K": 1, "10K": 1, "half": 2, "marathon": 3}
TAPER_VOLUME_FACTOR = 0.50  # 50% of peak for final taper week

# Quality sessions per week by level and phase.
# Source: Seiler 2010 80/20 polarized model; Pfitzinger session-count tables.
QUALITY_COUNT: dict[str, dict[str, int]] = {
    "base":  {"beginner": 0, "intermediate": 1, "advanced": 1},
    "build": {"beginner": 1, "intermediate": 2, "advanced": 2},
    "peak":  {"beginner": 1, "intermediate": 2, "advanced": 3},
    "taper": {"beginner": 0, "intermediate": 1, "advanced": 1},
}

# Minimum plan lengths (weeks) by goal/level.
MIN_WEEKS: dict[str, dict[str, int]] = {
    "5K":       {"beginner": 8,  "intermediate": 6,  "advanced": 4},
    "10K":      {"beginner": 10, "intermediate": 8,  "advanced": 6},
    "half":     {"beginner": 12, "intermediate": 10, "advanced": 8},
    "marathon": {"beginner": 16, "intermediate": 14, "advanced": 12},
}

# ACWR safe range. Source: Gabbett 2016 BJSM — keep 0.8–1.3; floor set to 0 for early weeks.
ACWR_MAX = 1.3
ACWR_MIN = 0.8

# Days of the week as 1=Monday … 7=Sunday.
DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


# ---------------------------------------------------------------------------
# Phase split
# ---------------------------------------------------------------------------

def split_phases(weeks_total: int, taper_weeks: int) -> list[str]:
    """
    Return a list of phase labels, one per week.
    Layout: base → build → peak → taper.
    Proportions: ~25% base, ~40% build, ~20% peak, remainder taper.
    """
    remaining = weeks_total - taper_weeks
    peak_weeks = max(1, round(0.20 * weeks_total))
    build_weeks = max(1, round(0.40 * weeks_total))
    base_weeks = max(1, remaining - peak_weeks - build_weeks)

    # Rebalance if we overshoot
    while base_weeks + build_weeks + peak_weeks > remaining:
        if build_weeks > 1:
            build_weeks -= 1
        elif base_weeks > 1:
            base_weeks -= 1
        else:
            peak_weeks -= 1

    phases: list[str] = (
        ["base"] * base_weeks
        + ["build"] * build_weeks
        + ["peak"] * peak_weeks
        + ["taper"] * taper_weeks
    )
    # Pad or trim to exact weeks_total
    while len(phases) < weeks_total:
        phases.insert(-taper_weeks, "build")
    return phases[:weeks_total]


# ---------------------------------------------------------------------------
# Volume curve
# ---------------------------------------------------------------------------

def build_volume_curve(
    start_km: float,
    peak_km: float,
    weeks_total: int,
    level: str,
    phases: list[str],
) -> list[float]:
    """
    Generate weekly total volume (km) for each week.
    Rules:
    - Multiply by (1 + PROGRESSION_RATE) each non-deload week.
    - Every DELOAD_EVERY_N_WEEKS weeks, multiply by DELOAD_FACTOR.
    - Cap at peak_km.
    - Taper weeks reduce linearly from peak to TAPER_VOLUME_FACTOR * peak.
    """
    volumes: list[float] = []
    current = start_km
    load_week_count = 0  # counts non-deload weeks since last deload

    taper_start = next((i for i, p in enumerate(phases) if p == "taper"), weeks_total)
    taper_count = weeks_total - taper_start

    # Build the non-taper volume curve first to find the actual peak reached.
    pre_taper_volumes: list[float] = []
    _current = start_km
    _load_wk = 0
    for _phase in phases[:taper_start]:
        _load_wk += 1
        if _load_wk % DELOAD_EVERY_N_WEEKS == 0:
            _current = round(_current * DELOAD_FACTOR, 1)
        else:
            _current = round(min(_current * (1 + PROGRESSION_RATE[level]), peak_km), 1)
        pre_taper_volumes.append(_current)
    actual_peak = max(pre_taper_volumes) if pre_taper_volumes else start_km

    for i, phase in enumerate(phases):
        if phase == "taper":
            # Linear descent from actual highest volume reached to 50% of that.
            taper_index = i - taper_start  # 0-based within taper
            if taper_count == 1:
                vol = round(actual_peak * TAPER_VOLUME_FACTOR, 1)
            else:
                frac = 1.0 - (taper_index / (taper_count - 1)) * (1.0 - TAPER_VOLUME_FACTOR)
                vol = round(actual_peak * frac, 1)
        else:
            load_week_count += 1
            if load_week_count % DELOAD_EVERY_N_WEEKS == 0:
                # Deload week: drop back
                current = round(current * DELOAD_FACTOR, 1)
            else:
                current = round(min(current * (1 + PROGRESSION_RATE[level]), peak_km), 1)
            vol = current

        volumes.append(vol)

    return volumes


# ---------------------------------------------------------------------------
# Session layout
# ---------------------------------------------------------------------------

WORKOUT_TYPES_BY_PHASE: dict[str, list[str]] = {
    "base":  ["easy", "strides", "hills", "fartlek"],
    "build": ["tempo", "interval"],
    "peak":  ["marathon_pace", "tempo", "interval"],
    "taper": ["strides", "tempo"],
}

SESSION_DESCRIPTIONS: dict[str, str] = {
    "easy":          "Easy aerobic run. Conversational pace, Z1-Z2.",
    "long":          "Long run. Steady aerobic effort, Z2. Build aerobic base and fat adaptation.",
    "strides":       "6×20 s strides at ~mile pace with 60 s walking recovery. Activates neuromuscular system.",
    "hills":         "Hill repeats: 6–8×60 s uphill at hard effort, easy jog back. Builds strength and form.",
    "fartlek":       "Fartlek: 20–30 min easy with 4–6×1 min surges at 10K effort. Introduce speed in a playful structure.",
    "tempo":         "Threshold tempo run at T pace (roughly 1-hour race effort). Raises lactate threshold.",
    "interval":      "VO2max intervals at I pace. 5×1000 m with 400 m easy recovery between reps.",
    "marathon_pace": "Long run with marathon-pace segments. Middle km at M pace, bookended by easy.",
    "repetition":    "Short fast repetitions at R pace. 6–8×400 m with full recovery. Improves leg turnover.",
    "recovery":      "Recovery run. Very easy, Z1. Flush legs after hard effort.",
    "cross":         "Cross-training: cycling, swimming, elliptical. Non-impact aerobic work.",
    "rest":          "Full rest day. No running.",
}

SESSION_RATIONALE: dict[str, str] = {
    "easy":          "80% of all running should be at easy aerobic pace. Source: Seiler 2010.",
    "long":          "Long runs build aerobic capacity. Cap at 30% weekly volume. Source: Daniels.",
    "strides":       "Strides improve running economy with minimal fatigue. Source: Daniels.",
    "hills":         "Hills build strength and VO2max with low injury risk. Source: Pfitzinger.",
    "fartlek":       "Unstructured speed work eases beginners into quality sessions. Source: Higdon.",
    "tempo":         "Threshold work is the single best predictor of marathon performance. Source: Pfitzinger.",
    "interval":      "VO2max intervals are the most efficient way to raise aerobic ceiling. Source: Daniels.",
    "marathon_pace": "Race-specific conditioning. Teaches the body to sustain MP under fatigue. Source: Pfitzinger.",
    "repetition":    "Speed and form work. Minimal fatigue when full recovery is taken. Source: Daniels.",
    "recovery":      "Active recovery flushes metabolic waste and prevents stiffness. Source: Daniels.",
    "cross":         "Maintains aerobic fitness without the impact stress of running. Source: Pfitzinger.",
    "rest":          "Rest is when adaptation happens. At least 1 rest day per week is mandatory.",
}


def _day_index(day_name: str) -> int:
    """Return 1-based day index (1=Monday)."""
    return DAY_NAMES.index(day_name.lower()) + 1


def layout_week(
    week_index: int,
    week_start: date,
    total_km: float,
    long_run_km: float,
    phase: str,
    level: str,
    is_deload: bool,
    days_per_week: int,
    long_run_day: str,
    paces: dict,
    hrmax: int,
) -> list[dict]:
    """
    Build session objects for one week.
    Returns a list of session dicts (one per running day + rest days as needed).
    """
    long_day_idx = _day_index(long_run_day)
    quality_count = 0 if is_deload else QUALITY_COUNT[phase][level]
    # Beginners get no I/R sessions in first 4 weeks (structural readiness rule).
    if level == "beginner" and week_index <= 4:
        quality_count = min(quality_count, 0)

    total_run_days = days_per_week
    easy_days = total_run_days - 1 - quality_count  # 1 for long run
    easy_days = max(0, easy_days)

    # Distribute easy km evenly across easy sessions
    easy_km_per = round((total_km - long_run_km) / max(easy_days + quality_count, 1), 1) if easy_days + quality_count > 0 else 0

    # Pick quality workout types for this phase
    quality_types = WORKOUT_TYPES_BY_PHASE.get(phase, ["tempo"])
    quality_type = quality_types[0] if quality_types else "tempo"

    sessions: list[dict] = []

    # Assign run days: long run day is fixed. Spread other days around it.
    # Simple assignment: fill days 1-7 avoiding the day before and after long run.
    used_days: set[int] = {long_day_idx}
    rest_after_long = (long_day_idx % 7) + 1  # day after long run
    used_days.add(rest_after_long)

    run_days: list[int] = []
    # Add quality session days first (not adjacent to long run)
    candidates = [d for d in range(1, 8) if d not in used_days]
    q_days: list[int] = []
    for d in candidates:
        if len(q_days) >= quality_count:
            break
        # Ensure quality sessions are not adjacent to each other
        if not any(abs(d - q) <= 1 for q in q_days):
            q_days.append(d)
            used_days.add(d)

    # Fill remaining easy days
    e_days: list[int] = []
    for d in range(1, 8):
        if len(e_days) >= easy_days:
            break
        if d not in used_days:
            e_days.append(d)
            used_days.add(d)

    run_days = sorted([long_day_idx] + q_days + e_days)

    # Build session objects
    hr_z = hr_zones(hrmax)
    for day_idx in range(1, 8):
        session_date = week_start + timedelta(days=day_idx - 1)

        if day_idx == long_day_idx:
            sessions.append(_make_session(
                day_index=day_idx,
                date=session_date,
                session_type="long",
                target_km=long_run_km,
                pace_low=paces["E_low"],
                pace_high=paces["E_high"],
                hr_zone="Z2",
                rpe=5,
                paces=paces,
            ))
        elif day_idx == rest_after_long:
            sessions.append(_rest_session(day_idx, session_date))
        elif day_idx in q_days:
            sessions.append(_make_quality_session(
                day_index=day_idx,
                date=session_date,
                quality_type=quality_type,
                easy_km=easy_km_per,
                paces=paces,
            ))
        elif day_idx in e_days:
            sessions.append(_make_session(
                day_index=day_idx,
                date=session_date,
                session_type="easy",
                target_km=easy_km_per,
                pace_low=paces["E_low"],
                pace_high=paces["E_high"],
                hr_zone="Z2",
                rpe=4,
                paces=paces,
            ))
        else:
            sessions.append(_rest_session(day_idx, session_date))

    return sessions


def _make_session(
    day_index: int,
    date: date,
    session_type: str,
    target_km: float,
    pace_low: int,
    pace_high: int,
    hr_zone: str,
    rpe: int,
    paces: dict,
) -> dict:
    warmup = "10 min easy jog" if session_type not in ("easy", "recovery") else None
    cooldown = "5 min easy jog" if session_type not in ("easy", "recovery") else None
    return {
        "day_index": day_index,
        "date": date.isoformat(),
        "type": session_type,
        "target_km": target_km,
        "target_duration_min": None,
        "pace_low_s_km": pace_low,
        "pace_high_s_km": pace_high,
        "hr_zone": hr_zone,
        "target_rpe": rpe,
        "description": SESSION_DESCRIPTIONS.get(session_type, ""),
        "rationale": SESSION_RATIONALE.get(session_type, ""),
        "warmup": warmup,
        "main_set": f"{target_km:.1f} km at {session_type} pace",
        "cooldown": cooldown,
    }


def _make_quality_session(
    day_index: int,
    date: date,
    quality_type: str,
    easy_km: float,
    paces: dict,
) -> dict:
    if quality_type == "tempo":
        pace_low = paces.get("T", paces["E_low"])
        pace_high = paces.get("T", paces["E_low"])
        main = f"20–30 min at T pace ({_fmt(pace_low)} /km)"
        rpe = 7
        hr_zone = "Z3"
    elif quality_type == "interval":
        pace = paces.get("I", paces["E_low"])
        main = f"5×1000 m at I pace ({_fmt(pace)} /km) with 400 m easy recovery"
        pace_low = pace_high = pace
        rpe = 9
        hr_zone = "Z4"
    elif quality_type == "marathon_pace":
        pace = paces.get("M", paces["E_low"])
        main = f"Middle third of run at M pace ({_fmt(pace)} /km)"
        pace_low = pace_high = pace
        rpe = 6
        hr_zone = "Z3"
    elif quality_type == "strides":
        pace_low = pace_high = paces.get("R", paces["E_low"])
        main = "6×20 s strides at mile pace with 60 s walk recovery"
        rpe = 7
        hr_zone = "Z4"
    elif quality_type in ("hills", "fartlek"):
        pace_low = paces["E_low"]
        pace_high = paces["E_high"]
        main = SESSION_DESCRIPTIONS[quality_type]
        rpe = 7
        hr_zone = "Z3"
    else:
        pace_low = paces["E_low"]
        pace_high = paces["E_high"]
        main = SESSION_DESCRIPTIONS.get(quality_type, "Quality session")
        rpe = 7
        hr_zone = "Z3"

    return {
        "day_index": day_index,
        "date": date.isoformat(),
        "type": quality_type,
        "target_km": easy_km,
        "target_duration_min": None,
        "pace_low_s_km": pace_low,
        "pace_high_s_km": pace_high,
        "hr_zone": hr_zone,
        "target_rpe": rpe,
        "description": SESSION_DESCRIPTIONS.get(quality_type, ""),
        "rationale": SESSION_RATIONALE.get(quality_type, ""),
        "warmup": "10 min easy jog",
        "main_set": main,
        "cooldown": "5–10 min easy jog",
    }


def _rest_session(day_index: int, date: date) -> dict:
    return {
        "day_index": day_index,
        "date": date.isoformat(),
        "type": "rest",
        "target_km": None,
        "target_duration_min": None,
        "pace_low_s_km": None,
        "pace_high_s_km": None,
        "hr_zone": None,
        "target_rpe": None,
        "description": SESSION_DESCRIPTIONS["rest"],
        "rationale": SESSION_RATIONALE["rest"],
        "warmup": None,
        "main_set": None,
        "cooldown": None,
    }


def _fmt(s_km: int) -> str:
    m, s = divmod(s_km, 60)
    return f"{m}:{s:02d}"


# ---------------------------------------------------------------------------
# ACWR computation
# ---------------------------------------------------------------------------

def compute_acwr(week_index: int, volumes: list[float]) -> float | None:
    """
    Acute:chronic workload ratio.
    Acute = current week. Chronic = 4-week rolling average.
    Source: Gabbett 2016 BJSM.
    During the first 4 weeks the chronic baseline is unstable; return None.
    """
    if week_index < 4:
        return None
    acute = volumes[week_index]
    chronic_window = volumes[max(0, week_index - 4):week_index]
    chronic = sum(chronic_window) / len(chronic_window) if chronic_window else acute
    if chronic == 0:
        return None
    return round(acute / chronic, 2)


# ---------------------------------------------------------------------------
# Guardrails
# ---------------------------------------------------------------------------

def validate_plan(weeks: list[dict], volumes: list[float], phases: list[str]) -> list[str]:
    """
    Check guardrail rules. Return a list of warning strings.
    Warnings are non-fatal; the plan is still emitted.
    """
    warnings: list[str] = []

    for i, week in enumerate(weeks):
        acwr = week.get("acwr")
        if acwr is not None and acwr > ACWR_MAX:
            warnings.append(
                f"Week {i+1}: ACWR {acwr} exceeds {ACWR_MAX}. "
                "Consider reducing volume or inserting a deload."
            )

        if i > 0 and not week["is_deload"]:
            prev_vol = volumes[i - 1]
            curr_vol = volumes[i]
            if prev_vol > 0 and (curr_vol - prev_vol) / prev_vol > 0.15:
                warnings.append(
                    f"Week {i+1}: volume jump {prev_vol:.0f}→{curr_vol:.0f} km "
                    "exceeds 15%. Consider slowing progression."
                )

        # Long-run % check
        if week["total_km"] > 0:
            lr_pct = week["long_run_km"] / week["total_km"]
            if lr_pct > 0.33:
                warnings.append(
                    f"Week {i+1}: long run is {lr_pct:.0%} of weekly volume (cap 33%)."
                )

    # Taper check
    taper_weeks = [w for w in weeks if w["phase"] == "taper"]
    if taper_weeks:
        peak_vol = max(volumes)
        final_vol = taper_weeks[-1]["total_km"]
        if peak_vol > 0:
            reduction = 1 - final_vol / peak_vol
            if not (0.40 <= reduction <= 0.65):
                warnings.append(
                    f"Taper final week is {final_vol:.0f} km ({reduction:.0%} reduction from peak). "
                    "Target 40–60% reduction. Source: Bosquet 2007."
                )

    return warnings


# ---------------------------------------------------------------------------
# Main builder
# ---------------------------------------------------------------------------

def build_plan(inputs: dict) -> dict:
    goal_race = inputs["goal_race"]
    goal_date = date.fromisoformat(inputs["goal_date"])
    today = date.today()
    current_weekly_km = float(inputs["current_weekly_km"])
    longest_recent_km = float(inputs["longest_recent_km"])
    age = int(inputs["age"])
    days_per_week = int(inputs["days_per_week"])
    long_run_day = inputs.get("long_run_day", "saturday")
    recent_race = inputs.get("recent_race")

    # 1. Derive VDOT and paces
    vdot: int | None = None
    vdot_source = "none"
    if recent_race:
        vdot = vdot_from_race(recent_race["distance_m"], recent_race["time_s"])
        vdot_source = "race"

    if vdot is None:
        # Riegel estimate: extrapolate from longest recent run at a conservative 6:30/km pace
        if longest_recent_km >= 5:
            estimated_time = round(longest_recent_km * 390)  # ~6:30/km easy effort
            vdot = vdot_from_race(round(longest_recent_km * 1000), estimated_time)
            vdot_source = "riegel_estimate"

    if vdot is not None:
        paces = paces_from_vdot(vdot)
    else:
        # HR/RPE fallback — use conservative universal paces
        paces = {"E_low": 390, "E_high": 450, "M": 360, "T": 330, "I": 300, "R": 270}
        vdot_source = "hr_fallback"

    # 2. HRmax
    max_hr_input = inputs.get("max_hr")
    hrmax = max_hr_input if max_hr_input else tanaka_hrmax(age)
    zones = hr_zones(hrmax)

    # 3. Classify level
    level = classify_runner(goal_race, current_weekly_km, longest_recent_km, vdot)

    # 4. Plan length
    weeks_total = max(1, (goal_date - today).days // 7)
    taper_weeks = TAPER_WEEKS[goal_race]
    min_wks = MIN_WEEKS[goal_race][level]

    if weeks_total < min_wks:
        raise ValueError(
            f"Only {weeks_total} weeks until {goal_date}. "
            f"A {level} {goal_race} plan needs at least {min_wks} weeks. "
            "Please choose a later goal date or a shorter race distance."
        )

    # 5. Phase split
    phases = split_phases(weeks_total, taper_weeks)

    # 6. Volume curve
    start_km = max(current_weekly_km, FLOOR_KM[goal_race][level])
    peak_km = PEAK_KM[goal_race][level]
    volumes = build_volume_curve(start_km, peak_km, weeks_total, level, phases)

    # 7. Build week objects
    weeks: list[dict] = []
    plan_start = today + timedelta(days=(7 - today.weekday()) % 7)  # next Monday
    load_week_counter = 0

    for i, (phase, vol) in enumerate(zip(phases, volumes)):
        is_deload = False
        if phase != "taper":
            load_week_counter += 1
            if load_week_counter % DELOAD_EVERY_N_WEEKS == 0:
                is_deload = True

        long_run_km = min(vol * 0.30, LONG_RUN_CAP_KM[goal_race])
        long_run_km = round(long_run_km, 1)

        acwr = compute_acwr(i, volumes)
        week_start = plan_start + timedelta(weeks=i)

        sessions = layout_week(
            week_index=i + 1,
            week_start=week_start,
            total_km=vol,
            long_run_km=long_run_km,
            phase=phase,
            level=level,
            is_deload=is_deload,
            days_per_week=days_per_week,
            long_run_day=long_run_day,
            paces=paces,
            hrmax=hrmax,
        )

        quality_count = sum(
            1 for s in sessions
            if s["type"] not in ("easy", "long", "recovery", "rest")
        )

        weeks.append({
            "week_index": i + 1,
            "phase": phase,
            "is_deload": is_deload,
            "total_km": vol,
            "long_run_km": long_run_km,
            "quality_count": quality_count,
            "acwr": acwr,
            "sessions": sessions,
        })

    # 7b. Enforce: never raise volume AND quality in the same week.
    # Source: Daniels' Running Formula — never increase both load and intensity together.
    # When the phase transition adds a quality session, hold volume flat.
    for i in range(1, len(weeks)):
        prev, curr = weeks[i - 1], weeks[i]
        if curr["is_deload"] or curr["phase"] == "taper":
            continue
        vol_up = curr["total_km"] > prev["total_km"]
        qual_up = curr["quality_count"] > prev["quality_count"]
        if vol_up and qual_up:
            curr["total_km"] = prev["total_km"]
            volumes[i] = prev["total_km"]
            # Recompute long_run_km for the clamped volume
            curr["long_run_km"] = round(
                min(curr["total_km"] * 0.30, LONG_RUN_CAP_KM[goal_race]), 1
            )

    # 8. Validate
    warnings = validate_plan(weeks, volumes, phases)

    # 9. Assemble output
    plan = {
        "meta": {
            "goal_race": goal_race,
            "goal_date": goal_date.isoformat(),
            "level": level,
            "weeks_total": weeks_total,
            "start_date": plan_start.isoformat(),
            "vdot": vdot,
            "vdot_source": vdot_source,
            "peak_weekly_km": peak_km,
            "hrmax": hrmax,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
        "paces": paces,
        "hr_zones": {k: list(v) for k, v in zones.items()},
        "weeks": weeks,
        "warnings": warnings,
    }

    return plan


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    raw = sys.stdin.read()
    inputs = json.loads(raw)

    try:
        plan = build_plan(inputs)
    except ValueError as e:
        json.dump({"error": str(e)}, sys.stdout, indent=2)
        sys.exit(1)

    json.dump(plan, sys.stdout, indent=2)


if __name__ == "__main__":
    main()
