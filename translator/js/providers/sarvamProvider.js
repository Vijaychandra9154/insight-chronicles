/**
 * Sarvam Translation Provider — Insight Chronicles
 * Implements the translationProvider.js interface for Sarvam AI.
 * @module providers/sarvamProvider
 */

// ── Defaults ──────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_BATCH_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 1; // one retry = 2 total attempts

// ── Factory ───────────────────────────────────────────────────────

/**
 * Creates a Sarvam translation provider.
 *
 * @param {object} config
 * @param {string} config.apiKey   — Sarvam API key
 * @param {string} config.endpoint — Sarvam translate endpoint URL
 * @returns {object} provider implementing translate/translateBatch/supportsBatch/getName
 */
export function createSarvamProvider(config) {
  const apiKey = config?.apiKey;
  const endpoint = config?.endpoint;

  if (!apiKey) throw new Error("Sarvam provider requires config.apiKey.");
  if (!endpoint) throw new Error("Sarvam provider requires config.endpoint.");

  // ── Helpers (easy to change payload / response format later) ──

  /**
   * Builds the fetch Request object for a single-text translation.
   * Override this to change the API payload shape.
   */
  function buildRequest(text, targetLanguage) {
    return new Request(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: text,
        source_language_code: "en",
        target_language_code: targetLanguage,
        model: "mayura-v1"
      })
    });
  }

  /**
   * Builds the fetch Request object for batch translation.
   */
  function buildBatchRequest(items, targetLanguage) {
    return new Request(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: items,
        source_language_code: "en",
        target_language_code: targetLanguage,
        model: "mayura-v1"
      })
    });
  }

  /**
   * Extracts the translated string from an API JSON response.
   * Override this to handle different response shapes.
   */
  async function extractTranslation(response) {
    const data = await response.json();
    // Try common response shapes
    if (typeof data.translated_text === "string") return data.translated_text;
    if (typeof data.output === "string") return data.output;
    if (typeof data.text === "string") return data.text;
    if (typeof data.translation === "string") return data.translation;
    throw new Error("Could not extract translation from API response.");
  }

  /**
   * Extracts an array of translated strings from a batch API JSON response.
   */
  async function extractBatchTranslations(response) {
    const data = await response.json();
    if (Array.isArray(data.translations)) return data.translations;
    if (Array.isArray(data.output)) return data.output;
    if (Array.isArray(data.translated_texts)) return data.translated_texts;
    throw new Error("Could not extract batch translations from API response.");
  }

  // ── HTTP helpers ────────────────────────────────────────────

  async function fetchWithTimeout(url, options, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function checkResponse(response) {
    if (!response.ok) {
      let body = "";
      try { body = await response.text(); } catch (_) { /* ignore */ }
      throw new Error(`HTTP ${response.status}${body ? ": " + body.slice(0, 200) : ""}`);
    }
  }

  // ── Core translate (with retry) ─────────────────────────────

  async function translateWithRetry(text, targetLanguage) {
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const req = buildRequest(text, targetLanguage);
        const res = await fetchWithTimeout(req.url, req, DEFAULT_TIMEOUT_MS);
        await checkResponse(res);

        const translation = await extractTranslation(res);
        if (!translation || !String(translation).trim()) {
          throw new Error("API returned empty translation.");
        }

        return String(translation).trim();
      } catch (err) {
        lastError = err;
        if (attempt < MAX_RETRIES) {
          // Brief backoff before retry
          await sleep(800 + Math.random() * 400);
        }
      }
    }

    throw lastError || new Error("Translation failed after retries.");
  }

  // ── Provider interface ──────────────────────────────────────

  return Object.freeze({
    name: "sarvam",

    /** Translate a single text string. */
    async translate(text, targetLanguage) {
      if (!text || typeof text !== "string") return text || "";
      return translateWithRetry(text, targetLanguage);
    },

    /** Translate multiple strings. Falls back to sequential on failure. */
    async translateBatch(items, targetLanguage) {
      if (!Array.isArray(items) || !items.length) return [];

      try {
        const req = buildBatchRequest(items, targetLanguage);
        const res = await fetchWithTimeout(req.url, req, DEFAULT_BATCH_TIMEOUT_MS);
        await checkResponse(res);

        const translations = await extractBatchTranslations(res);
        if (translations.length === items.length) {
          return translations.map((t) => String(t).trim());
        }
        throw new Error(
          `Batch returned ${translations.length} results, expected ${items.length}.`
        );
      } catch (err) {
        // Fallback to sequential
        console.warn(`Sarvam batch failed, falling back to sequential: ${err.message}`);
        const results = [];
        for (const text of items) {
          results.push(await translateWithRetry(text, targetLanguage));
        }
        return results;
      }
    },

    /** Sarvam supports native batch translation. */
    supportsBatch() {
      return true;
    },

    /** Human-readable provider name. */
    getName() {
      return "sarvam";
    }
  });
}

// ── Utility ───────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
