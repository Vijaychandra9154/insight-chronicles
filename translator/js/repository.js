/**
 * Repository Scanner — Insight Chronicles
 * Module 1: Scans all article HTML files, extracts metadata,
 * checks for missing SEO elements, and builds the articles database.
 *
 * @module repository
 */

// ── Article manifest ─────────────────────────────────────────────
// Every article-*.html file in the repo (excluding article_template.html).
// This list is maintained manually — GitHub Pages cannot list directories.
const ARTICLE_FILES = [
  "article-1.html",
  "article-aadhaar-identity.html",
  "article-abha-health.html",
  "article-dbt-welfare.html",
  "article-digi-yatra-travel.html",
  "article-digilocker-documents.html",
  "article-education-learning.html",
  "article-gem-procurement.html",
  "article-hardware-bio.html",
  "article-history-controllers-1.html",
  "article-history-controllers-2.html",
  "article-history-controllers-3.html",
  "article-history-controllers-4.html",
  "article-history-controllers-5.html",
  "article-history-controllers-6.html",
  "article-idex-defence-innovation.html",
  "article-ocen-credit.html",
  "article-ondc-ecommerce.html",
  "article-onoe-elections.html",
  "article-onos-research.html",
  "article-ulip-logistics.html",
  "article-upi-digital-payments.html",
  "article-valuation-game.html"
];

// Files that should never be treated as articles
const EXCLUDED_FILES = [
  "article_template.html"
];

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Returns the slug for an article filename (filename without .html).
 */
function slugFromFilename(filename) {
  return filename.replace(/\.html$/, "");
}

/**
 * Strips the site suffix from a <title> value.
 * e.g. "UPI: How India Built… – Insight Chronicles" → "UPI: How India Built…"
 */
function stripTitleSuffix(raw) {
  if (!raw) return "";
  return raw.replace(/\s*[–—\-]\s*Insight Chronicles\s*$/i, "").trim();
}

/**
 * Extracts the publish date from a .article-meta string.
 * e.g. "2026-05-10 • ~ 12 min read"   → "2026-05-10"
 *      "2026-07-27 • తెలుగు"           → "2026-07-27"
 *      "2025 • India, digital..."      → "2025"
 *      "2026 • India, public infra..." → "2026"
 */
function extractDate(metaText) {
  if (!metaText) return "";
  // Try YYYY-MM-DD first
  let m = metaText.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  // Fall back to YYYY only
  m = metaText.match(/^(\d{4})\b/);
  return m ? m[1] : "";
}

/**
 * Counts words in a text string. Handles Latin, Telugu, and mixed scripts.
 */
function countWords(text) {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Returns true if a URL is internal (relative path or same-domain).
 */
function isInternalLink(href) {
  if (!href) return false;
  if (/^https?:\/\//i.test(href)) {
    return href.includes("insight-chronicles.com");
  }
  if (/^(mailto|tel|javascript):/i.test(href)) return false;
  if (href.startsWith("#")) return false;
  return true;
}

// ── Extraction ────────────────────────────────────────────────────

/**
 * Parses an article HTML string and returns a structured article record.
 * @param {string} html - Raw HTML of the article page
 * @param {string} filename - The article's filename
 * @returns {object} Article record
 */
function extractArticle(html, filename) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // -- Slug & source --
  const slug = slugFromFilename(filename);

  // -- Language --
  const lang = (doc.documentElement.getAttribute("lang") || "").trim();

  // -- Title --
  const ogTitle = doc.querySelector('meta[property="og:title"]');
  const twitterTitle = doc.querySelector('meta[name="twitter:title"]');
  const titleTag = doc.querySelector("title");
  const h1 = doc.querySelector("h1.article-title, .article-heading h1, h1");

  const titleRaw = ogTitle ? ogTitle.getAttribute("content") : "";
  const title = titleRaw || stripTitleSuffix(titleTag ? titleTag.textContent : "") || (h1 ? h1.textContent.trim() : "");

  // -- Description --
  const ogDesc = doc.querySelector('meta[property="og:description"]');
  const twitterDesc = doc.querySelector('meta[name="twitter:description"]');
  const metaDesc = doc.querySelector('meta[name="description"]');
  const lead = doc.querySelector(".article-lead");

  const description = (ogDesc ? ogDesc.getAttribute("content") : "")
    || (metaDesc ? metaDesc.getAttribute("content") : "")
    || (lead ? lead.textContent.trim() : "");

  // -- Canonical --
  const canonicalEl = doc.querySelector('link[rel="canonical"]');
  const canonical = canonicalEl ? canonicalEl.getAttribute("href") : "";

  // -- Image --
  const ogImage = doc.querySelector('meta[property="og:image"]');
  const twitterImage = doc.querySelector('meta[name="twitter:image"]');
  const image = ogImage ? ogImage.getAttribute("content") : (twitterImage ? twitterImage.getAttribute("content") : "");

  // -- Publish date --
  const metaEl = doc.querySelector(".article-meta");
  const publishDate = extractDate(metaEl ? metaEl.textContent : "");

  // -- Headings (h2 inside article body) --
  const articleBody = doc.querySelector(".article-body, article");
  const h2s = articleBody ? articleBody.querySelectorAll("h2") : [];
  const headings = h2s.length;

  // -- Paragraph count --
  const paragraphs = articleBody ? articleBody.querySelectorAll("p") : [];
  const paragraphCount = paragraphs.length;

  // -- Word count --
  const bodyText = articleBody ? articleBody.textContent : "";
  const wordCount = countWords(bodyText);

  // -- Internal links --
  const allLinks = articleBody ? articleBody.querySelectorAll("a[href]") : [];
  const internalLinks = [];
  allLinks.forEach((a) => {
    const href = a.getAttribute("href");
    if (isInternalLink(href)) {
      internalLinks.push(href);
    }
  });

  // -- Previous / Next article --
  let previousArticle = "";
  let nextArticle = "";

  const navLinks = doc.querySelectorAll(".ic-article-nav a[href]");
  navLinks.forEach((a) => {
    const kicker = a.querySelector(".kicker");
    const label = kicker ? kicker.textContent.trim().toLowerCase() : "";
    const target = a.getAttribute("href");
    if (label.includes("previous") || label.includes("prev")) {
      previousArticle = target || "";
    } else if (label.includes("next")) {
      nextArticle = target || "";
    }
  });

  // -- Schema (JSON-LD) --
  const schemaScript = doc.querySelector('script[type="application/ld+json"]');
  const hasSchema = !!schemaScript;

  // -- hreflang --
  const hreflangLinks = doc.querySelectorAll('link[rel="alternate"][hreflang]');
  const hasHreflang = hreflangLinks.length > 0;

  // -- Open Graph completeness --
  const hasOgTitle = !!ogTitle;
  const hasOgDesc = !!ogDesc;
  const hasOgImage = !!ogImage;
  const hasOgType = !!doc.querySelector('meta[property="og:type"]');
  const hasOgUrl = !!doc.querySelector('meta[property="og:url"]');

  // -- Twitter card --
  const hasTwitterCard = !!doc.querySelector('meta[name="twitter:card"]');
  const hasTwitterTitle = !!twitterTitle;
  const hasTwitterDesc = !!twitterDesc;
  const hasTwitterImage = !!twitterImage;

  // -- Build checks --
  const checks = {
    missingTitle: !title,
    missingDescription: !description,
    missingOgTags: !hasOgTitle || !hasOgDesc || !hasOgImage || !hasOgType,
    missingSchema: !hasSchema,
    missingCanonical: !canonical,
    missingHreflang: !hasHreflang,
    // Detail flags for reporting
    ogTitle: hasOgTitle,
    ogDescription: hasOgDesc,
    ogImage: hasOgImage,
    ogType: hasOgType,
    ogUrl: hasOgUrl,
    twitterCard: hasTwitterCard,
    twitterTitle: hasTwitterTitle,
    twitterDescription: hasTwitterDesc,
    twitterImage: hasTwitterImage,
    schema: hasSchema,
    canonical: !!canonical,
    hreflang: hasHreflang
  };

  return {
    slug,
    source: filename,
    language: lang,
    title,
    description,
    canonical,
    image,
    publishDate,
    headings,
    paragraphCount,
    wordCount,
    internalLinks,
    previousArticle,
    nextArticle,
    checks,
    translations: []
  };
}

// ── Scanner ───────────────────────────────────────────────────────

/**
 * Scans the repository by fetching and parsing every article.
 *
 * @param {object} [options]
 * @param {function} [options.onProgress] - Called with { current, total, filename, status }
 * @param {function} [options.onArticle]  - Called with each completed article record
 * @param {string[]} [options.files]      - Override the article file list
 * @returns {Promise<object>} The complete articles database
 */
export async function scanRepository(options = {}) {
  const files = options.files || ARTICLE_FILES;
  const onProgress = options.onProgress || (() => {});
  const onArticle = options.onArticle || (() => {});

  const articles = [];
  const errors = [];
  let totalWords = 0;
  let totalHeadings = 0;
  let totalParagraphs = 0;

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];

    // Skip explicitly excluded files
    if (EXCLUDED_FILES.includes(filename)) continue;

    onProgress({ current: i + 1, total: files.length, filename, status: "fetching" });

    try {
      const response = await fetch(`../${filename}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const html = await response.text();
      onProgress({ current: i + 1, total: files.length, filename, status: "parsing" });

      const article = extractArticle(html, filename);

      // Accumulate stats
      totalWords += article.wordCount;
      totalHeadings += article.headings;
      totalParagraphs += article.paragraphCount;

      articles.push(article);
      onArticle(article);
      onProgress({ current: i + 1, total: files.length, filename, status: "done" });
    } catch (err) {
      errors.push({ filename, error: err.message });
      onProgress({ current: i + 1, total: files.length, filename, status: "error", error: err.message });
    }
  }

  // -- Aggregate checks --
  const missingTitle = articles.filter((a) => a.checks.missingTitle);
  const missingDescription = articles.filter((a) => a.checks.missingDescription);
  const missingOgTags = articles.filter((a) => a.checks.missingOgTags);
  const missingSchema = articles.filter((a) => a.checks.missingSchema);
  const missingCanonical = articles.filter((a) => a.checks.missingCanonical);
  const missingHreflang = articles.filter((a) => a.checks.missingHreflang);

  // Unique languages
  const languages = [...new Set(articles.map((a) => a.language).filter(Boolean))];

  // Translation cost estimate
  const translationCost = estimateTranslationCost(articles, languages);

  const db = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalArticles: articles.length,
      totalWords,
      totalHeadings,
      totalParagraphs,
      languages,
      errors: errors.length,
      missingTitle: missingTitle.length,
      missingDescription: missingDescription.length,
      missingOgTags: missingOgTags.length,
      missingSchema: missingSchema.length,
      missingCanonical: missingCanonical.length,
      missingHreflang: missingHreflang.length,
      estimatedTranslationCostUSD: translationCost
    },
    articles,
    errors
  };

  return db;
}

/**
 * Estimate cost to translate all articles across all language pairs.
 * Conservative estimate: $0.08/word for professional translation.
 */
function estimateTranslationCost(articles, languages) {
  const totalWords = articles.reduce((sum, a) => sum + a.wordCount, 0);
  const langCount = Math.max(languages.length, 1);
  const costPerWord = 0.08;
  const totalCost = totalWords * (langCount - 1) * costPerWord;
  return Math.round(totalCost * 100) / 100;
}

/**
 * Downloads the articles database as a JSON file.
 * @param {object} db - The database from scanRepository()
 * @param {string} [filename] - Download filename
 */
export function downloadDatabase(db, filename = "articles-db.json") {
  const json = JSON.stringify(db, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Returns the current article file list (for UI display).
 */
export function getArticleFiles() {
  return ARTICLE_FILES.filter((f) => !EXCLUDED_FILES.includes(f));
}

export { ARTICLE_FILES, EXCLUDED_FILES, slugFromFilename, extractArticle };
