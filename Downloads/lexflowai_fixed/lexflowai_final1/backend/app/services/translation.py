import os
import re
from typing import Dict, Tuple

import requests

SUPPORTED_LANGS = {"hi-IN", "te-IN"}

_VERIFY_PATTERN = re.compile(r"\[VERIFY:[^\]]*\]")

SARVAM_TRANSLATE_URL = "https://api.sarvam.ai/translate"


def translate(text: str, target_lang: str) -> str:
    if target_lang not in SUPPORTED_LANGS:
        raise ValueError(
            f"Unsupported target_lang '{target_lang}'. Supported: {sorted(SUPPORTED_LANGS)}"
        )

    protected_text, placeholders = _protect_placeholders(text)
    translated = _call_sarvam(protected_text, target_lang)
    return _restore_placeholders(translated, placeholders)


def _protect_placeholders(text: str) -> Tuple[str, Dict[str, str]]:
    placeholders: Dict[str, str] = {}

    def _sub(match: re.Match) -> str:
        token = f"VERIFYTOKEN{len(placeholders)}"
        placeholders[token] = match.group(0)
        return token

    protected_text = _VERIFY_PATTERN.sub(_sub, text)
    return protected_text, placeholders


def _restore_placeholders(text: str, placeholders: Dict[str, str]) -> str:
    for token, original in placeholders.items():
        text = text.replace(token, original)
    return text


def _call_sarvam(text: str, target_lang: str) -> str:
    key = os.getenv("SARVAM_API_KEY")
    if not key:
        raise RuntimeError("SARVAM_API_KEY not set in environment")

    resp = requests.post(
        SARVAM_TRANSLATE_URL,
        headers={
            "api-subscription-key": key,
            "Content-Type": "application/json",
        },
        json={
            "input": text,
            "source_language_code": "en-IN",
            "target_language_code": target_lang,
        },
        timeout=30,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Sarvam translate API error {resp.status_code}: {resp.text}")

    data = resp.json()
    return data["translated_text"]
