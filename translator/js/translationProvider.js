/**
 * Translation Provider — Insight Chronicles
 * Abstraction layer over translation backends.
 * Does NOT implement any API. Provides a standard interface only.
 *
 * @module translationProvider
 */

// ── No-op provider (throws on any call) ───────────────────────────

const NOOP_PROVIDER = Object.freeze({
  name: "none",

  async translate(_text, _targetLanguage) {
    throw new Error("Provider not configured. Pass a provider to createTranslationProvider().");
  },

  async translateBatch(_items, _targetLanguage) {
    throw new Error("Provider not configured. Pass a provider to createTranslationProvider().");
  },

  supportsBatch() {
    return false;
  },

  getName() {
    return "none";
  }
});

// ── Factory ───────────────────────────────────────────────────────

/**
 * Creates a translation provider from a backend implementation.
 *
 * A valid provider must implement at minimum:
 *   translate(text, targetLanguage) → Promise<string>
 *
 * Optional methods (with fallbacks):
 *   translateBatch(items, targetLanguage) → Promise<string[]>
 *   supportsBatch() → boolean
 *   name → string
 *
 * @param {object} [provider] — backend implementation
 * @param {function} provider.translate — required
 * @param {function} [provider.translateBatch]
 * @param {function} [provider.supportsBatch]
 * @param {string}   [provider.name]
 * @returns {object} standard provider interface
 */
export function createTranslationProvider(provider) {
  // No provider → return no-op that throws on use
  if (!provider) {
    return NOOP_PROVIDER;
  }

  // Validate required method
  if (typeof provider.translate !== "function") {
    throw new Error(
      "Invalid provider: must implement translate(text, targetLanguage)."
    );
  }

  // Optional methods with fallbacks
  const hasSupportsBatch = typeof provider.supportsBatch === "function";
  const hasBatch = typeof provider.translateBatch === "function"
    && (!hasSupportsBatch || provider.supportsBatch());

  return Object.freeze({
    /**
     * Translates a single text string.
     * @param {string} text
     * @param {string} targetLanguage — language code (e.g. "hi", "te")
     * @returns {Promise<string>} translated text
     */
    async translate(text, targetLanguage) {
      if (!text || typeof text !== "string") return text || "";
      return provider.translate(text, targetLanguage);
    },

    /**
     * Translates multiple strings at once.
     * Falls back to sequential translate() calls if the provider
     * doesn't implement translateBatch.
     * @param {string[]} items
     * @param {string} targetLanguage
     * @returns {Promise<string[]>} translated texts in same order
     */
    async translateBatch(items, targetLanguage) {
      if (!Array.isArray(items)) return [];
      if (hasBatch) {
        return provider.translateBatch(items, targetLanguage);
      }
      // Sequential fallback
      const results = [];
      for (const text of items) {
        results.push(await provider.translate(text, targetLanguage));
      }
      return results;
    },

    /**
     * Whether the provider supports native batch translation.
     * @returns {boolean}
     */
    supportsBatch() {
      return hasSupportsBatch ? provider.supportsBatch() : hasBatch;
    },

    /**
     * Human-readable provider name for logging / UI.
     * @returns {string}
     */
    getName() {
      return provider.name || "custom";
    }
  });
}
