/**
 * Sarvam Translation Provider — Insight Chronicles
 * Implements the translationProvider.js interface for Sarvam AI.
 * @module providers/sarvamProvider
 */

// ── Defaults ──────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_BATCH_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 3;        // 4 total attempts
const DEFAULT_BASE_DELAY_MS = 1000;   // starting backoff
const DEFAULT_MAX_DELAY_MS = 30_000;  // cap backoff at 30 seconds

// ── Security ───────────────────────────────────────────────────────
//
// WARNING: Never embed API keys in client-side JavaScript deployed to
// a public URL (including GitHub Pages). The key is visible in browser
// DevTools → Network tab to anyone who opens the page.
//
// This provider supports two secure patterns:
//
//   Pattern 1 — Proxy (RECOMMENDED for production):
//     Deploy a tiny edge function (Cloudflare Worker / Netlify Function /
//     Vercel Edge) that holds the API key. Pass its URL as `proxyEndpoint`.
//     The browser sends { input, target_language_code } to the proxy;
//     the proxy adds the Authorization header and forwards to Sarvam.
//     See the reference proxy implementation in the comments at the end
//     of this file.
//
//   Pattern 2 — Direct (internal / dev only):
//     Pass `apiKey` directly. Acceptable for localhost, password-protected
//     staging, or internal tools behind a VPN. NEVER use on the open web.<｜end▁of▁thinking｜>OK

// ── Factory ───────────────────────────────────────────────────────

/**
 * Creates a Sarvam translation provider.
 *
 * @param {object} config
 * @param {string} [config.apiKey]        — Sarvam API key (omit if using proxyEndpoint)
 * @param {string} config.endpoint        — Sarvam translate endpoint URL
 * @param {string} [config.proxyEndpoint] — Forward requests through this proxy instead
 *                                          of calling Sarvam directly. Proxy receives:
 *                                          POST { input, source_language_code,
 *                                                 target_language_code, model }
 *                                          and must return Sarvam-formatted JSON.
 *                                          RECOMMENDED for any public deployment.
 * @param {number} [config.maxRetries]    — max retries (default 3, so 4 total attempts)
 * @param {number} [config.baseDelayMs]   — starting backoff in ms (default 1000)
 * @param {number} [config.maxDelayMs]    — cap on backoff (default 30_000)
 * @returns {object} provider implementing translate/translateBatch/supportsBatch/getName
 */
export function createSarvamProvider(config) {
  const apiKey = config?.apiKey;
  const endpoint = config?.endpoint;
  const proxyEndpoint = config?.proxyEndpoint || null;
  const maxRetries = config?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = config?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = config?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

  // Must have either a direct endpoint + key, or a proxy endpoint
  if (!proxyEndpoint && !apiKey) {
    throw new Error("Sarvam provider requires either config.apiKey or config.proxyEndpoint.");
  }
  if (!endpoint) throw new Error("Sarvam provider requires config.endpoint.");

  const useProxy = !!proxyEndpoint;

  // ── Helpers (easy to change payload / response format later) ──

  /**
   * Builds the fetch Request object for a single-text translation.
   * In proxy mode the Authorization header is omitted — the proxy adds it.
   */
  function buildRequest(text, targetLanguage) {
    const url = useProxy ? proxyEndpoint : endpoint;
    const headers = { "Content-Type": "application/json" };
    if (!useProxy) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    return new Request(url, {
      method: "POST",
      headers,
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
   * In proxy mode the Authorization header is omitted — the proxy adds it.
   */
  function buildBatchRequest(items, targetLanguage) {
    const url = useProxy ? proxyEndpoint : endpoint;
    const headers = { "Content-Type": "application/json" };
    if (!useProxy) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    return new Request(url, {
      method: "POST",
      headers,
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

  // ── Core translate (with exponential backoff + Retry-After) ──

  /**
   * Translates text with exponential backoff on failure.
   * Parses Retry-After header (seconds or HTTP-date) from 429 responses.
   */
  async function translateWithRetry(text, targetLanguage) {
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const req = buildRequest(text, targetLanguage);
        const res = await fetchWithTimeout(req.url, req, DEFAULT_TIMEOUT_MS);

        if (!res.ok) {
          // Parse Retry-After on 429 (rate limit) or 503 (overloaded)
          if (res.status === 429 || res.status === 503) {
            const retryAfter = parseRetryAfter(res);
            if (retryAfter > 0 && attempt < maxRetries) {
              await sleep(retryAfter * 1000);
              continue;
            }
          }
          await checkResponse(res); // throws with body
        }

        const translation = await extractTranslation(res);
        if (!translation || !String(translation).trim()) {
          throw new Error("API returned empty translation.");
        }

        return String(translation).trim();
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          // Exponential backoff with full jitter
          const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
          const jitter = Math.random() * delay;
          await sleep(delay + jitter);
        }
      }
    }

    throw lastError || new Error("Translation failed after retries.");
  }

  /**
   * Parses the Retry-After header from an HTTP response.
   * Handles both delta-seconds ("120") and HTTP-date formats.
   * Returns seconds to wait, or 0 if unparseable.
   */
  function parseRetryAfter(response) {
    const header = response.headers.get("Retry-After");
    if (!header) return 0;

    // Try delta-seconds
    const seconds = parseInt(header, 10);
    if (!isNaN(seconds) && seconds >= 0) return seconds;

    // Try HTTP-date
    const date = Date.parse(header);
    if (!isNaN(date)) {
      return Math.max(0, Math.ceil((date - Date.now()) / 1000));
    }

    return 0;
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

// ── Reference Proxy Implementation ─────────────────────────────────
//
// Deploy this as a Cloudflare Worker (or Netlify Function / Vercel Edge
// Function) to keep your Sarvam API key out of the browser.
//
// Cloudflare Worker example (workers.dev or custom domain):
//
//   export default {
//     async fetch(request, env) {
//       // Only allow POST from your domain
//       const origin = request.headers.get("Origin");
//       const allowed = ["https://insight-chronicles.com", "https://localhost"];
//       const cors = allowed.includes(origin) ? origin : allowed[0];
//
//       if (request.method === "OPTIONS") {
//         return new Response(null, {
//           status: 204,
//           headers: {
//             "Access-Control-Allow-Origin": cors,
//             "Access-Control-Allow-Methods": "POST, OPTIONS",
//             "Access-Control-Allow-Headers": "Content-Type",
//             "Access-Control-Max-Age": "86400"
//           }
//         });
//       }
//
//       if (request.method !== "POST") {
//         return new Response("Method not allowed", { status: 405 });
//       }
//
//       const body = await request.json();
//
//       const sarvamRes = await fetch("https://api.sarvam.ai/translate", {
//         method: "POST",
//         headers: {
//           "Authorization": `Bearer ${env.SARVAM_API_KEY}`,
//           "Content-Type": "application/json"
//         },
//         body: JSON.stringify(body)
//       });
//
//       const data = await sarvamRes.json();
//
//       return new Response(JSON.stringify(data), {
//         status: sarvamRes.status,
//         headers: {
//           "Content-Type": "application/json",
//           "Access-Control-Allow-Origin": cors
//         }
//       });
//     }
//   };
//
// Pass the worker URL as `proxyEndpoint` to createSarvamProvider().
// The browser never sees the API key — the worker injects it server-side.
