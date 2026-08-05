/**
 * Session & Translation Memory Persistence — Insight Chronicles
 * localStorage-backed. Versioned. No UI / fetch / translation / repo logic.
 * @module persistence
 */

import { exportMemory, importMemory } from "./translationMemory.js";

// ── Constants ───────────────────────────────────────────────────────

const SESSION_VERSION = 1;
const SESSION_KEY = "ic-translator-session";
const TM_KEY = "ic-translator-tm";

/** Keys this module owns — all others are preserved on save. */
const OWNED_KEYS = new Set([
  "version", "savedAt",
  "selectedArticles", "selectedLanguages",
  "lastExportPlan", "lastRepositoryScan"
]);

// ── Defaults ────────────────────────────────────────────────────────

function emptySession() {
  return {
    version: SESSION_VERSION,
    savedAt: null,
    selectedArticles: [],
    selectedLanguages: [],
    lastExportPlan: null,
    lastRepositoryScan: null
  };
}

// ── Validation ──────────────────────────────────────────────────────

function isValid(arr, check) {
  if (!Array.isArray(arr)) return false;
  return check ? arr.every(check) : true;
}

function validate(session) {
  if (!session || typeof session !== "object") return emptySession();
  const v = session.version;
  if (v !== SESSION_VERSION) return emptySession(); // reject unknown versions

  return {
    version: SESSION_VERSION,
    savedAt: typeof session.savedAt === "string" ? session.savedAt : null,
    selectedArticles: isValid(session.selectedArticles, (x) => typeof x === "string")
      ? session.selectedArticles : [],
    selectedLanguages: isValid(session.selectedLanguages, (x) => typeof x === "string")
      ? session.selectedLanguages : [],
    lastExportPlan: session.lastExportPlan && typeof session.lastExportPlan === "object"
      ? session.lastExportPlan : null,
    lastRepositoryScan: session.lastRepositoryScan && typeof session.lastRepositoryScan === "object"
      ? session.lastRepositoryScan : null
  };
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Persists session data. Merges with existing stored data so unknown
 * fields set by other modules are never overwritten.
 * @param {object} partial — any subset of owned keys
 * @returns {boolean} true on success
 */
export function saveSession(partial) {
  if (!partial || typeof partial !== "object") return false;
  try {
    // Preserve fields this module doesn't own
    let existing = {};
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      try { existing = JSON.parse(raw); } catch (_) { /* discard corrupt */ }
    }
    if (!existing || typeof existing !== "object") existing = {};

    const current = loadSession(); // validated baseline
    for (const key of OWNED_KEYS) {
      if (key === "version" || key === "savedAt") continue;
      if (partial.hasOwnProperty(key)) current[key] = partial[key];
    }
    current.savedAt = new Date().toISOString();

    // Merge: existing unknown fields + validated owned fields
    const merged = { ...existing };
    for (const key of Object.keys(current)) merged[key] = current[key];
    merged.version = SESSION_VERSION;

    localStorage.setItem(SESSION_KEY, JSON.stringify(merged));
    return true;
  } catch (_) { return false; }
}

/** Loads and validates session. Returns empty defaults on any failure. */
export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return emptySession();
    const parsed = JSON.parse(raw);
    return validate(parsed);
  } catch (_) { return emptySession(); }
}

/** Removes session from localStorage. Does NOT clear translation memory. */
export function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch (_) { /* quota/disabled */ }
}

/** Serialises the in-memory TM to localStorage. */
export function saveTranslationMemory() {
  try {
    const data = exportMemory();
    const wrapped = { version: 1, savedAt: new Date().toISOString(), entries: data };
    localStorage.setItem(TM_KEY, JSON.stringify(wrapped));
    return true;
  } catch (_) { return false; }
}

/** Loads TM from localStorage into the in-memory cache. */
export function loadTranslationMemory() {
  try {
    const raw = localStorage.getItem(TM_KEY);
    if (!raw) return false;
    const wrapped = JSON.parse(raw);
    if (!wrapped || typeof wrapped !== "object" || !wrapped.entries) return false;
    importMemory(wrapped.entries);
    return true;
  } catch (_) { return false; }
}
