/**
 * Translation Memory — Insight Chronicles
 * In-memory cache: sourceText → languageCode → translatedText.
 * Identical source text is never translated twice.
 * @module translationMemory
 */

/** @type {Map<string, Map<string, string>>} */
let _memory = new Map();

// ── Normalization ─────────────────────────────────────────────────

/** Trims, collapses spaces, normalizes line endings. Case preserved. */
function normalize(text) {
  if (typeof text !== "string") return "";
  return text.trim().replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ");
}

// ── Public API ────────────────────────────────────────────────────

/** Creates a fresh empty TM. Resets all in-memory data. */
export function createTranslationMemory() {
  _memory = new Map();
  return api;
}

/** Returns cached translation or null. */
export function getTranslation(sourceText, targetLanguage) {
  const key = normalize(sourceText);
  if (!key) return null;
  const langMap = _memory.get(key);
  return langMap ? langMap.get(targetLanguage) || null : null;
}

/** Stores a translation in the cache. */
export function setTranslation(sourceText, targetLanguage, translatedText) {
  const key = normalize(sourceText);
  if (!key || !targetLanguage) return;
  let langMap = _memory.get(key);
  if (!langMap) { langMap = new Map(); _memory.set(key, langMap); }
  langMap.set(targetLanguage, translatedText);
}

/** Returns true if a translation exists for this source+language pair. */
export function hasTranslation(sourceText, targetLanguage) {
  return getTranslation(sourceText, targetLanguage) !== null;
}

/** Clears all cached translations. */
export function clearMemory() {
  _memory = new Map();
}

/**
 * Exports the entire TM as a plain JSON object.
 * @returns {object}  { "sourceText": { "lang": "translated", ... }, ... }
 */
export function exportMemory() {
  const obj = {};
  for (const [source, langMap] of _memory) {
    const entry = {};
    for (const [lang, t] of langMap) entry[lang] = t;
    obj[source] = entry;
  }
  return obj;
}

/**
 * Imports a previously exported JSON object. Merges with existing entries.
 * @param {object} obj — plain object from exportMemory()
 */
export function importMemory(obj) {
  if (!obj || typeof obj !== "object") return;
  for (const [source, langEntry] of Object.entries(obj)) {
    if (!langEntry || typeof langEntry !== "object") continue;
    const key = normalize(source);
    if (!key) continue;
    let langMap = _memory.get(key);
    if (!langMap) { langMap = new Map(); _memory.set(key, langMap); }
    for (const [lang, t] of Object.entries(langEntry)) {
      if (typeof t === "string") langMap.set(lang, t);
    }
  }
}

/** Returns the number of unique source texts in memory. */
export function size() {
  return _memory.size;
}

/** Returns the total number of language pairs stored. */
export function pairCount() {
  let count = 0;
  for (const langMap of _memory.values()) count += langMap.size;
  return count;
}

/** Returns all source texts in memory. */
export function sourceTexts() {
  return [..._memory.keys()];
}

/** Returns unique language codes present in memory. */
export function languages() {
  const langs = new Set();
  for (const langMap of _memory.values()) {
    for (const lang of langMap.keys()) langs.add(lang);
  }
  return [...langs];
}

// Module API object
const api = {
  createTranslationMemory, getTranslation, setTranslation,
  hasTranslation, clearMemory, exportMemory, importMemory,
  size, pairCount, sourceTexts, languages
};
export default api;
