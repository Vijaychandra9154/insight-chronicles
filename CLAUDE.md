# Insight Chronicles — Project Guide

Multilingual long-form content site. **Repo root = `C:\Users\Hi`** (the user's home directory *is* the git repo root).

## Git safety (critical)
The repo root is the home dir, so it contains a huge amount of untracked personal junk (`AppData/`, `Downloads/`, `NTUSER.DAT`, etc.).
- **NEVER run `git add -A` / `git add .`** — it would stage personal files and publish them.
- Stage only project files explicitly, e.g. `git add 'article-history-controllers-*.html' articles.html translator/`.

## File naming
- Articles: `article-history-controllers-{N}-{lang}.html` — article number **before** the language code.
- English source: `article-history-controllers-{N}.html`.
- Konkani code is **`gom`** (not `kok`). Full registry: `translator/js/languages.js`.
- Import zips from `Downloads/` use `{lang}-{N}` order and `kok` — swap order and map `kok→gom` on import.

## Language navigation
- `articles.html`: tabs in `.ic-lang-tabs` + one `.ic-lang-section` per language (id `lang-{code}`).
- Each article page has a `.ic-lang-bar` ("Read in") linking every language.
- Only expose a language when its files are actually translated (not English/Telugu source).

## Translation workflow
- `node translator/translate-cli.js <lang1,lang2>` — Sarvam API. Node + jsdom already installed.
- **SECURITY**: `translator/*.js` contain a hardcoded Sarvam API key — do **NOT** `git add`/commit/push these files (would leak the key to the public repo). Use `SARVAM_API_KEY` env var instead.
- **Model must be `sarvam-translate:v1`, NOT `mayura:v1`** — mayura returns HTTP 400 for `as`, `or`, `ml`, `ks`, `mni`, `sat` ("not supported in mayura:v1"), which is why those files are still English. `sarvam-translate:v1` supports all of them.
- Source = English article files in repo root; output = `translated/{lang}/article-history-controllers-{N}.html`.
- After running, copy/rename output → `article-history-controllers-{N}-{lang}.html`.
- **Slow**: translates text-node-by-text-node (~100+ API calls per article). For a full batch run it in the background.
- **Broken translation** = title/body still English (pipeline returned source). Detect: check `<title>` or `<html lang="{lang}">`.

## Language status
- All 23 languages (en + 22) are correctly translated — including `as`, `or`, `ml`, `ks`, `mni`, `sat`, `brx` (verified 2026-08-19: title, body, `<html lang>`, and meta description all in target language).
