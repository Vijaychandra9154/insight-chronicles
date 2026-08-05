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
 * @param {object} options
 * @param {string} options.html            — raw article HTML
 * @param {string} options.targetLanguage   — language code (e.g. "hi", "te")
 * @param {function} options.translateFunction — async (text, lang) => translatedText
 * @param {string} [options.slug]           — article slug (optional)
 * @returns {Promise<object>} { html, translatedNodes, translatedCount, cachedCount, skippedCount }
 */
export async function translateDocument({ html, targetLanguage, translateFunction, slug = "" }) {
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

  // ── 4 + 5 + 6. TM lookup + translate missing + save ──
  let cachedCount = 0;
  let translatedCount = 0;
  const translatedNodes = [];

  for (const { node } of toTranslate) {
    const sourceText = node.text || "";

    if (!sourceText.trim()) {
      skipped.push(node);
      continue;
    }

    let translatedText = null;

    // 4. Check Translation Memory
    if (hasTranslation(sourceText, targetLanguage)) {
      translatedText = getTranslation(sourceText, targetLanguage);
      cachedCount++;
    } else {
      // 5. Call injected translate function
      try {
        translatedText = await translateFunction(sourceText, targetLanguage);
      } catch (err) {
        // Translation failed — keep original text
        console.warn(`Translation failed for node ${node.id}: ${err.message}`);
        translatedText = sourceText;
      }

      // 6. Save into Translation Memory
      if (translatedText && translatedText !== sourceText) {
        setTranslation(sourceText, targetLanguage, translatedText);
        translatedCount++;
      }
    }

    // 7. Attach translatedText to node
    translatedNodes.push({
      ...node,
      translatedText: translatedText || sourceText
    });
  }

  // ── 8. Rebuild HTML ──
  const rebuilt = rebuildHTML(html, translatedNodes);

  // ── 9. Return result ──
  return {
    html: rebuilt,
    translatedNodes,
    translatedCount,
    cachedCount,
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
