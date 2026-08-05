/**
 * Application Controller — Insight Chronicles Translator
 * Connects all modules. No UI, no DOM manipulation.
 * @module app
 */

import { scanRepository } from "./repository.js";
import { publishAll } from "./publisher.js";
import { createExportPlan } from "./githubExporter.js";
import { createTranslationProvider } from "./translationProvider.js";
import { createSarvamProvider } from "./providers/sarvamProvider.js";
import { getLanguageCodes, isSupported } from "./languages.js";

// ── Public API ────────────────────────────────────────────────────

/**
 * @param {object} config
 * @param {string} [config.sourceLanguage="en"]
 * @param {string} [config.apiKey]        — Sarvam API key
 * @param {string} [config.endpoint]      — Sarvam endpoint
 * @param {function} [config.translateFunction] — custom translator (overrides Sarvam)
 * @param {function} [config.onProgress]  — ({phase, detail}) => {}
 * @returns {object} app API
 */
export function initializeApp(config = {}) {
  const srcLang = config.sourceLanguage || "en";
  const onProgress = config.onProgress || (() => {});

  const state = {
    sourceLanguage: srcLang,
    repository: null,
    selectedArticles: [],
    selectedLanguages: [],
    provider: null,
    exportPlan: null,
    progress: { phase: "idle", detail: "" },
    lastResults: null,
  };

  // Provider: custom function > Sarvam > no-op
  if (config.translateFunction) {
    state.provider = createTranslationProvider({
      name: "custom", translate: config.translateFunction, supportsBatch: () => false,
    });
  } else if (config.apiKey && config.endpoint) {
    state.provider = createTranslationProvider(
      createSarvamProvider({ apiKey: config.apiKey, endpoint: config.endpoint })
    );
  } else {
    state.provider = createTranslationProvider();
  }

  // ── App object ──────────────────────────────────────────────

  const app = {
    /** Scan all articles. Auto-selects all on success. */
    async scanRepository() {
      setProgress("scanning", "Scanning repository...");
      state.repository = await scanRepository({
        onProgress: ({ current, total, filename, status }) => {
          setProgress("scanning", `${status} ${current}/${total}: ${filename}`);
        },
      });
      state.selectedArticles = state.repository.articles.map((a) => a.slug);
      setProgress("idle", `Scanned ${state.repository.summary.totalArticles} articles.`);
      return state.repository;
    },

    /** Select articles by slug. Pass ["*"] for all. */
    selectArticles(slugs) {
      if (!slugs || (slugs.length === 1 && slugs[0] === "*")) {
        state.selectedArticles = state.repository
          ? state.repository.articles.map((a) => a.slug)
          : [];
      } else {
        state.selectedArticles = slugs;
      }
      return state.selectedArticles;
    },

    /** Select target languages by code. Pass ["*"] for all supported. */
    selectLanguages(codes) {
      if (!codes || (codes.length === 1 && codes[0] === "*")) {
        state.selectedLanguages = getLanguageCodes().filter((c) => c !== state.sourceLanguage);
      } else {
        state.selectedLanguages = codes.filter(
          (c) => isSupported(c) && c !== state.sourceLanguage
        );
      }
      return state.selectedLanguages;
    },

    /** Translate selected articles × selected languages. */
    async translateSelected() {
      if (!state.repository) throw new Error("Repository not scanned. Call scanRepository() first.");
      if (!state.selectedArticles.length) throw new Error("No articles selected.");
      if (!state.selectedLanguages.length) throw new Error("No languages selected.");

      const articles = state.repository.articles
        .filter((a) => state.selectedArticles.includes(a.slug))
        .map((a) => ({ html: null, slug: a.slug, _filename: a.source }));

      return runPublish(articles);
    },

    /** Translate all articles × all supported languages. */
    async translateAll() {
      if (!state.repository) throw new Error("Repository not scanned.");
      this.selectArticles(["*"]);
      if (!state.selectedLanguages.length) this.selectLanguages(["*"]);
      return this.translateSelected();
    },

    /** Build export plan from last translation results. */
    generateExportPlan(options = {}) {
      if (!state.lastResults) throw new Error("No translation results. Run translateSelected() or translateAll() first.");
      const articles = [];
      for (const item of state.lastResults.results) {
        for (const t of item.translations) {
          if (t.success && t.html) articles.push({ slug: item.slug, language: t.language, html: t.html });
        }
      }
      state.exportPlan = createExportPlan({ articles, baseURL: options.baseURL || "https://insight-chronicles.com" });
      return state.exportPlan;
    },

    /** Read-only snapshot of current state. */
    getState() {
      return {
        sourceLanguage: state.sourceLanguage,
        repositoryLoaded: !!state.repository,
        articleCount: state.repository ? state.repository.summary.totalArticles : 0,
        selectedArticles: [...state.selectedArticles],
        selectedLanguages: [...state.selectedLanguages],
        providerName: state.provider ? state.provider.getName() : "none",
        hasExportPlan: !!state.exportPlan,
        progress: { ...state.progress },
        lastResults: state.lastResults ? {
          success: state.lastResults.success,
          failed: state.lastResults.failed,
          generated: state.lastResults.generated,
          skipped: state.lastResults.skipped,
        } : null,
      };
    },

    setProvider(impl) { state.provider = createTranslationProvider(impl); },
    setSourceLanguage(code) {
      if (!isSupported(code)) throw new Error(`Unsupported language: "${code}"`);
      state.sourceLanguage = code;
      state.selectedLanguages = state.selectedLanguages.filter((l) => l !== code);
    },
  };

  // ── Internal ────────────────────────────────────────────────

  async function runPublish(articleEntries) {
    const articles = [];
    for (const entry of articleEntries) {
      const filename = entry._filename || `${entry.slug}.html`;
      try {
        const res = await fetch(`../${filename}`);
        if (!res.ok) { console.warn(`Skipping ${filename}: HTTP ${res.status}`); continue; }
        articles.push({ html: await res.text(), slug: entry.slug });
      } catch (err) { console.warn(`Skipping ${filename}: ${err.message}`); }
    }

    setProgress("translating", `Translating ${articles.length} article(s)...`);

    state.lastResults = await publishAll({
      articles,
      sourceLanguage: state.sourceLanguage,
      targetLanguages: state.selectedLanguages,
      translateFunction: (text, lang) => state.provider.translate(text, lang),
      onProgress: ({ articleIndex, articleTotal, language, status }) => {
        setProgress("translating", `Article ${articleIndex}/${articleTotal} → ${language}: ${status}`);
      },
    });

    setProgress("idle", `Done: ${state.lastResults.success} ok, ${state.lastResults.failed} failed.`);
    return state.lastResults;
  }

  function setProgress(phase, detail) {
    state.progress = { phase, detail };
    onProgress({ phase, detail });
  }

  return app;
}
