/**
 * Application Configuration — Insight Chronicles Translator
 * Persistent settings backed by localStorage. No UI / fetch / translation.
 * @module config
 */

// ── Storage key ─────────────────────────────────────────────────────

const STORAGE_KEY = "ic-translator-config";

// ── Defaults ────────────────────────────────────────────────────────

export const DEFAULT_CONFIG = Object.freeze({
  apiKey: "",
  endpoint: "https://api.sarvam.ai/translate",
  defaultSourceLanguage: "en",
  defaultTargetLanguages: ["hi"],
  batchSize: 50,
  retryCount: 3,
  timeout: 30_000,
  autoSave: true,
  theme: "auto"
});

// ── Validators ──────────────────────────────────────────────────────

const VALIDATORS = {
  apiKey:             (v) => typeof v === "string",
  endpoint:           (v) => typeof v === "string" && v.length > 0,
  defaultSourceLanguage: (v) => typeof v === "string" && v.length >= 2,
  defaultTargetLanguages: (v) => Array.isArray(v) && v.every(x => typeof x === "string"),
  batchSize:          (v) => Number.isInteger(v) && v > 0 && v <= 500,
  retryCount:         (v) => Number.isInteger(v) && v >= 0 && v <= 10,
  timeout:            (v) => Number.isInteger(v) && v >= 1_000 && v <= 300_000,
  autoSave:           (v) => typeof v === "boolean",
  theme:              (v) => ["light", "dark", "auto"].includes(v)
};

// ── Public API ──────────────────────────────────────────────────────

/** Reads config from localStorage. Validates every key. Falls back to defaults on any failure. */
export function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_CONFIG };

    const merged = {};
    for (const key of Object.keys(DEFAULT_CONFIG)) {
      const validator = VALIDATORS[key];
      const value = parsed[key];
      merged[key] = (value !== undefined && validator && validator(value))
        ? value
        : DEFAULT_CONFIG[key];
    }
    return merged;
  } catch (_) {
    return { ...DEFAULT_CONFIG };
  }
}

/** Persists a config object to localStorage. Only writes recognised keys. */
export function saveConfig(config) {
  if (!config || typeof config !== "object") return false;
  try {
    const current = loadConfig();
    const next = {};
    for (const key of Object.keys(DEFAULT_CONFIG)) {
      const value = config[key];
      const validator = VALIDATORS[key];
      next[key] = (value !== undefined && validator && validator(value))
        ? value
        : current[key];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch (_) {
    return false;
  }
}

/** Resets localStorage config to defaults. Returns the fresh default object. */
export function resetConfig() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) { /* quota or disabled — harmless */ }
  return { ...DEFAULT_CONFIG };
}
