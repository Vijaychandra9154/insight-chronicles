/**
 * GitHub Export Planner — Insight Chronicles
 * Prepares translated articles for deployment. Generates file paths,
 * sitemap entries, and index updates. Does NOT write to disk.
 *
 * @module githubExporter
 */

import { getLanguage } from "./languages.js";

// ── Public API ────────────────────────────────────────────────────

/**
 * Creates an export plan from translated article results.
 *
 * @param {object} options
 * @param {Array<{slug:string, language:string, html:string}>} options.articles
 * @param {string} [options.baseURL]     — site base URL (default: https://insight-chronicles.com)
 * @param {string} [options.outputStructure] — "language-folders" (default)
 * @returns {object} { files, sitemap, articlesIndex, report }
 */
export function createExportPlan({ articles, baseURL = "https://insight-chronicles.com", outputStructure = "language-folders" }) {
  if (!articles || !articles.length) {
    return { files: [], sitemap: [], articlesIndex: [], report: emptyReport() };
  }

  const files = [];
  const sitemap = [];
  const articlesIndex = [];
  const seenLanguages = new Set();
  const seenSlugs = new Set();
  let totalSizeBytes = 0;

  for (const entry of articles) {
    const { slug, language, html } = entry;
    if (!slug || !language || html === undefined) continue;

    const lang = getLanguage(language);
    if (!lang) continue; // skip unsupported languages

    const path = buildPath(slug, language, outputStructure);
    const url = `${baseURL.replace(/\/$/, "")}/${path}`;
    const size = new Blob([html]).size;

    // File entry
    files.push({ path, language, slug, content: html, sizeBytes: size });
    totalSizeBytes += size;
    seenLanguages.add(language);
    seenSlugs.add(slug);

    // Sitemap entry
    sitemap.push({
      url,
      lastmod: new Date().toISOString().slice(0, 10),
      changefreq: "monthly",
      priority: language === "en" ? 0.8 : 0.6
    });

    // Articles index entry
    articlesIndex.push({
      slug: `${slug}-${language}`,
      originalSlug: slug,
      language,
      url,
      path
    });
  }

  return {
    files,
    sitemap,
    articlesIndex,
    report: {
      totalFiles: files.length,
      totalLanguages: seenLanguages.size,
      totalArticles: seenSlugs.size,
      estimatedSizeBytes: totalSizeBytes,
      estimatedSizeKB: Math.round((totalSizeBytes / 1024) * 100) / 100,
      generatedAt: new Date().toISOString()
    }
  };
}

/**
 * Generates hreflang tags for an article that exists in multiple languages.
 * Call this per original slug with all its translated language codes.
 *
 * @param {object} options
 * @param {string} options.slug         — original article slug
 * @param {string} options.sourceLang   — source language code (e.g. "en")
 * @param {string[]} options.languages  — all available language codes including source
 * @param {string} [options.baseURL]
 * @returns {string} HTML <link> tags for hreflang
 */
export function buildHreflangTags({ slug, sourceLang, languages, baseURL = "https://insight-chronicles.com" }) {
  if (!languages || !languages.length) return "";

  const base = baseURL.replace(/\/$/, "");
  const lines = [];

  for (const lang of languages) {
    const langInfo = getLanguage(lang);
    if (!langInfo) continue;

    const path = lang === sourceLang ? `${slug}.html` : `${lang}/${slug}.html`;
    const url = `${base}/${path}`;

    lines.push(`<link rel="alternate" hreflang="${lang}" href="${url}" />`);
  }

  // x-default points to the source language
  const defaultPath = `${slug}.html`;
  lines.push(`<link rel="alternate" hreflang="x-default" href="${base}/${defaultPath}" />`);

  return lines.join("\n");
}

/**
 * Generates an updated articles.json entry for a translated article.
 *
 * @param {object} options
 * @param {string} options.slug
 * @param {string} options.language
 * @param {string} options.title        — translated title
 * @param {string} options.description  — translated description
 * @param {string} options.baseURL
 * @returns {object} articles.json-compatible entry
 */
export function buildArticleIndexEntry({ slug, language, title, description, baseURL = "https://insight-chronicles.com" }) {
  const lang = getLanguage(language);
  return {
    title,
    slug: `${language}/${slug}.html`,
    url: `${baseURL.replace(/\/$/, "")}/${language}/${slug}.html`,
    desc: description || "",
    lang: language,
    nativeName: lang ? lang.nativeName : language,
    direction: lang ? lang.direction : "ltr"
  };
}

// ── Helpers ───────────────────────────────────────────────────────

function buildPath(slug, language, structure) {
  if (structure === "language-folders") {
    return `${language}/${slug}.html`;
  }
  // Default: language-folders
  return `${language}/${slug}.html`;
}

function emptyReport() {
  return {
    totalFiles: 0,
    totalLanguages: 0,
    totalArticles: 0,
    estimatedSizeBytes: 0,
    estimatedSizeKB: 0,
    generatedAt: new Date().toISOString()
  };
}
