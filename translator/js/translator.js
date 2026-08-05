/**
 * Translation Orchestrator — Insight Chronicles
 * Coordinates the full translation pipeline: parse → classify → TM lookup →
 * translate → rebuild. Does NOT implement any translation API.
 *
 * @module translator
 */

import { parseArticleHTML } from "./parser.js";
import { classifyNode } from "./nodeClassifier.js";
import {
  getTranslation,
  setTranslation,
  hasTranslation
} from "./translationMemory.js";
import { rebuildHTML } from "./htmlRebuilder.js";

// ── Public API ────────────────────────────────────────────────────

/**
 * Translates an HTML document through the full pipeline.
 *
 * Uses batch translation when `translateBatchFunction` is provided —
 * all non-cached nodes are translated in a single API call instead of
 * one-by-one. Falls back to sequential translateFunction calls when
 * no batch function is available.
 *
 * @param {object} options
 * @param {string} options.html                  — raw article HTML
 * @param {string} options.targetLanguage         — language code (e.g. "hi", "te")
 * @param {function} options.translateFunction    — async (text, lang) => translatedText
 * @param {function} [options.translateBatchFunction] — async (texts[], lang) => translatedTexts[]
 * @param {string} [options.slug]                 — article slug (optional)
 * @returns {Promise<object>} { html, translatedNodes, translatedCount, cachedCount, failedCount, skippedCount }
 */
export async function translateDocument({ html, targetLanguage, translateFunction, translateBatchFunction, slug = "" }) {
  if (!html) throw new Error("Missing required option: html");
  if (!targetLanguage) throw new Error("Missing required option: targetLanguage");
  if (typeof translateFunction !== "function") {
    throw new Error("Missing required option: translateFunction");
  }

  // ── 1. Parse HTML into AST ──
  const ast = parseArticleHTML(html, slug);
  const nodes = ast.nodes;

  // ── 2. Classify every node ──
  const classified = nodes.map((node) => ({
    node,
    classification: classifyNode(node)
  }));

  // ── 3. Split into translatable vs skipped ──
  const toTranslate = [];
  const skipped = [];

  for (const { node, classification } of classified) {
    if (classification.priority === "ignore") {
      skipped.push(node);
    } else {
      toTranslate.push({ node, classification });
    }
  }

  // ── 4. TM lookup — separate cached from uncached ──
  let cachedCount = 0;
  let translatedCount = 0;
  let failedCount = 0;
  const translatedNodes = [];
  const cachedItems = [];    // { node, translatedText, priority }
  const uncachedItems = [];  // { node, sourceText, priority }

  for (const { node, classification } of toTranslate) {
    const sourceText = node.text || "";

    if (!sourceText.trim()) {
      skipped.push(node);
      continue;
    }

    const priority = classification.priority;

    if (hasTranslation(sourceText, targetLanguage)) {
      const cachedText = getTranslation(sourceText, targetLanguage);
      cachedItems.push({ node, translatedText: cachedText, priority });
      cachedCount++;
    } else {
      uncachedItems.push({ node, sourceText, priority });
    }
  }

  // ── 5. Translate uncached nodes — batch or sequential ──
  if (uncachedItems.length > 0) {
    const hasBatch = typeof translateBatchFunction === "function";

    if (hasBatch) {
      // ── Batch path (single API call for all uncached nodes) ──
      const sourceTexts = uncachedItems.map((item) => item.sourceText);
      let batchResults;

      try {
        batchResults = await translateBatchFunction(sourceTexts, targetLanguage);
      } catch (err) {
        // Batch failed — fall back to sequential
        console.warn(`Batch translation failed, falling back to sequential: ${err.message}`);
        batchResults = null;
      }

      if (batchResults && Array.isArray(batchResults) && batchResults.length === uncachedItems.length) {
        // Success — distribute batch results
        for (let i = 0; i < uncachedItems.length; i++) {
          const { node, sourceText, priority } = uncachedItems[i];
          const translatedText = String(batchResults[i] || sourceText).trim();

          if (translatedText && translatedText !== sourceText) {
            setTranslation(sourceText, targetLanguage, translatedText);
            translatedCount++;
          } else if (!translatedText || translatedText === sourceText) {
            failedCount++;
          }
          translatedNodes.push({ ...node, priority, translatedText: translatedText || sourceText });
        }
      } else {
        // Batch returned wrong shape — sequential fallback
        for (const { node, sourceText, priority } of uncachedItems) {
          let translatedText;
          let errored = false;
          try {
            translatedText = await translateFunction(sourceText, targetLanguage);
          } catch (err) {
            console.warn(`Translation failed for node ${node.id}: ${err.message}`);
            translatedText = sourceText;
            errored = true;
          }
          if (translatedText && translatedText !== sourceText) {
            setTranslation(sourceText, targetLanguage, translatedText);
            translatedCount++;
          } else {
            failedCount++;
          }
          translatedNodes.push({ ...node, priority, translatedText: translatedText || sourceText });
        }
      }
    } else {
      // ── Sequential path (no batch function available) ──
      for (const { node, sourceText, priority } of uncachedItems) {
        let translatedText;
        try {
          translatedText = await translateFunction(sourceText, targetLanguage);
        } catch (err) {
          console.warn(`Translation failed for node ${node.id}: ${err.message}`);
          translatedText = sourceText;
        }
        if (translatedText && translatedText !== sourceText) {
          setTranslation(sourceText, targetLanguage, translatedText);
          translatedCount++;
        } else {
          failedCount++;
        }
        translatedNodes.push({ ...node, priority, translatedText: translatedText || sourceText });
      }
    }
  }

  // ── 6. Add cached nodes to result ──
  for (const { node, translatedText, priority } of cachedItems) {
    translatedNodes.push({ ...node, priority, translatedText });
  }

  // ── 7. Rebuild HTML ──
  const rebuilt = rebuildHTML(html, translatedNodes);

  // ── 8. Return result ──
  return {
    html: rebuilt,
    translatedNodes,
    translatedCount,
    cachedCount,
    failedCount,
    skippedCount: skipped.length
  };
}

/**
 * Synchronous variant that only uses cached translations.
 * Does NOT call translateFunction. Useful for pre-seeded TMs.
 *
 * @param {object} options
 * @param {string} options.html
 * @param {string} options.targetLanguage
 * @param {string} [options.slug]
 * @returns {object} { html, translatedNodes, cachedCount, skippedCount, missingCount }
 */
export function translateDocumentCached({ html, targetLanguage, slug = "" }) {
  if (!html) throw new Error("Missing required option: html");
  if (!targetLanguage) throw new Error("Missing required option: targetLanguage");

  const ast = parseArticleHTML(html, slug);
  const nodes = ast.nodes;

  let cachedCount = 0;
  let missingCount = 0;
  const skipped = [];
  const translatedNodes = [];

  for (const node of nodes) {
    const classification = classifyNode(node);

    if (classification.priority === "ignore") {
      skipped.push(node);
      continue;
    }

    const sourceText = node.text || "";
    if (!sourceText.trim()) {
      skipped.push(node);
      continue;
    }

    let translatedText = null;

    if (hasTranslation(sourceText, targetLanguage)) {
      translatedText = getTranslation(sourceText, targetLanguage);
      cachedCount++;
    } else {
      missingCount++;
      translatedText = sourceText; // leave untranslated
    }

    translatedNodes.push({
      ...node,
      translatedText
    });
  }

  const rebuilt = rebuildHTML(html, translatedNodes);

  return {
    html: rebuilt,
    translatedNodes,
    cachedCount,
    skippedCount: skipped.length,
    missingCount
  };
}

/**
 * Estimates how many nodes would need translation (bypassing TM and API).
 * @param {string} html
 * @param {string} [slug]
 * @returns {object} { totalNodes, translatableNodes, ignoredNodes, estimatedCost }
 */
export function estimateTranslation({ html, slug = "" }) {
  const ast = parseArticleHTML(html, slug);

  let translatable = 0;
  let ignored = 0;

  for (const node of ast.nodes) {
    const c = classifyNode(node);
    if (c.priority === "ignore") {
      ignored++;
    } else {
      translatable++;
    }
  }

  // Rough cost estimate: $0.00002 per character for MT, $0.08/word for human
  const totalChars = ast.nodes
    .filter((n) => classifyNode(n).priority !== "ignore")
    .reduce((sum, n) => sum + (n.text || "").length, 0);

  return {
    totalNodes: ast.nodes.length,
    translatableNodes: translatable,
    ignoredNodes: ignored,
    totalChars,
    estimatedMachineCostUSD: Math.round(totalChars * 0.00002 * 100) / 100
  };
}
