"""
validate_plan.py — standalone guardrail checker.

Usage:
    python validate_plan.py < plan.json

Prints a JSON report: {"valid": bool, "errors": [...], "warnings": [...]}.
Errors are hard violations (plan should be rejected or rebuilt).
Warnings are soft signals (plan is emitted but should be reviewed).
"""

from __future__ import annotations

import json
import sys


def validate(plan: dict) -> dict:
    errors: list[str] = []
    warnings: list[str] = list(plan.get("warnings", []))

    weeks = plan.get("weeks", [])
    volumes = [w["total_km"] for w in weeks]
    phases = [w["phase"] for w in weeks]
    peak_vol = max(volumes) if volumes else 0

    deload_gap = 0
    for i, week in enumerate(weeks):
        phase = week["phase"]
        vol = week["total_km"]
        is_deload = week["is_deload"]

        # --- Hard rules ---

        # Long run must not exceed 33% of weekly volume
        if vol > 0:
            lr_pct = week["long_run_km"] / vol
            if lr_pct > 0.34:
                errors.append(
                    f"Week {i+1}: long run {week['long_run_km']:.1f} km is "
                    f"{lr_pct:.0%} of weekly volume {vol:.1f} km. Hard cap is 33%."
                )

        # ACWR must stay below 1.5 (hard) and below 1.3 (soft)
        acwr = week.get("acwr")
        if acwr is not None:
            if acwr > 1.5:
                errors.append(
                    f"Week {i+1}: ACWR {acwr} exceeds hard limit 1.5. "
                    "Injury risk is significantly elevated. Source: Gabbett 2016."
                )
            elif acwr > 1.3:
                warnings.append(
                    f"Week {i+1}: ACWR {acwr} is in the caution zone (1.3–1.5)."
                )

        # Deload cadence
        if phase != "taper":
            if is_deload:
                deload_gap = 0
            else:
                deload_gap += 1
                if deload_gap > 5:
                    warnings.append(
                        f"Week {i+1}: {deload_gap} consecutive load weeks without a deload. "
                        "Recommended: deload every 3–4 weeks. Source: Pfitzinger."
                    )

    # Taper volume reduction check
    taper_weeks = [w for w in weeks if w["phase"] == "taper"]
    if taper_weeks and peak_vol > 0:
        final_taper_vol = taper_weeks[-1]["total_km"]
        reduction = 1 - final_taper_vol / peak_vol
        if reduction < 0.38:
            errors.append(
                f"Taper insufficient: final taper week {final_taper_vol:.0f} km is only "
                f"{reduction:.0%} below peak. Minimum 40% reduction. Source: Bosquet 2007."
            )

    # Plan must have at least one of each required phase
    present_phases = set(phases)
    for required in ("base", "build", "taper"):
        if required not in present_phases:
            errors.append(f"Plan is missing required phase: '{required}'.")

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
    }


def main() -> None:
    plan = json.loads(sys.stdin.read())
    report = validate(plan)
    json.dump(report, sys.stdout, indent=2)
    if not report["valid"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
