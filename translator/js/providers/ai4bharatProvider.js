/**
 * AI4Bharat Translation Provider — Insight Chronicles
 * Implements the translationProvider.js interface.
 * @module providers/ai4bharatProvider
 */

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * @param {object} config
 * @param {string} config.apiKey   — bearer token
 * @param {string} config.endpoint — translate endpoint URL
 * @returns {object} provider
 */
export function createAI4BharatProvider(config = {}) {
  const apiKey   = config.apiKey;
  const endpoint = config.endpoint;

  if (!apiKey)   throw new Error("AI4Bharat provider requires config.apiKey.");
  if (!endpoint) throw new Error("AI4Bharat provider requires config.endpoint.");

  // ── Request builder ──────────────────────────────────────────
  function buildRequest(text, targetLanguage) {
    return {
      url: endpoint,
      init: {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          input:                 text,
          source_language_code:  "en",
          target_language_code:  targetLanguage,
        }),
      },
    };
  }

  // ── Response parsing — probes common shapes ──────────────────
  async function extractTranslation(response) {
    const d = await response.json();
    if (typeof d.translated_text === "string") return d.translated_text;
    if (typeof d.output          === "string") return d.output;
    if (typeof d.translation     === "string") return d.translation;
    if (typeof d.text            === "string") return d.text;
    if (d.data && typeof d.data === "object") {
      if (typeof d.data.translated_text === "string") return d.data.translated_text;
      if (typeof d.data.output          === "string") return d.data.output;
    }
    throw new Error("Could not extract translation from AI4Bharat response.");
  }

  async function extractBatchTranslations(response) {
    const d = await response.json();
    if (Array.isArray(d.translations))      return d.translations;
    if (Array.isArray(d.output))            return d.output;
    if (Array.isArray(d.translated_texts))  return d.translated_texts;
    if (d.data && Array.isArray(d.data))    return d.data;
    throw new Error("Could not extract batch translations from AI4Bharat response.");
  }

  // ── Translate — retry once on timeout / network error ────────
  async function translateWithRetry(text, targetLanguage) {
    for (let attempt = 0; attempt <= 1; attempt++) {
      try {
        const { url, init } = buildRequest(text, targetLanguage);
        const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });

        if (!res.ok) {
          let errBody = "";
          try { errBody = await res.text(); } catch (_) { /* ignore */ }
          throw new Error(`HTTP ${res.status}${errBody ? ": " + errBody.slice(0, 200) : ""}`);
        }

        const translation = await extractTranslation(res);
        if (!translation || !String(translation).trim()) {
          throw new Error("AI4Bharat returned empty translation.");
        }
        return String(translation).trim();

      } catch (err) {
        if (attempt === 0 && (err.name === "TimeoutError" || err.name === "AbortError" || err.name === "TypeError")) {
          await sleep(2_000);
          continue;
        }
        if (attempt > 0) throw err;
        throw err;
      }
    }
  }

  // ── Provider interface ────────────────────────────────────────
  return Object.freeze({
    name: "ai4bharat",

    async translate(text, targetLanguage) {
      if (!text || typeof text !== "string") return text || "";
      return translateWithRetry(text, targetLanguage);
    },

    async translateBatch(items, targetLanguage) {
      if (!Array.isArray(items) || !items.length) return [];

      // Try batch request first
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            input:                 items,
            source_language_code:  "en",
            target_language_code:  targetLanguage,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
          let errBody = "";
          try { errBody = await res.text(); } catch (_) { /* ignore */ }
          throw new Error(`HTTP ${res.status}${errBody ? ": " + errBody.slice(0, 200) : ""}`);
        }
        const translations = await extractBatchTranslations(res);
        if (translations.length === items.length) {
          return translations.map((t) => String(t).trim());
        }
        throw new Error(`Batch returned ${translations.length}, expected ${items.length}.`);
      } catch (err) {
        console.warn(`AI4Bharat batch failed, falling back to sequential: ${err.message}`);
      }

      // Sequential fallback — isolate each item
      const results = [];
      for (const text of items) {
        try {
          results.push(await translateWithRetry(text, targetLanguage));
        } catch (e) {
          console.warn(`AI4Bharat sequential item failed: ${e.message}`);
          results.push(text); // return source text on failure
        }
      }
      return results;
    },

    supportsBatch() { return false; },

    getName() { return "ai4bharat"; },
  });
}
