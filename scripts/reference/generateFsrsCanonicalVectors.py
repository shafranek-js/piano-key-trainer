"""One-off reference generator for FSRS-6 golden vectors.

This script is NOT part of the production build. It pins the canonical py-fsrs
implementation and emits `tests/fixtures/fsrsCanonicalVectors.json`, which the
TypeScript parity tests consume. Python is never a runtime dependency of the app.

Usage:
    pip install --target <tmp>/lib fsrs==6.3.2
    PYTHONPATH=<tmp>/lib python scripts/reference/generateFsrsCanonicalVectors.py

Canonical settings mirror the app policy where the algorithm maps 1:1:
    desired_retention = 0.9
    maximum_interval = 120
    learning_steps = (45s,)
    relearning_steps = (45s,)
    enable_fuzzing = False (the app schedules deterministically)
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fsrs import Card, Rating, Scheduler, State

REFERENCE = {
    "package": "fsrs (py-fsrs)",
    "version": "6.3.2",
    "tag": "v6.3.2",
    "commit": "9446cb06605c597a063aeee49f7d188d42e34dc2",
    "repository": "https://github.com/open-spaced-repetition/py-fsrs",
    "settings": {
        "desiredRetention": 0.9,
        "maximumIntervalDays": 120,
        "learningSeconds": 45,
        "relearningSeconds": 45,
        "enableFuzzing": False,
    },
}

BASE = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)


def make_scheduler() -> Scheduler:
    return Scheduler(
        desired_retention=0.9,
        learning_steps=(timedelta(seconds=45),),
        relearning_steps=(timedelta(seconds=45),),
        maximum_interval=120,
        enable_fuzzing=False,
    )


def state_name(state: State) -> str:
    return state.name.lower()


def formula_vectors(scheduler: Scheduler) -> dict:
    retrievability = []
    for elapsed_days in (0.0, 0.5, 1.0, 1.9, 10.0):
        card = Card()
        card.stability = 10.0
        card.last_review = BASE
        retrievability.append(
            {
                "elapsedDays": elapsed_days,
                "stability": 10.0,
                "expected": scheduler.get_card_retrievability(
                    card, current_datetime=BASE + timedelta(days=elapsed_days)
                ),
            }
        )
    return {
        "initial_stability": [
            {"grade": g, "expected": scheduler._initial_stability(rating=Rating(g))}
            for g in (1, 2, 3, 4)
        ],
        "initial_difficulty": [
            {
                "grade": g,
                "expected_clamped": scheduler._initial_difficulty(rating=Rating(g), clamp=True),
                "expected_raw": scheduler._initial_difficulty(rating=Rating(g), clamp=False),
            }
            for g in (1, 2, 3, 4)
        ],
        "next_difficulty": [
            {
                "difficulty": d,
                "grade": g,
                "expected": scheduler._next_difficulty(difficulty=d, rating=Rating(g)),
            }
            for d in (1.0, 5.0, 8.5)
            for g in (1, 2, 3, 4)
        ],
        "recall_stability": [
            {
                "difficulty": 5.0,
                "stability": 10.0,
                "retrievability": r,
                "grade": g,
                "expected": scheduler._next_recall_stability(
                    difficulty=5.0, stability=10.0, retrievability=r, rating=Rating(g)
                ),
            }
            for r in (0.5, 0.9, 0.98)
            for g in (2, 3, 4)
        ],
        "forget_stability": [
            {
                "difficulty": d,
                "stability": s,
                "retrievability": r,
                "expected": scheduler._next_forget_stability(
                    difficulty=d, stability=s, retrievability=r
                ),
            }
            for (d, s, r) in ((5.0, 10.0, 0.9), (7.5, 1.5, 0.7), (3.0, 60.0, 0.95))
        ],
        "short_term_stability": [
            {
                "stability": s,
                "grade": g,
                "expected": scheduler._short_term_stability(stability=s, rating=Rating(g)),
            }
            for s in (0.5, 10.0)
            for g in (1, 2, 3, 4)
        ],
        "retrievability": retrievability,
        "next_interval": [
            {"stability": s, "expected": scheduler._next_interval(stability=s)}
            for s in (0.5, 1.0, 2.3, 10.0, 100.0, 1000.0)
        ],
        "default_parameters": list(scheduler.parameters),
        "decay": scheduler._DECAY,
        "factor": scheduler._FACTOR,
    }


def sequence_vectors(scheduler: Scheduler) -> list[dict]:
    def simulate(sequence_id: str, steps: list[tuple[int, float]]) -> dict:
        card = Card()
        results = []
        for grade, offset_seconds in steps:
            when = BASE + timedelta(seconds=offset_seconds)
            card, _log = scheduler.review_card(card, Rating(grade), review_datetime=when)
            due_offset = (card.due - when).total_seconds()
            results.append(
                {
                    "grade": grade,
                    "offsetSeconds": offset_seconds,
                    "state": state_name(card.state),
                    "stability": card.stability,
                    "difficulty": card.difficulty,
                    "dueOffsetSeconds": due_offset,
                    "intervalDays": due_offset / 86400.0,
                }
            )
        return {"id": sequence_id, "steps": results}

    return [
        simulate(
            "new_trajectory",
            [
                (3, 0.0),
                (2, 2 * 86400.0),
                (4, 5 * 86400.0),
                (1, 15 * 86400.0),
                (3, 15 * 86400.0 + 45.0),
                (3, 20 * 86400.0 + 45.0),
            ],
        ),
        simulate(
            "same_day_review",
            [
                (3, 0.0),
                (2, 12 * 3600.0),
                (3, 13 * 3600.0),
            ],
        ),
        simulate(
            "overdue_relearning",
            [
                (1, 0.0),
                (3, 2 * 86400.0),
                (3, 5 * 86400.0),
            ],
        ),
        simulate(
            "new_again_hard_good_easy",
            [
                (1, 0.0),
                (2, 45.0),
                (3, 3 * 86400.0 + 45.0),
                (4, 7 * 86400.0 + 45.0),
            ],
        ),
        simulate(
            "multiple_sequential_reviews",
            [
                (3, 0.0),
                (3, 2 * 86400.0),
                (3, 3 * 86400.0),
                (1, 12 * 86400.0),
                (3, 12 * 86400.0 + 45.0),
                (2, 18 * 86400.0 + 45.0),
                (3, 19 * 86400.0 + 45.0),
                (4, 21 * 86400.0 + 45.0),
            ],
        ),
    ]


def main() -> None:
    scheduler = make_scheduler()
    assert math.isclose(scheduler.parameters[20], 0.1542), "FSRS-6 default decay expected"
    payload = {
        "reference": REFERENCE,
        "generatedAt": "2026-10-06T00:00:00Z",
        "formulas": formula_vectors(scheduler),
        "sequences": sequence_vectors(scheduler),
    }
    output = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "fsrsCanonicalVectors.json"
    output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
