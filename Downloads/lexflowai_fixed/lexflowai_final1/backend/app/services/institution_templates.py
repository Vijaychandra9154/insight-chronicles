import json
from pathlib import Path
from threading import Lock
from typing import Optional

TEMPLATES_DIR = Path(__file__).parent.parent / "templates"

# Tolerate known forum-value spelling drift (seeded data uses "lokayukta").
FORUM_ALIASES = {
    "lokayukta": "lokayuktha",
}

_cache: dict[str, Optional[dict]] = {}
_lock = Lock()


def load_template(forum: Optional[str]) -> Optional[dict]:
    if not forum:
        return None

    key = FORUM_ALIASES.get(forum, forum)

    with _lock:
        if key in _cache:
            return _cache[key]

        path = TEMPLATES_DIR / f"{key}.json"
        if not path.exists():
            _cache[key] = None
            return None

        with open(path, "r", encoding="utf-8") as f:
            template = json.load(f)
        _cache[key] = template
        return template
