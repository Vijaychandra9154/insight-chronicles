/**
 * Application Controller — Insight Chronicles Localization System
 * Connects all modules. No DOM, no file I/O, no git operations.
 * @module app
 */

import { scanRepository } from "./repository.js";
import { publishAll } from "./publisher.js";
import { createTranslationProvider } from "./translationProvider.js";
import { createSarvamProvider } from "./providers/sarvamProvider.js";
import { isSupported } from "./languages.js";
import { createExportPlan } from "./githubExporter.js";
import { loadConfig, saveConfig } from "./config.js";
import { loadSession, saveSession } from "./persistence.js";

export function initializeApp(config = {}) {
  // ── Persisted config (parameter takes precedence) ──────────────
  const savedConfig = loadConfig();
  const apiKey = config.apiKey || savedConfig.apiKey || null;
  const endpoint = config.endpoint || savedConfig.endpoint || null;
  const proxyEndpoint = config.proxyEndpoint || null;
  const maxRetries = config.maxRetries;
  const onProgress = config.progressCallback || (() => {});
  const log = config.logger || (() => {});

  // ── Persisted session ────────────────────────────────────────
  const savedSession = loadSession();

  // ── State ───────────────────────────────────────────────────
  const state = {
    repository: null,
    provider: null,
    selectedArticles: savedSession.selectedArticles.length ? [...savedSession.selectedArticles] : [],
    selectedLanguages: savedSession.selectedLanguages.length ? [...savedSession.selectedLanguages] : ["hi"],
    exportPlan: null,
    lastPublishResult: null,
    busy: false,
  };

  // Provider — proxy mode (recommended for production) or direct mode
  if ((apiKey || proxyEndpoint) && endpoint) {
    const providerConfig = { apiKey, endpoint, proxyEndpoint };
    if (maxRetries !== undefined) providerConfig.maxRetries = maxRetries;
    state.provider = createTranslationProvider(createSarvamProvider(providerConfig));
    const mode = proxyEndpoint ? "sarvam (via proxy)" : "sarvam (direct — dev only)";
    log("info", `Provider initialized: ${mode}`);
    if (!proxyEndpoint && apiKey) {
      log("warn", "API key passed directly — NOT safe for public URLs. Use proxyEndpoint for production.");
    }
  } else {
    state.provider = createTranslationProvider();
    log("warn", "No API credentials — provider not configured");
  }

  // Persist credentials when provided (so next launch restores them)
  if (apiKey || endpoint) {
    saveConfig({ apiKey, endpoint });
  }

  // ── Guards ──────────────────────────────────────────────────
  const guardBusy = () => { if (state.busy) throw new Error("App is busy. Wait for current operation."); };
  const guardRepo = () => { if (!state.repository) throw new Error("Repository not scanned. Call scanRepository() first."); };
  const guardArts = () => { if (!state.selectedArticles.length) throw new Error("No articles selected."); };
  const guardLangs = () => { if (!state.selectedLanguages.length) throw new Error("No target languages selected."); };

  function progress(stage, detail) {
    const pct = (detail?.current != null && detail?.total)
      ? Math.round((detail.current / detail.total) * 100) : null;
    onProgress(stage, { ...detail, percent: pct });
  }

  // ── Public API ──────────────────────────────────────────────

  async function scanRepo() {
    guardBusy(); state.busy = true; progress("scanning", { phase: "start" });
    try {
      state.repository = await scanRepository({
        onProgress: ({ current, total, filename, status }) =>
          progress("scanning", { current, total, filename, status }),
      });
      state.selectedArticles = state.repository.articles.map((a) => a.slug);
      const s = state.repository.summary;
      log("info", `Scanned: ${s.totalArticles} articles, ${s.totalWords} words`);
      progress("scanning", { phase: "done", articles: s.totalArticles, words: s.totalWords });
    } finally { state.busy = false; }
  }

  function setSelectedArticles(slugs) {
    if (!Array.isArray(slugs)) throw new Error("setSelectedArticles expects an array.");
    state.selectedArticles = slugs;
    saveSession({ selectedArticles: slugs });
    log("info", `Selected ${slugs.length} article(s)`);
  }

  function setSelectedLanguages(codes) {
    if (!Array.isArray(codes)) throw new Error("setSelectedLanguages expects an array.");
    const invalid = codes.filter((c) => !isSupported(c));
    if (invalid.length) throw new Error(`Unsupported language(s): ${invalid.join(", ")}`);
    state.selectedLanguages = codes;
    saveSession({ selectedLanguages: codes });
    log("info", `Selected ${codes.length} language(s): ${codes.join(", ")}`);
  }

  async function translateSelected() {
    guardBusy(); guardRepo(); guardArts(); guardLangs();
    state.busy = true;
    progress("translating", { phase: "start", articles: state.selectedArticles.length, languages: state.selectedLanguages.length });
    try {
      const entries = state.repository.articles
        .filter((a) => state.selectedArticles.includes(a.slug))
        .map((a) => ({ html: null, slug: a.slug, _fn: a.source }));

      const fetched = [];
      for (const e of entries) {
        const fn = e._fn || `${e.slug}.html`;
        try {
          const res = await fetch(`../${fn}`);
          if (!res.ok) { log("warn", `Skip ${fn}: HTTP ${res.status}`); continue; }
          fetched.push({ html: await res.text(), slug: e.slug });
        } catch (err) { log("warn", `Skip ${fn}: ${err.message}`); }
      }
      if (!fetched.length) throw new Error("No articles could be fetched.");

      state.lastPublishResult = await publishAll({
        articles: fetched,
        sourceLanguage: "en",
        targetLanguages: state.selectedLanguages,
        translateFunction: (text, lang) => state.provider.translate(text, lang),
        translateBatchFunction: (texts, lang) => state.provider.translateBatch(texts, lang),
        onProgress: ({ articleIndex, articleTotal, language, status }) =>
          progress("translating", { current: articleIndex, total: articleTotal, language, status }),
      });

      const r = state.lastPublishResult;
      log("info", `Done: ${r.success} ok, ${r.failed} failed`);
      progress("translating", { phase: "done", success: r.success, failed: r.failed, generated: r.generated });
    } finally { state.busy = false; }
    return state.lastPublishResult;
  }

  async function translateAll() {
    guardRepo();
    setSelectedArticles(state.repository.articles.map((a) => a.slug));
    return translateSelected();
  }

  function generateExportPlan() {
    if (!state.lastPublishResult) throw new Error("No publish results. Translate first.");
    const entries = [];
    for (const item of state.lastPublishResult.results) {
      for (const t of item.translations) {
        if (t.success && t.html) entries.push({ slug: item.slug, language: t.language, html: t.html });
      }
    }
    state.exportPlan = createExportPlan({ articles: entries });
    log("info", `Export plan: ${state.exportPlan.report.totalFiles} files`);
    return state.exportPlan;
  }

  function getState() {
    return {
      repository: state.repository
        ? { totalArticles: state.repository.summary.totalArticles, totalWords: state.repository.summary.totalWords, languages: state.repository.summary.languages, articles: state.repository.articles.map(a => ({ slug: a.slug, language: a.language, wordCount: a.wordCount })) }
        : null,
      provider: state.provider ? state.provider.getName() : "none",
      selectedArticles: [...state.selectedArticles],
      selectedLanguages: [...state.selectedLanguages],
      hasExportPlan: !!state.exportPlan,
      lastResult: state.lastPublishResult
        ? { success: state.lastPublishResult.success, failed: state.lastPublishResult.failed, generated: state.lastPublishResult.generated, skipped: state.lastPublishResult.skipped }
        : null,
      busy: state.busy,
    };
  }

  function reset() {
    state.repository = null;
    state.selectedArticles = [];
    state.selectedLanguages = ["hi"];
    state.exportPlan = null;
    state.lastPublishResult = null;
    state.busy = false;
    log("info", "App state reset");
    progress("idle", { phase: "reset" });
  }

  return Object.freeze({ scanRepository: scanRepo, setSelectedArticles, setSelectedLanguages, translateSelected, translateAll, generateExportPlan, getState, reset });
}
