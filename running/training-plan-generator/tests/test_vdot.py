"""Tests for VDOT table, pace derivation, and supporting formulas."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from vdot import (
    vdot_from_race,
    paces_from_vdot,
    riegel_predict,
    tanaka_hrmax,
    hr_zones,
    format_pace,
)


def test_tanaka_hrmax():
    # 208 - 0.7 * 30 = 187
    assert tanaka_hrmax(30) == 187
    assert tanaka_hrmax(40) == 180
    assert tanaka_hrmax(50) == 173


def test_riegel_predict():
    # A 25:00 5K runner should predict ~52:09 for 10K.
    five_k_time = 25 * 60  # 1500 s
    predicted = riegel_predict(5000, five_k_time, 10000)
    # Should be roughly 3120–3140 s (~52 min)
    assert 3100 <= predicted <= 3180, f"Got {predicted}"


def test_paces_from_vdot_clamp():
    low = paces_from_vdot(10)   # below table min
    high = paces_from_vdot(100) # above table max
    assert low == paces_from_vdot(30)
    assert high == paces_from_vdot(85)


def test_paces_ordering():
    # For any VDOT, pace order must be: R < I < T < M < E_low
    for vdot in [40, 50, 60, 70]:
        p = paces_from_vdot(vdot)
        assert p["R"] < p["I"] < p["T"] < p["M"] < p["E_low"], (
            f"VDOT {vdot}: pace ordering violated: {p}"
        )


def test_vdot_from_10k_race():
    # 47:00 10K is roughly VDOT 44
    t = 47 * 60
    v = vdot_from_race(10000, t)
    assert 42 <= v <= 46, f"Expected ~44, got {v}"


def test_vdot_from_marathon():
    # 3:30 marathon (~210 min) is roughly VDOT 43
    t = 3 * 3600 + 30 * 60
    v = vdot_from_race(42195, t)
    assert 41 <= v <= 46, f"Expected ~43, got {v}"


def test_hr_zones_coverage():
    zones = hr_zones(190)
    # Zones should be contiguous and cover 50–100% of hrmax
    assert zones["Z1"][0] == 95  # 50% of 190
    assert zones["Z5"][1] == 190
    for name in ("Z1", "Z2", "Z3", "Z4", "Z5"):
        lo, hi = zones[name]
        assert lo < hi, f"Zone {name}: lo >= hi"


def test_format_pace():
    assert format_pace(300) == "5:00 /km"
    assert format_pace(330) == "5:30 /km"
    assert format_pace(270) == "4:30 /km"
