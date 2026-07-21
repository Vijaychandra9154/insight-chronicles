"""
Statute currency checker for backend/app/templates/*.json.

Institution templates cite specific Acts/Codes as ground truth for the AI
drafting prompt (see Domain rules in CLAUDE.md: never invent a legal
provision). Those citations go stale on their own schedule whenever India
recodifies a law — e.g. the BNS/BNSS/BSA criminal-law cutover on 1 July 2024,
or the four Labour Codes' nationwide notification on 21 Nov 2025 (the exact
bug this script exists to catch: labour_commissioner.json cited the
repealed Industrial Disputes Act 1947 as if it were still primary law,
months after it had been superseded).

statute_registry.json is the maintained list of known law transitions. This
script cross-references every template's relevant_acts + institution_rules
text against that registry and flags:
  - OUTDATED: a superseded statute is cited with no confirmed mention of
    the replacement Code anywhere in the same template — exits non-zero,
    meant to block/gate.
  - HEDGED: the replacement Code is mentioned, but only next to hedge
    language ("where notified", "if applicable", "not yet in force", ...)
    that treats its adoption as uncertain rather than settled. This is the
    exact shape labour_commissioner.json's original bug took — it *did*
    mention the Industrial Relations Code, 2020, but only as "...or the
    Industrial Relations Code, 2020 where notified", which read as correct
    to a naive presence check while actually still asserting the repealed
    Industrial Disputes Act 1947 as primary law months after the cutover.
    Advisory, not blocking, since the heuristic is naturally imprecise —
    but worth a human look every time it fires.
  - REVIEW DUE / NEVER REVIEWED: templates missing a last_reviewed date,
    or last reviewed more than STALE_REVIEW_DAYS ago — advisory only.

When India enacts/notifies a new recodification, add an entry to
statute_registry.json rather than hardcoding it here.

Run manually:
    python -m app.check_statute_currency
"""
import json
import sys
from datetime import date
from pathlib import Path

APP_DIR = Path(__file__).parent
TEMPLATES_DIR = APP_DIR / "templates"
REGISTRY_PATH = APP_DIR / "statute_registry.json"

STALE_REVIEW_DAYS = 180

HEDGE_PHRASES = [
    "where notified",
    "if notified",
    "once notified",
    "yet to be notified",
    "not yet in force",
    "not yet notified",
    "not yet adopted",
    "not yet applicable",
    "if applicable",
    "if in force",
    "where applicable",
    "still transitioning",
    "transitioning from",
    "transitioning to",
    "yet to notify",
    "yet to adopt",
]
HEDGE_WINDOW_CHARS = 60


def _template_text(template: dict) -> str:
    parts = template.get("relevant_acts") or []
    parts.append(template.get("institution_rules") or "")
    return " ".join(parts).lower()


def _is_hedged_mention(text: str, statute: str) -> bool:
    """True if every occurrence of `statute` in `text` sits next to hedge
    language treating its adoption as uncertain rather than settled."""
    statute = statute.lower()
    start = 0
    found_any = False
    while True:
        idx = text.find(statute, start)
        if idx == -1:
            break
        found_any = True
        window = text[max(0, idx - HEDGE_WINDOW_CHARS): idx + len(statute) + HEDGE_WINDOW_CHARS]
        if not any(h in window for h in HEDGE_PHRASES):
            return False  # at least one confident, unhedged mention exists
        start = idx + len(statute)
    return found_any


def _load_templates() -> dict[str, dict]:
    templates = {}
    for path in sorted(TEMPLATES_DIR.glob("*.json")):
        with open(path, "r", encoding="utf-8") as f:
            templates[path.stem] = json.load(f)
    return templates


def check() -> int:
    with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
        registry = json.load(f)["transitions"]

    templates = _load_templates()
    today = date.today()
    outdated_count = 0
    hedged_count = 0
    review_warnings = []

    for name, template in templates.items():
        text = _template_text(template)

        for transition in registry:
            effective = date.fromisoformat(transition["effective_date"])
            old_hits = [s for s in transition["old_statutes"] if s.lower() in text]
            if not old_hits:
                continue
            if today < effective:
                continue  # transition not due yet, old statute is still correct

            new_hits = [s for s in transition["new_statutes"] if s.lower() in text]
            if not new_hits:
                outdated_count += 1
                print(
                    f"OUTDATED  {name}.json cites {old_hits} — superseded by "
                    f"{transition['new_statutes']} effective {transition['effective_date']} "
                    f"({transition['note']})"
                )
                continue

            if all(_is_hedged_mention(text, s) for s in new_hits):
                hedged_count += 1
                print(
                    f"HEDGED    {name}.json cites {old_hits} and mentions "
                    f"{new_hits}, but only next to hedge language (e.g. 'where notified') "
                    f"— confirm whether the cutover ({transition['effective_date']}) should now "
                    f"be asserted as settled rather than uncertain"
                )

        last_reviewed = template.get("last_reviewed")
        if not last_reviewed:
            review_warnings.append(f"NEVER REVIEWED  {name}.json has no last_reviewed date")
        else:
            reviewed_date = date.fromisoformat(last_reviewed)
            age_days = (today - reviewed_date).days
            if age_days > STALE_REVIEW_DAYS:
                review_warnings.append(
                    f"REVIEW DUE      {name}.json last reviewed {last_reviewed} ({age_days} days ago)"
                )

    if review_warnings:
        print()
        for w in review_warnings:
            print(w)

    print()
    print(
        f"{len(templates)} templates checked — {outdated_count} outdated, "
        f"{hedged_count} hedged, {len(review_warnings)} review warnings."
    )
    return 1 if outdated_count else 0


if __name__ == "__main__":
    sys.exit(check())
