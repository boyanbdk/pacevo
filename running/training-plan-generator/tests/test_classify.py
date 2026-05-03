"""Tests for runner level classification."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from classify_runner import classify_runner, LEVEL_BEGINNER, LEVEL_INTERMEDIATE, LEVEL_ADVANCED


def test_beginner_low_mileage():
    assert classify_runner("marathon", 20, 8) == LEVEL_BEGINNER


def test_intermediate_by_mileage():
    assert classify_runner("half", 45, 16, vdot=44) == LEVEL_INTERMEDIATE


def test_advanced_by_all_signals():
    assert classify_runner("marathon", 100, 32, vdot=60) == LEVEL_ADVANCED


def test_conservative_takes_lowest():
    # High weekly km but very low VDOT and short long run → beginner
    result = classify_runner("marathon", 90, 8, vdot=30)
    assert result == LEVEL_BEGINNER


def test_unknown_goal_raises():
    try:
        classify_runner("triathlon", 50, 20)
        assert False, "Should have raised"
    except ValueError:
        pass


def test_5k_beginner():
    assert classify_runner("5K", 12, 4) == LEVEL_BEGINNER


def test_10k_intermediate():
    assert classify_runner("10K", 40, 12, vdot=43) == LEVEL_INTERMEDIATE
