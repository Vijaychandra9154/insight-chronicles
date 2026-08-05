// translator/js/glossary.js — Terminology management (localStorage, case-insensitive, ES module)
'use strict';

const STORAGE_KEY = 'translator_glossary';

// ---- private helpers -------------------------------------------------------

function load() {
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : []; }
  catch { return []; }
}

function save(g) { localStorage.setItem(STORAGE_KEY, JSON.stringify(g)); }

function norm(s) { return (s || '').trim().toLowerCase(); }

function isValidTerm(t) {
  return t != null
    && typeof t.sourceLanguage === 'string' && t.sourceLanguage.trim()
    && typeof t.targetLanguage === 'string' && t.targetLanguage.trim()
    && typeof t.source        === 'string' && t.source.trim()
    && typeof t.translated    === 'string' && t.translated.trim();
}

function clean(t) {
  return {
    sourceLanguage: t.sourceLanguage.trim(),
    targetLanguage: t.targetLanguage.trim(),
    source:         t.source.trim(),
    translated:     t.translated.trim()
  };
}

function findIndex(g, sl, tl, s) {
  const nsl = norm(sl), ntl = norm(tl), ns = norm(s);
  return g.findIndex(t => norm(t.sourceLanguage) === nsl
                       && norm(t.targetLanguage) === ntl
                       && norm(t.source) === ns);
}

// ---- public API ------------------------------------------------------------

/**
 * Add or update a term.  Returns true on success, false if the term is invalid.
 */
export function addTerm(term) {
  if (!isValidTerm(term)) return false;
  const g = load();
  const i = findIndex(g, term.sourceLanguage, term.targetLanguage, term.source);
  const e = clean(term);
  if (i !== -1) g[i] = e; else g.push(e);
  save(g);
  return true;
}

/**
 * Remove a term by its composite key.  Returns true if a match was removed.
 */
export function removeTerm(sourceLanguage, targetLanguage, source) {
  if (!sourceLanguage || !targetLanguage || !source) return false;
  const g = load();
  const i = findIndex(g, sourceLanguage, targetLanguage, source);
  if (i === -1) return false;
  g.splice(i, 1);
  save(g);
  return true;
}

/**
 * Look up a translation (case-insensitive exact match).
 * Returns the translated string or null.
 */
export function getTranslation(sourceLanguage, targetLanguage, source) {
  if (!sourceLanguage || !targetLanguage || !source) return null;
  const g = load();
  const i = findIndex(g, sourceLanguage, targetLanguage, source);
  return i !== -1 ? g[i].translated : null;
}

/**
 * Import terms from a JSON string or array.  Merges with existing glossary.
 * Returns { imported: number, errors: number }.
 */
export function importGlossary(data) {
  try {
    let terms;
    if (typeof data === 'string') terms = JSON.parse(data);
    else if (Array.isArray(data)) terms = data;
    else return { imported: 0, errors: 1 };
    if (!Array.isArray(terms)) return { imported: 0, errors: 1 };

    const g = load();
    let imported = 0, errors = 0;
    for (const t of terms) {
      if (!isValidTerm(t)) { errors++; continue; }
      const i = findIndex(g, t.sourceLanguage, t.targetLanguage, t.source);
      const e = clean(t);
      if (i !== -1) g[i] = e; else g.push(e);
      imported++;
    }
    save(g);
    return { imported, errors };
  } catch { return { imported: 0, errors: 1 }; }
}

/**
 * Export the entire glossary as a formatted JSON string.
 */
export function exportGlossary() {
  return JSON.stringify(load(), null, 2);
}

/**
 * Remove every term.
 */
export function clearGlossary() {
  localStorage.removeItem(STORAGE_KEY);
}
