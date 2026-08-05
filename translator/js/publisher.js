/**
 * Publishing Engine — Insight Chronicles
 * Connects translator → validator → languages into a publish pipeline.
 * Does NOT write files, commit git, or update any index.
 *
 * @module publisher
 */

import { translateDocument } from "./translator.js";
import { validateTranslation } from "./validator.js";
import { isSupported } from "./languages.js";

// ── Thresholds ────────────────────────────────────────────────────

const MIN_SCORE = 90;

// ── Public API ────────────────────────────────────────────────────

/**
 * Translates one article into multiple target languages.
 *
 * @param {object} options
 * @param {string} options.html              — original article HTML
 * @param {string} options.sourceLanguage    — source language code (e.g. "en")
 * @param {string[]} options.targetLanguages — target language codes (e.g. ["hi","te"])
 * @param {function} options.translateFunction — async (text, lang) => translatedText
 * @param {string} [options.slug]            — article slug (optional)
 * @returns {Promise<object[]>} Array of per-language results
 */
export async function publishArticle({ html, sourceLanguage, targetLanguages, translateFunction, slug = "" }) {
  if (!html) throw new Error("publishArticle requires html.");
  if (!targetLanguages || !targetLanguages.length) throw new Error("publishArticle requires targetLanguages.");

  const results = [];

  for (const lang of targetLanguages) {
    // Skip source language
    if (lang === sourceLanguage) continue;

    // Validate language code
    if (!isSupported(lang)) {
      results.push({ language: lang, success: false, score: 0, error: `Unsupported language: "${lang}"` });
      continue;
    }

    try {
      // ── Translate ──
      const translation = await translateDocument({
        html,
        targetLanguage: lang,
        translateFunction,
        slug
      });

      // ── Validate ──
      const report = validateTranslation({
        originalHTML: html,
        translatedHTML: translation.html,
        translatedNodes: translation.translatedNodes,
        targetLanguage: lang
      });

      const passed = report.valid && report.score >= MIN_SCORE;

      results.push({
        language: lang,
        html: translation.html,
        translatedNodes: translation.translatedNodes,
        translatedCount: translation.translatedCount,
        cachedCount: translation.cachedCount,
        score: report.score,
        warnings: report.warnings,
        errors: report.errors,
        success: passed
      });
    } catch (err) {
      results.push({
        language: lang,
        success: false,
        score: 0,
        error: err.message
      });
    }
  }

  return results;
}

/**
 * Translates multiple articles into multiple target languages.
 *
 * @param {object} options
 * @param {Array<{html:string, slug?:string}>} options.articles — articles to translate
 * @param {string} options.sourceLanguage                       — source language code
 * @param {string[]} options.targetLanguages                    — target language codes
 * @param {function} options.translateFunction                  — async (text, lang) => translatedText
 * @param {function} [options.onProgress]                       — ({articleIndex, articleTotal, language, status})
 * @returns {Promise<object>} { results, success, failed, generated, skipped }
 */
export async function publishAll({ articles, sourceLanguage, targetLanguages, translateFunction, onProgress }) {
  if (!articles || !articles.length) throw new Error("publishAll requires articles array.");
  if (!targetLanguages || !targetLanguages.length) throw new Error("publishAll requires targetLanguages.");

  const allResults = [];
  let success = 0;
  let failed = 0;
  let generated = 0;
  let skipped = 0;

  const effectiveTargets = targetLanguages.filter((l) => l !== sourceLanguage);
  skipped = articles.length * (targetLanguages.length - effectiveTargets.length);

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const slug = article.slug || `article-${i}`;

    if (onProgress) {
      onProgress({ articleIndex: i + 1, articleTotal: articles.length, language: null, status: "starting" });
    }

    const perArticle = await publishArticle({
      html: article.html,
      sourceLanguage,
      targetLanguages: effectiveTargets,
      translateFunction,
      slug
    });

    for (const result of perArticle) {
      result.slug = slug;
      if (result.success) {
        success++;
        generated++;
      } else {
        failed++;
      }
      if (onProgress) {
        onProgress({
          articleIndex: i + 1,
          articleTotal: articles.length,
          language: result.language,
          status: result.success ? "ok" : "failed"
        });
      }
    }

    allResults.push({ slug, translations: perArticle });
  }

  return {
    results: allResults,
    success,
    failed,
    generated,
    skipped,
    totalArticles: articles.length,
    targetLanguages: effectiveTargets
  };
}

/**
 * Returns the languages to publish to, excluding the source language.
 * @param {string} sourceLanguage
 * @param {string[]} targetLanguages
 * @returns {string[]}
 */
export function effectiveTargets(sourceLanguage, targetLanguages) {
  return targetLanguages.filter((l) => isSupported(l) && l !== sourceLanguage);
}
