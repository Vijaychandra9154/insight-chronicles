/**
 * AI4Bharat Translation Provider — Insight Chronicles
 * Implements the translationProvider.js interface for AI4Bharat / Bhashini / ULCA.
 * Configurable endpoint, API key, model, language-code format, and response shape.
 * Reuses the same retry / backoff strategy as sarvamProvider.
 * @module providers/ai4bharatProvider
 */

const DEFAULT_TIMEOUT_MS = 20_000, DEFAULT_BATCH_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 3, DEFAULT_BASE_DELAY_MS = 1_000, DEFAULT_MAX_DELAY_MS = 30_000;

// Language-code normaliser — default ISO 639-1 ("hi","ta"). Pass langCodeFormat:"bcp47" for "hi-IN".
function normaliseCode(code, format) {
  if (!code) return code;
  if (format === "bcp47") { if (code === "or") return "od-IN"; if (code.includes("-")) return code; return code + "-IN"; }
  return code.replace(/-.*$/, "");
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * @param {object} config
 * @param {string} config.apiKey          — bearer token
 * @param {string} config.endpoint        — translate endpoint URL
 * @param {string} [config.model]          — model name
 * @param {string} [config.sourceLang]     — default "en"
 * @param {string} [config.langCodeFormat] — "iso" (default) | "bcp47"
 * @param {string} [config.inputKey]       — input text key (default "input")
 * @param {string} [config.sourceKey]      — source-lang key
 * @param {string} [config.targetKey]      — target-lang key
 * @param {string} [config.modelKey]       — model key (default "model")
 * @param {string} [config.outputKey]      — response key (auto-detect if unset)
 * @param {string} [config.batchOutputKey] — batch response key
 * @param {string} [config.authHeader]     — override Authorization
 * @param {string} [config.proxyEndpoint]  — proxy URL
 * @param {number} [config.maxRetries]
 * @param {number} [config.baseDelayMs]
 * @param {number} [config.maxDelayMs]
 */
export function createAI4BharatProvider(config = {}) {
  const apiKey        = config.apiKey;
  const endpoint      = config.endpoint;
  const proxyEndpoint = config.proxyEndpoint || null;
  const model         = config.model || null;
  const sourceLang    = config.sourceLang || "en";
  const langFmt       = config.langCodeFormat || "iso";
  const inputKey      = config.inputKey  || "input";
  const sourceKey     = config.sourceKey || "source_language_code";
  const targetKey     = config.targetKey || "target_language_code";
  const modelKey      = config.modelKey  || "model";
  const authHeader    = config.authHeader || null;
  const maxRetries    = config.maxRetries   ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs   = config.baseDelayMs  ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs    = config.maxDelayMs   ?? DEFAULT_MAX_DELAY_MS;

  if (!proxyEndpoint && !apiKey) {
    throw new Error("AI4Bharat provider requires config.apiKey or config.proxyEndpoint.");
  }
  if (!endpoint) throw new Error("AI4Bharat provider requires config.endpoint.");

  const useProxy = !!proxyEndpoint;

  function buildBody(text, targetLanguage, extra = {}) {
    const body = {
      [inputKey]:  text,
      [sourceKey]: normaliseCode(sourceLang, langFmt),
      [targetKey]: normaliseCode(targetLanguage, langFmt),
      ...extra,
    };
    if (model) body[modelKey] = model;
    return body;
  }

  function authHeaders() {
    const h = { "Content-Type": "application/json" };
    if (!useProxy) h["Authorization"] = authHeader || `Bearer ${apiKey}`;
    return h;
  }

  function buildRequest(text, targetLanguage) {
    return new Request(useProxy ? proxyEndpoint : endpoint, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify(buildBody(text, targetLanguage)),
    });
  }

  function buildBatchRequest(items, targetLanguage) {
    return new Request(useProxy ? proxyEndpoint : endpoint, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify(buildBody(items, targetLanguage)),
    });
  }

  async function extractTranslation(response) {
    const d = await response.json();
    // Config-specified key first
    if (config.outputKey && typeof d[config.outputKey] === "string") return d[config.outputKey];
    // Common shapes
    for (const k of ["translated_text", "output", "translation", "text", "data"]) {
      if (typeof d[k] === "string") return d[k];
    }
    // Nested data object
    if (d.data && typeof d.data === "object") {
      for (const k of ["translated_text", "output", "translation", "text"]) {
        if (typeof d.data[k] === "string") return d.data[k];
      }
    }
    throw new Error("Could not extract translation from AI4Bharat response.");
  }

  async function extractBatchTranslations(response) {
    const d = await response.json();
    if (config.batchOutputKey && Array.isArray(d[config.batchOutputKey])) return d[config.batchOutputKey];
    for (const k of ["translations", "output", "translated_texts", "data"]) {
      if (Array.isArray(d[k])) return d[k];
    }
    if (d.data && Array.isArray(d.data.translations)) return d.data.translations;
    throw new Error("Could not extract batch translations from AI4Bharat response.");
  }

  // ── HTTP helpers ──────────────────────────────────────────────
  async function fetchWithTimeout(url, options, timeoutMs) {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try          { return await fetch(url, { ...options, signal: ctrl.signal }); }
    finally      { clearTimeout(timer); }
  }

  async function checkResponse(response) {
    if (!response.ok) {
      let body = "";
      try { body = await response.text(); } catch (_) { /* ignore */ }
      throw new Error(`HTTP ${response.status}${body ? ": " + body.slice(0, 200) : ""}`);
    }
  }

  function parseRetryAfter(response) {
    const h = response.headers.get("Retry-After");
    if (!h) return 0;
    const s = parseInt(h, 10);
    if (!isNaN(s) && s >= 0) return s;
    const d = Date.parse(h);
    if (!isNaN(d)) return Math.max(0, Math.ceil((d - Date.now()) / 1000));
    return 0;
  }

  // ── Core translate (exponential backoff) ──────────────────────
  async function translateWithRetry(text, targetLanguage) {
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const req = buildRequest(text, targetLanguage);
        const res = await fetchWithTimeout(req.url, req, DEFAULT_TIMEOUT_MS);
        if (!res.ok) {
          if (res.status === 429 || res.status === 503) {
            const ra = parseRetryAfter(res);
            if (ra > 0 && attempt < maxRetries) { await sleep(ra * 1000); continue; }
          }
          await checkResponse(res);
        }
        const translation = await extractTranslation(res);
        if (!translation || !String(translation).trim()) {
          throw new Error("AI4Bharat returned empty translation.");
        }
        return String(translation).trim();
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
          await sleep(delay + Math.random() * delay);
        }
      }
    }
    throw lastError || new Error("AI4Bharat translation failed after retries.");
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
      try {
        const req = buildBatchRequest(items, targetLanguage);
        const res = await fetchWithTimeout(req.url, req, DEFAULT_BATCH_TIMEOUT_MS);
        await checkResponse(res);
        const translations = await extractBatchTranslations(res);
        if (translations.length === items.length) {
          return translations.map((t) => String(t).trim());
        }
        throw new Error(`Batch returned ${translations.length}, expected ${items.length}.`);
      } catch (err) {
        console.warn(`AI4Bharat batch failed, falling back to sequential: ${err.message}`);
        const results = [];
        for (const text of items) {
          try       { results.push(await translateWithRetry(text, targetLanguage)); }
          catch (e) { console.warn(`AI4Bharat seq item failed: ${e.message}`); results.push(text); }
        }
        return results;
      }
    },

    supportsBatch() { return false; },

    getName() { return "ai4bharat"; },
  });
}
