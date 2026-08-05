/**
 * Translation Validator — Insight Chronicles
 * Validates translated HTML without modifying it. Read-only.
 * @module validator
 */

// ── Public API ────────────────────────────────────────────────────

/**
 * Validates a translated HTML document against its original.
 *
 * @param {object} options
 * @param {string} options.originalHTML
 * @param {string} options.translatedHTML
 * @param {object[]} options.translatedNodes — AST nodes with translatedText attached
 * @param {string} options.targetLanguage
 * @returns {{ valid:boolean, score:number, warnings:string[], errors:string[] }}
 */
export function validateTranslation({ originalHTML, translatedHTML, translatedNodes, targetLanguage }) {
  const warnings = [];
  const errors = [];
  let score = 100;

  const origDoc = parseHTML(originalHTML, "original", errors);
  const tranDoc = parseHTML(translatedHTML, "translated", errors);

  // If either document failed to parse, we cannot continue with structural checks
  if (!origDoc || !tranDoc) {
    return finish(false, Math.max(0, score), warnings, errors);
  }

  // ── Critical checks ──
  checkCritical(origDoc, tranDoc, originalHTML, errors, warnings);

  // ── Structural checks ──
  checkStructure(origDoc, tranDoc, warnings);

  // ── Translation completeness ──
  checkCompleteness(translatedNodes, targetLanguage, warnings);

  // ── Count checks ──
  checkCounts(origDoc, tranDoc, warnings);

  // ── Compute penalties ──
  for (const e of errors) score -= 20;
  for (const w of warnings) score -= /missing|untranslated|broken|lost|DOCTYPE/i.test(w) ? 5 : 1;

  return finish(errors.length === 0, Math.max(0, score), warnings, errors);
}

// ── Helpers ───────────────────────────────────────────────────────

function parseHTML(html, label, errors) {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    // DOMParser never throws; detect parse failure via <parsererror>
    const errEl = doc.querySelector("parsererror");
    if (errEl) {
      errors.push(`${label} HTML failed to parse: ${errEl.textContent.slice(0, 120)}`);
      return null;
    }
    return doc;
  } catch (e) {
    errors.push(`${label} HTML threw during parse: ${e.message}`);
    return null;
  }
}

function finish(valid, score, warnings, errors) {
  return { valid, score, warnings, errors };
}

// ── Critical checks ───────────────────────────────────────────────

function checkCritical(origDoc, tranDoc, originalHTML, errors, warnings) {
  // DOCTYPE preserved
  const origHasDoctype = /<!doctype[^>]*>/i.test(originalHTML);
  if (!origHasDoctype) {
    warnings.push("Original HTML has no DOCTYPE declaration.");
  }

  // Body exists
  if (!tranDoc.body || !tranDoc.body.children.length) {
    errors.push("Translated HTML has no <body> or body is empty.");
  }

  // Title exists
  const origTitle = origDoc.querySelector("title");
  const tranTitle = tranDoc.querySelector("title");
  if (!tranTitle || !tranTitle.textContent.trim()) {
    errors.push("Translated HTML is missing <title> or title is empty.");
  } else if (origTitle && tranTitle.textContent.trim() === origTitle.textContent.trim()) {
    warnings.push("<title> appears unchanged — may not have been translated.");
  }

  // lang attribute
  const htmlEl = tranDoc.documentElement;
  if (!htmlEl || !htmlEl.getAttribute("lang")) {
    errors.push("Translated <html> is missing the lang attribute.");
  }

  // meta description
  const tranMeta = tranDoc.querySelector('meta[name="description"]');
  if (!tranMeta || !(tranMeta.getAttribute("content") || "").trim()) {
    warnings.push("Translated HTML is missing <meta name=\"description\"> or content is empty.");
  }
}

// ── Structural checks ─────────────────────────────────────────────

function checkStructure(origDoc, tranDoc, warnings) {
  // Duplicate IDs
  const ids = new Set();
  const dupes = new Set();
  for (const el of tranDoc.querySelectorAll("[id]")) {
    const id = el.getAttribute("id");
    if (ids.has(id)) dupes.add(id);
    else ids.add(id);
  }
  if (dupes.size) {
    warnings.push(`Duplicate IDs found: ${[...dupes].slice(0, 5).join(", ")}${dupes.size > 5 ? "…" : ""}.`);
  }

  // Broken internal anchors (href="#..." with no matching id)
  const anchors = tranDoc.querySelectorAll('a[href^="#"]');
  for (const a of anchors) {
    const target = a.getAttribute("href").slice(1);
    if (target && !tranDoc.getElementById(target) && !tranDoc.querySelector(`[name="${target}"]`)) {
      warnings.push(`Broken internal anchor: href="#${target}" has no matching id/name.`);
    }
  }

  // Empty headings / paragraphs
  for (const sel of ["h1,h2,h3,h4,h5,h6", "p"]) {
    const empty = [...tranDoc.querySelectorAll(sel)].filter((el) => !el.textContent.trim());
    if (empty.length) warnings.push(`${empty.length} empty ${sel === "p" ? "paragraph(s)" : "heading(s)"}.`);
  }

  // Image alt — check images in translated doc
  const imgs = tranDoc.querySelectorAll("img");
  let missingAlt = 0;
  for (const img of imgs) {
    if (!img.hasAttribute("alt") || !img.getAttribute("alt").trim()) {
      missingAlt++;
    }
  }
  if (missingAlt) {
    warnings.push(`${missingAlt} image(s) missing alt text.`);
  }
}

// ── Translation completeness ─────────────────────────────────────

function checkCompleteness(translatedNodes, targetLanguage, warnings) {
  if (!translatedNodes || !translatedNodes.length) {
    warnings.push("No translatedNodes provided — cannot verify completeness.");
    return;
  }

  let untranslated = 0;
  const samples = [];

  for (const node of translatedNodes) {
    // Skip nodes that are not meant to be translated (ignored by classifier)
    if (node.type === "script" || node.type === "style") continue;
    if (node.priority === "ignore") continue;

    if (!node.translatedText || node.translatedText === node.text) {
      untranslated++;
      if (samples.length < 5) {
        samples.push(`n${node.id}: "${(node.text || "").slice(0, 50)}"`);
      }
    }
  }

  if (untranslated > 0) {
    const pct = Math.round((untranslated / translatedNodes.length) * 100);
    warnings.push(
      `${untranslated} untranslated node(s) (${pct}% of ${translatedNodes.length}). ` +
      `Examples: ${samples.join("; ")}${samples.length < untranslated ? "…" : ""}`
    );
  }
}

// ── Count checks ──────────────────────────────────────────────────

function checkCounts(origDoc, tranDoc, warnings) {
  compareCount(origDoc, tranDoc, "h2, h3, h4, h5, h6", warnings, "Heading");
  compareCount(origDoc, tranDoc, "p", warnings, "Paragraph");
  compareCount(origDoc, tranDoc, "table", warnings, "Table");
  compareCount(origDoc, tranDoc, "img", warnings, "Image");
  compareCount(origDoc, tranDoc, "a[href]", warnings, "Link");

  // Overall node count difference (all elements)
  const origAll = origDoc.querySelectorAll("*").length;
  const tranAll = tranDoc.querySelectorAll("*").length;
  if (origAll > 0) {
    const diff = Math.abs(tranAll - origAll);
    const pct = Math.round((diff / origAll) * 100);
    if (pct > 2) {
      warnings.push(
        `Total element count differs by ${pct}% (${origAll} → ${tranAll}). ` +
        `Maximum allowed: ±2%.`
      );
    }
  }
}

function compareCount(origDoc, tranDoc, selector, warnings, label) {
  const origCount = origDoc.querySelectorAll(selector).length;
  const tranCount = tranDoc.querySelectorAll(selector).length;
  if (origCount !== tranCount) {
    const diff = tranCount - origCount;
    const sign = diff > 0 ? "+" : "";
    warnings.push(`${label} count changed: ${origCount} → ${tranCount} (${sign}${diff}).`);
  }
}
