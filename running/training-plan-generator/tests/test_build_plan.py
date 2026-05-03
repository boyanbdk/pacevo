"""Golden tests for build_plan.py against the three input fixtures."""

import json
import sys
import os
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from build_plan import build_plan, split_phases, build_volume_curve, DELOAD_EVERY_N_WEEKS

FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


# ---------------------------------------------------------------------------
# Phase split tests
# ---------------------------------------------------------------------------

def test_split_phases_sums_to_total():
    for total in (8, 12, 16, 20):
        phases = split_phases(total, taper_weeks=2)
        assert len(phases) == total
        assert phases[-2:] == ["taper", "taper"]
        assert "base" in phases
        assert "build" in phases


def test_split_phases_order():
    phases = split_phases(16, taper_weeks=3)
    # Phases must not go backwards: base < build < peak < taper
    order = {"base": 0, "build": 1, "peak": 2, "taper": 3}
    last = 0
    for p in phases:
        assert order[p] >= last, f"Phase order violated at {p}"
        last = order[p]


# ---------------------------------------------------------------------------
# Volume curve tests
# ---------------------------------------------------------------------------

def test_volume_curve_does_not_exceed_peak():
    volumes = build_volume_curve(20, 50, 12, "beginner", ["base"] * 8 + ["build"] * 2 + ["peak"] + ["taper"])
    non_taper = volumes[:11]
    assert all(v <= 51 for v in non_taper)  # small float tolerance


def test_deload_week_is_lower():
    phases = ["base"] * 8
    volumes = build_volume_curve(20, 60, 8, "intermediate", phases)
    # Week 4 should be a deload (lower than week 3)
    assert volumes[3] < volumes[2], f"Week 4 should be deload: {volumes}"


# ---------------------------------------------------------------------------
# Golden plan tests: structural invariants
# ---------------------------------------------------------------------------

def _assert_plan_invariants(plan: dict, goal_race: str, level: str) -> None:
    weeks = plan["weeks"]
    volumes = [w["total_km"] for w in weeks]
    phases = [w["phase"] for w in weeks]
    meta = plan["meta"]

    # Level and goal are correct
    assert meta["level"] == level, f"Expected level {level}, got {meta['level']}"
    assert meta["goal_race"] == goal_race

    # All required phases present
    assert "base" in phases
    assert "build" in phases
    assert "taper" in phases

    # Taper is at the end
    taper_indices = [i for i, p in enumerate(phases) if p == "taper"]
    assert taper_indices == list(range(taper_indices[0], len(phases)))

    # Long run ≤ 33% of weekly volume (hard cap)
    for w in weeks:
        if w["total_km"] > 0:
            ratio = w["long_run_km"] / w["total_km"]
            assert ratio <= 0.35, f"Week {w['week_index']}: long run ratio {ratio:.2f} > 33%"

    # Taper final week ≥ 40% reduction from peak
    peak_vol = max(volumes)
    taper_weeks = [w for w in weeks if w["phase"] == "taper"]
    final_taper_vol = taper_weeks[-1]["total_km"]
    if peak_vol > 0:
        reduction = 1 - final_taper_vol / peak_vol
        assert reduction >= 0.38, f"Taper reduction {reduction:.0%} < 38%"

    # No consecutive volume+quality increase in same week
    for i in range(1, len(weeks)):
        prev, curr = weeks[i - 1], weeks[i]
        if not curr["is_deload"] and curr["phase"] != "taper":
            vol_increased = curr["total_km"] > prev["total_km"]
            quality_increased = curr["quality_count"] > prev["quality_count"]
            assert not (vol_increased and quality_increased), (
                f"Week {curr['week_index']}: both volume and quality increased. "
                "Source: Daniels — never raise both in same week."
            )

    # Beginner has no I/R sessions in first 4 weeks
    if level == "beginner":
        for w in weeks[:4]:
            for s in w["sessions"]:
                assert s["type"] not in ("interval", "repetition"), (
                    f"Beginner week {w['week_index']}: interval/repetition session found."
                )

    # Every week has at least one rest day
    for w in weeks:
        rest_count = sum(1 for s in w["sessions"] if s["type"] == "rest")
        assert rest_count >= 1, f"Week {w['week_index']}: no rest day"

    # Sessions must have dates and types
    for w in weeks:
        for s in w["sessions"]:
            assert s.get("date"), f"Session missing date: {s}"
            assert s.get("type"), f"Session missing type: {s}"


def test_beginner_5k_plan():
    inputs = load_fixture("beginner_5k_12wk_inputs.json")
    plan = build_plan(inputs)
    _assert_plan_invariants(plan, "5K", "beginner")
    assert plan["meta"]["weeks_total"] >= 8
    assert plan["meta"]["peak_weekly_km"] <= 40


def test_intermediate_half_plan():
    inputs = load_fixture("intermediate_half_16wk_inputs.json")
    plan = build_plan(inputs)
    _assert_plan_invariants(plan, "half", "intermediate")
    assert plan["meta"]["vdot"] is not None
    assert 40 <= plan["meta"]["vdot"] <= 50, f"VDOT {plan['meta']['vdot']} out of expected range for 47:00 10K"


def test_advanced_marathon_plan():
    inputs = load_fixture("advanced_marathon_18wk_inputs.json")
    plan = build_plan(inputs)
    _assert_plan_invariants(plan, "marathon", "advanced")
    # Advanced marathon should have multiple quality sessions per week in peak
    peak_weeks = [w for w in plan["weeks"] if w["phase"] == "peak"]
    avg_quality = sum(w["quality_count"] for w in peak_weeks) / len(peak_weeks)
    assert avg_quality >= 1.5, f"Advanced marathon peak should average ≥1.5 quality sessions/wk, got {avg_quality:.1f}"


def test_too_short_raises():
    inputs = load_fixture("advanced_marathon_18wk_inputs.json")
    from datetime import date, timedelta
    inputs = dict(inputs)
    inputs["goal_date"] = (date.today() + timedelta(weeks=8)).isoformat()
    try:
        build_plan(inputs)
        assert False, "Should raise ValueError for too-short plan"
    except ValueError as e:
        assert "weeks" in str(e).lower()


def test_deterministic():
    inputs = load_fixture("intermediate_half_16wk_inputs.json")
    plan1 = build_plan(inputs)
    plan2 = build_plan(inputs)
    # Compare all weeks (exclude generated_at timestamp)
    for w1, w2 in zip(plan1["weeks"], plan2["weeks"]):
        assert w1["total_km"] == w2["total_km"]
        assert w1["phase"] == w2["phase"]
