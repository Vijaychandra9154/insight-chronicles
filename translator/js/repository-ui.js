/**
 * Repository Scanner UI — Insight Chronicles
 * Renders the scanner dashboard: stats cards, article table, and controls.
 *
 * @module repository-ui
 */

import { scanRepository, downloadDatabase, getArticleFiles } from "./repository.js";

// ── State ─────────────────────────────────────────────────────────

let scanResult = null;
let isScanning = false;

// ── DOM refs ──────────────────────────────────────────────────────

const scanBtn = document.getElementById("scanBtn");
const downloadBtn = document.getElementById("downloadBtn");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const statsGrid = document.getElementById("statsGrid");
const articlesTable = document.getElementById("articlesTable");
const checksTable = document.getElementById("checksTable");
const errorsSection = document.getElementById("errorsSection");
const articleCountSpan = document.getElementById("articleCount");

// ── Init ──────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  const total = getArticleFiles().length;
  if (articleCountSpan) articleCountSpan.textContent = total;

  if (scanBtn) scanBtn.addEventListener("click", startScan);
  if (downloadBtn) downloadBtn.addEventListener("click", handleDownload);

  renderEmptyState();
});

// ── Scan ──────────────────────────────────────────────────────────

async function startScan() {
  if (isScanning) return;
  isScanning = true;

  scanBtn.disabled = true;
  downloadBtn.disabled = true;
  scanBtn.textContent = "Scanning...";

  // Reset UI
  progressBar.style.width = "0%";
  progressText.textContent = "Starting...";
  statsGrid.innerHTML = "";
  articlesTable.innerHTML = "";
  checksTable.innerHTML = "";
  errorsSection.style.display = "none";

  try {
    scanResult = await scanRepository({
      onProgress: ({ current, total, filename, status }) => {
        const pct = Math.round((current / total) * 100);
        progressBar.style.width = `${pct}%`;
        const statusIcon = status === "done" ? "✓" : status === "error" ? "✗" : "⋯";
        progressText.textContent = `${statusIcon} ${current}/${total} — ${filename}`;
      }
    });

    renderResults(scanResult);
    scanBtn.textContent = "↻ Re-scan Repository";
    downloadBtn.disabled = false;
  } catch (err) {
    progressText.textContent = `Fatal error: ${err.message}`;
    console.error(err);
  } finally {
    isScanning = false;
    scanBtn.disabled = false;
  }
}

function handleDownload() {
  if (!scanResult) return;
  downloadDatabase(scanResult, "articles-db.json");
}

// ── Rendering ─────────────────────────────────────────────────────

function renderEmptyState() {
  statsGrid.innerHTML = `
    <div class="stat-card muted">
      <div class="stat-value">${getArticleFiles().length}</div>
      <div class="stat-label">Articles detected in manifest</div>
    </div>
    <div class="stat-card muted">
      <div class="stat-value">—</div>
      <div class="stat-label">Click "Scan Repository" to begin</div>
    </div>
  `;

  articlesTable.innerHTML = `
    <div class="empty-state">
      <p>Press <strong>Scan Repository</strong> to analyse every article in the repository.</p>
      <p class="hint">The scanner reads each HTML file, extracts metadata, and flags missing SEO elements.</p>
    </div>
  `;

  checksTable.innerHTML = "";
}

function renderResults(db) {
  const s = db.summary;

  // ── Stats cards ─────────────────────────────────────────
  statsGrid.innerHTML = `
    <div class="stat-card success">
      <div class="stat-value">${s.totalArticles}</div>
      <div class="stat-label">✓ Articles Found</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${s.totalWords.toLocaleString()}</div>
      <div class="stat-label">Total Words</div>
    </div>
    <div class="stat-card warning">
      <div class="stat-value">${s.missingTitle + s.missingDescription + s.missingOgTags + s.missingSchema + s.missingCanonical + s.missingHreflang}</div>
      <div class="stat-label">⚠ Missing Metadata</div>
    </div>
    <div class="stat-card info">
      <div class="stat-value">${s.languages.join(", ").toUpperCase() || "none"}</div>
      <div class="stat-label">Languages Detected</div>
    </div>
    <div class="stat-card cost">
      <div class="stat-value">$${s.estimatedTranslationCostUSD.toLocaleString()}</div>
      <div class="stat-label">Estimated Translation Cost</div>
    </div>
    <div class="stat-card ${s.errors > 0 ? 'error' : ''}">
      <div class="stat-value">${s.errors}</div>
      <div class="stat-label">${s.errors === 0 ? '✓ No' : '✗'} Scan Errors</div>
    </div>
  `;

  // ── Missing metadata detail ─────────────────────────────
  const missingItems = [];
  if (s.missingTitle) missingItems.push(`${s.missingTitle} missing title`);
  if (s.missingDescription) missingItems.push(`${s.missingDescription} missing description`);
  if (s.missingOgTags) missingItems.push(`${s.missingOgTags} incomplete OG tags`);
  if (s.missingSchema) missingItems.push(`${s.missingSchema} missing schema`);
  if (s.missingCanonical) missingItems.push(`${s.missingCanonical} missing canonical`);
  if (s.missingHreflang) missingItems.push(`${s.missingHreflang} missing hreflang`);

  const missingEl = document.getElementById("missingSummary");
  if (missingItems.length === 0) {
    missingEl.textContent = "✓ All metadata checks passed.";
    missingEl.className = "missing-summary ok";
  } else {
    missingEl.textContent = missingItems.join(" • ");
    missingEl.className = "missing-summary";
  }

  // ── Articles table ──────────────────────────────────────
  articlesTable.innerHTML = buildArticlesTable(db.articles);

  // ── Checks detail table ─────────────────────────────────
  checksTable.innerHTML = buildChecksTable(db.articles);

  // ── Errors ──────────────────────────────────────────────
  if (db.errors.length > 0) {
    errorsSection.style.display = "block";
    document.getElementById("errorsList").innerHTML = db.errors
      .map((e) => `<li><code>${esc(e.filename)}</code> — ${esc(e.error)}</li>`)
      .join("");
  } else {
    errorsSection.style.display = "none";
  }
}

// ── Table builders ─────────────────────────────────────────────────

function buildArticlesTable(articles) {
  if (!articles.length) return '<div class="empty-state"><p>No articles found.</p></div>';

  const rows = articles
    .map(
      (a) => `
    <tr>
      <td class="cell-slug"><code>${esc(a.slug)}</code></td>
      <td class="cell-lang"><span class="badge lang-${esc(a.language)}">${esc(a.language).toUpperCase()}</span></td>
      <td class="cell-title">${esc(truncate(a.title, 60))}</td>
      <td class="cell-date">${esc(a.publishDate)}</td>
      <td class="cell-num">${a.wordCount.toLocaleString()}</td>
      <td class="cell-num">${a.headings}</td>
      <td class="cell-num">${a.paragraphCount}</td>
      <td class="cell-num">${a.internalLinks.length}</td>
      <td class="cell-checks">${renderCheckBadges(a.checks)}</td>
    </tr>`
    )
    .join("");

  return `
    <table>
      <thead>
        <tr>
          <th>Slug</th>
          <th>Lang</th>
          <th>Title</th>
          <th>Date</th>
          <th>Words</th>
          <th>H2s</th>
          <th>&lt;p&gt;</th>
          <th>Links</th>
          <th>Missing</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function buildChecksTable(articles) {
  const rows = articles
    .map((a) => {
      const c = a.checks;
      const issues = [];
      if (c.missingTitle) issues.push("title");
      if (c.missingDescription) issues.push("desc");
      if (c.missingOgTags) issues.push("og");
      if (c.missingSchema) issues.push("schema");
      if (c.missingCanonical) issues.push("canonical");
      if (c.missingHreflang) issues.push("hreflang");

      return `
    <tr>
      <td><code>${esc(a.slug)}</code></td>
      <td>${c.ogTitle ? "✓" : '<span class="flag miss">✗</span>'}</td>
      <td>${c.ogDescription ? "✓" : '<span class="flag miss">✗</span>'}</td>
      <td>${c.ogImage ? "✓" : '<span class="flag miss">✗</span>'}</td>
      <td>${c.ogType ? "✓" : '<span class="flag miss">✗</span>'}</td>
      <td>${c.twitterCard ? "✓" : '<span class="flag miss">✗</span>'}</td>
      <td>${c.schema ? "✓" : '<span class="flag miss">✗</span>'}</td>
      <td>${c.canonical ? "✓" : '<span class="flag miss">✗</span>'}</td>
      <td>${c.hreflang ? "✓" : '<span class="flag miss">✗</span>'}</td>
      <td>${issues.length ? issues.join(", ") : '<span class="flag ok">none</span>'}</td>
    </tr>`;
    })
    .join("");

  return `
    <table>
      <thead>
        <tr>
          <th>Article</th>
          <th>OG Title</th>
          <th>OG Desc</th>
          <th>OG Image</th>
          <th>OG Type</th>
          <th>Twitter</th>
          <th>Schema</th>
          <th>Canonical</th>
          <th>Hreflang</th>
          <th>Issues</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderCheckBadges(checks) {
  const badges = [];
  if (checks.missingTitle) badges.push('<span class="badge-bad">T</span>');
  if (checks.missingDescription) badges.push('<span class="badge-bad">D</span>');
  if (checks.missingOgTags) badges.push('<span class="badge-bad">OG</span>');
  if (checks.missingSchema) badges.push('<span class="badge-bad">SC</span>');
  if (checks.missingCanonical) badges.push('<span class="badge-bad">CN</span>');
  if (checks.missingHreflang) badges.push('<span class="badge-bad">HL</span>');
  return badges.length ? badges.join(" ") : '<span class="badge-ok">✓</span>';
}

// ── Helpers ───────────────────────────────────────────────────────

function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(str, len) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "…" : str;
}
