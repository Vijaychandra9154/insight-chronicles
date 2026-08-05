/**
 * Application UI — Insight Chronicles Translator
 * Thin presentation layer. No business / translation / repository logic.
 * Connects ONLY to app.js.
 * @module ui
 */

// ── State ───────────────────────────────────────────────────────────

let _app = null;

// Cached DOM refs (populated by cacheElements)
const $ = {};

// ── Public API ──────────────────────────────────────────────────────

/** Attaches the UI to an initialized app instance. Idempotent. */
export function initializeUI(app) {
  if (!app) throw new Error("initializeUI requires an app instance.");
  _app = app;
  cacheElements();
  bindEvents();
  syncFromState();
}

/** Renders the article selection list from repository data. */
export function renderArticles(articles) {
  const container = $.articleList;
  if (!container || !articles) return;
  container.innerHTML = articles.map((a) => `
    <label class="ui-article-row">
      <input type="checkbox" value="${escAttr(a.slug)}" data-article-checkbox checked />
      <span class="ui-article-slug">${esc(a.slug)}</span>
      <span class="ui-article-meta">${esc(a.language || "en")} · ${a.wordCount?.toLocaleString() || 0} words</span>
    </label>`).join("");
}

/** Renders language checkboxes from the language registry. */
export function renderLanguages(languages) {
  const container = $.langList;
  if (!container || !languages) return;
  container.innerHTML = languages.map((l) => `
    <label class="ui-lang-row">
      <input type="checkbox" value="${escAttr(l.code)}" data-lang-checkbox
        ${l.code === "hi" ? "checked" : ""} />
      <span class="ui-lang-name">${esc(l.nativeName)}</span>
      <span class="ui-lang-code">${esc(l.code)}</span>
    </label>`).join("");
}

/**
 * Updates the progress bar and label.
 * Normalises both progress shapes (fixes minor bug B7):
 *   repository.js → { current, total, filename, status }
 *   publisher.js  → { articleIndex, articleTotal, language, status }
 */
export function updateProgress(progress) {
  if (!progress) return;
  const bar = $.progressBar;
  const label = $.progressLabel;

  // Normalise the two legacy callback shapes (B7 fix)
  const current = progress.current ?? progress.articleIndex ?? null;
  const total = progress.total ?? progress.articleTotal ?? null;
  const pct = (current != null && total) ? Math.round((current / total) * 100) : null;

  if (bar && pct != null) {
    bar.style.width = `${pct}%`;
    bar.setAttribute("aria-valuenow", String(pct));
  }
  if (label) {
    const phase = progress.stage || progress.phase || "";
    const detail = progress.filename || progress.language || progress.status || "";
    const base = [phase, detail].filter(Boolean).join(" — ");
    label.textContent = pct != null ? `${base} (${pct}%)` : base;
  }
}

/** Shows an ephemeral status message. */
export function showStatus(message, type = "info") {
  const el = $.statusBar;
  if (!el) return;
  el.textContent = message;
  el.className = `ui-status ui-status-${type}`;
  el.style.display = "block";
  clearTimeout(el._timer);
  if (type !== "error") el._timer = setTimeout(() => { el.style.display = "none"; }, 6000);
}

/** Returns slugs of currently checked articles. */
export function getSelectedArticles() {
  return [...document.querySelectorAll("[data-article-checkbox]:checked")]
    .map((cb) => cb.value);
}

/** Returns language codes of currently checked languages. */
export function getSelectedLanguages() {
  return [...document.querySelectorAll("[data-lang-checkbox]:checked")]
    .map((cb) => cb.value);
}

/** (Re)binds all event listeners. Safe to call after DOM mutations. */
export function bindEvents() {
  // Scan
  $.scanBtn?.addEventListener("click", async () => {
    if (!_app || _app.getState().busy) return;
    setBusy(true);
    try {
      showStatus("Scanning repository…", "info");
      await _app.scanRepository();
      syncFromState();
      showStatus("Scan complete.", "success");
    } catch (err) {
      showStatus(err.message, "error");
    } finally { setBusy(false); }
  });

  // Translate selected
  $.translateBtn?.addEventListener("click", async () => {
    if (!_app || _app.getState().busy) return;
    const slugs = getSelectedArticles();
    const codes = getSelectedLanguages();
    if (!slugs.length) { showStatus("Select at least one article.", "warn"); return; }
    if (!codes.length) { showStatus("Select at least one language.", "warn"); return; }
    setBusy(true);
    try {
      _app.setSelectedArticles(slugs);
      _app.setSelectedLanguages(codes);
      showStatus("Translating…", "info");
      const result = await _app.translateSelected();
      showStatus(`Done: ${result.success} ok, ${result.failed} failed.`, result.failed ? "warn" : "success");
      // B4 mitigation: surface untranslated count when failures exist
      if (result.failed > 0) {
        const count = $.untranslatedCount;
        if (count) count.textContent = `${result.failed} article(s) had translation failures`;
      }
    } catch (err) {
      showStatus(err.message, "error");
    } finally { setBusy(false); }
  });

  // Translate all
  $.translateAllBtn?.addEventListener("click", async () => {
    if (!_app || _app.getState().busy) return;
    setBusy(true);
    try {
      showStatus("Translating all articles…", "info");
      const result = await _app.translateAll();
      showStatus(`Done: ${result.success} ok, ${result.failed} failed.`, result.failed ? "warn" : "success");
    } catch (err) {
      showStatus(err.message, "error");
    } finally { setBusy(false); }
  });

  // Export
  $.exportBtn?.addEventListener("click", () => {
    if (!_app) return;
    try {
      const plan = _app.generateExportPlan();
      window._lastPlan = plan;
      showStatus(`Export plan: ${plan.report.totalFiles} files ready.`, "success");
    } catch (err) {
      showStatus(err.message, "error");
    }
  });

  // Download export
  $.downloadBtn?.addEventListener("click", () => {
    if (!window._lastPlan) { showStatus("Generate export plan first.", "warn"); return; }
    const json = JSON.stringify(window._lastPlan, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "export-plan.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // Reset
  $.resetBtn?.addEventListener("click", () => {
    if (!_app) return;
    _app.reset();
    syncFromState();
    if ($.articleList) $.articleList.innerHTML = "";
    if ($.articleCount) $.articleCount.textContent = "0";
    if ($.untranslatedCount) $.untranslatedCount.textContent = "";
    const logList = document.getElementById("logList");
    if (logList) logList.innerHTML = "<li>—</li>";
    updateProgress(null);
    showStatus("Reset.", "info");
  });
}

// ── Internal helpers ────────────────────────────────────────────────

function cacheElements() {
  $.scanBtn       = document.getElementById("scanBtn");
  $.translateBtn  = document.getElementById("translateBtn");
  $.exportBtn     = document.getElementById("exportBtn");
  $.resetBtn      = document.getElementById("resetBtn");
  $.progressBar   = document.getElementById("progressBar");
  $.progressLabel = document.getElementById("progressLabel");
  $.statusBar     = document.getElementById("statusBar");
  $.articleList   = document.getElementById("articleList");
  $.langList      = document.getElementById("langList");
  $.articleCount  = document.getElementById("articleCount");
  $.langCount     = document.getElementById("langCount");
  $.busyOverlay   = document.getElementById("busyOverlay");
  $.untranslatedCount = document.getElementById("untranslatedCount");
  $.translateAllBtn = document.getElementById("translateAllBtn");
  $.downloadBtn     = document.getElementById("downloadBtn");
}

function syncFromState() {
  const s = _app?.getState();
  if (!s) return;
  if (s.repository) {
    $.articleCount && ($.articleCount.textContent = s.repository.totalArticles);
    $.langCount && ($.langCount.textContent = s.repository.languages?.length || 0);
  }
  setBusy(!!s.busy);
}

function setBusy(on) {
  const overlay = $.busyOverlay;
  const buttons = [$.scanBtn, $.translateBtn, $.exportBtn];
  if (overlay) overlay.style.display = on ? "flex" : "none";
  buttons.forEach((b) => { if (b) b.disabled = on; });
}

function esc(s) {
  if (!s) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escAttr(s) {
  return esc(s).replace(/"/g, "&quot;");
}
