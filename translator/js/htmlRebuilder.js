/**
 * HTML Rebuilder — Insight Chronicles
 * Rebuilds original HTML with translated text injected.
 * Preserves all structure, attributes, scripts, styles.
 * @module htmlRebuilder
 */

const ATTR_NODES = new Set(["meta-description", "og-title", "og-description"]);
const ALT_NODES = new Set(["alt"]);
const ARIA_NODES = new Set(["aria-label"]);
const INLINE_TAGS = new Set([
  "strong", "em", "span", "a", "b", "i", "u", "small", "mark",
  "sub", "sup", "abbr", "cite", "dfn", "kbd", "samp", "var",
  "time", "q", "del", "ins", "s", "code"
]);

// ── Public API ────────────────────────────────────────────────────

/**
 * @param {string} originalHTML — original article HTML
 * @param {object[]} translatedNodes — AST nodes with added `translatedText`
 * @returns {string} rebuilt HTML
 */
export function rebuildHTML(originalHTML, translatedNodes) {
  const doc = new DOMParser().parseFromString(originalHTML, "text/html");

  for (const node of translatedNodes) {
    if (node.translatedText === undefined || node.translatedText === null) continue;
    const el = resolveXPath(doc, node.xpath);
    if (!el) continue;
    applyTranslation(el, node);
  }

  const result = new XMLSerializer().serializeToString(doc);
  const doctype = originalHTML.match(/<!doctype[^>]*>/i);
  return doctype ? doctype[0] + "\n" + result : result;
}

// ── XPath resolution ──────────────────────────────────────────────

function resolveXPath(doc, xpath) {
  if (!xpath) return null;
  try {
    const r = doc.evaluate(xpath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    return r.singleNodeValue;
  } catch (_) {
    return resolveManual(doc, xpath);
  }
}

function resolveManual(doc, xpath) {
  const parts = xpath.replace(/^\//, "").split("/");
  let cur = doc;
  for (const part of parts) {
    if (!cur) return null;
    const m = part.match(/^([a-z]+)(?:\[(\d+)\])?$/i);
    if (!m) return null;
    const tag = m[1].toLowerCase();
    const idx = m[2] ? parseInt(m[2], 10) : 1;
    if (tag === "html" && cur.nodeType === Node.DOCUMENT_NODE) {
      cur = cur.documentElement;
      continue;
    }
    const kids = cur.children || cur.childNodes || [];
    let count = 0, found = null;
    for (let i = 0; i < kids.length; i++) {
      if (kids[i].nodeType === Node.ELEMENT_NODE && kids[i].tagName.toLowerCase() === tag) {
        count++;
        if (count === idx) { found = kids[i]; break; }
      }
    }
    cur = found;
  }
  return cur;
}

// ── Translation applicator ────────────────────────────────────────

function applyTranslation(el, node) {
  const type = node.type || "";
  const t = node.translatedText || "";

  if (ATTR_NODES.has(type)) {
    el.setAttribute("content", t);
    return;
  }
  if (type === "title") { el.textContent = t; return; }
  if (ALT_NODES.has(type)) { el.setAttribute("alt", t); return; }
  if (ARIA_NODES.has(type)) { el.setAttribute("aria-label", t); return; }

  replaceTextNodes(el, t);
}

// ── Text node replacement ─────────────────────────────────────────

function replaceTextNodes(el, translated) {
  const tns = collectTextNodes(el);

  if (tns.length === 1) {
    tns[0].node.textContent = translated;
    return;
  }
  if (tns.length === 0) {
    if (el.textContent.trim().length > 0 && !hasChildElements(el)) {
      el.textContent = translated;
    }
    return;
  }
  distributeText(tns, translated);
}

function collectTextNodes(el) {
  const nodes = [];
  (function walk(e) {
    for (let c = e.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === Node.TEXT_NODE) {
        nodes.push({ node: c, len: c.textContent.length });
      } else if (c.nodeType === Node.ELEMENT_NODE && INLINE_TAGS.has(c.tagName.toLowerCase())) {
        walk(c);
      }
    }
  })(el);
  return nodes;
}

function hasChildElements(el) {
  for (let c = el.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === Node.ELEMENT_NODE) return true;
  }
  return false;
}

/**
 * Distributes translated text across text nodes proportionally
 * to original character lengths. Snaps splits to word boundaries.
 */
function distributeText(tns, translated) {
  const totalLen = tns.reduce((s, tn) => s + tn.len, 0);
  if (totalLen === 0) return;

  let cursor = 0;
  const tLen = translated.length;

  for (let i = 0; i < tns.length; i++) {
    if (i === tns.length - 1) {
      tns[i].node.textContent = translated.slice(cursor);
      return;
    }
    const proportion = tns[i].len / totalLen;
    let split = cursor + Math.round(proportion * tLen);
    split = snapWord(translated, split);
    split = Math.max(cursor, Math.min(tLen, split));
    tns[i].node.textContent = translated.slice(cursor, split);
    cursor = split;
  }
}

function snapWord(text, point, range = 3) {
  let best = point, bestDist = Infinity;
  for (let i = Math.max(0, point - range); i <= Math.min(text.length, point + range); i++) {
    if (text[i] === " " || i === text.length) {
      const d = Math.abs(i - point);
      if (d < bestDist) { best = i; bestDist = d; }
    }
  }
  return bestDist <= range ? best : point;
}
