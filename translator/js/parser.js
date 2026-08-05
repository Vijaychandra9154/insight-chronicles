/**
 * HTML DOM Translation AST Engine — Insight Chronicles
 * Module 2: Reads an article HTML document and produces a Translation AST.
 *
 * This module NEVER modifies HTML. It ONLY extracts translatable nodes.
 *
 * @module parser
 */

// ── Constants ─────────────────────────────────────────────────────

/** Tags whose text is merged into the parent — never split into own nodes. */
const INLINE_TAGS = new Set([
  "strong", "em", "span", "a", "b", "i", "u", "small", "mark",
  "sub", "sup", "abbr", "cite", "dfn", "kbd", "samp", "var",
  "time", "q", "wbr", "br", "del", "ins", "s", "code"
]);

/** Tags whose subtrees are skipped entirely. */
const IGNORE_TAGS = new Set([
  "script", "style", "noscript", "svg", "canvas",
  "iframe", "object", "embed", "pre"
]);

/**
 * Tags that represent extractable text blocks.
 * Text inside these becomes one node; inline children are merged.
 */
const BLOCK_TEXT_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "li", "blockquote", "figcaption", "caption",
  "th", "td", "dt", "dd", "legend", "summary",
  "button", "label", "option"
]);

// ── XPath builder ─────────────────────────────────────────────────

/**
 * Builds a simple absolute XPath for an element.
 * e.g. /html/body/main[1]/div[1]/section[1]/p[4]
 */
function buildXPath(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return "";

  const parts = [];
  let current = el;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const tag = current.tagName.toLowerCase();
    let index = 1;

    // Count preceding siblings with the same tag name
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName.toLowerCase() === tag) index++;
      sibling = sibling.previousElementSibling;
    }

    // Only add index if there are multiple siblings of the same tag
    // Check: count total siblings of same tag under this parent
    let totalSame = 0;
    if (current.parentElement) {
      const children = current.parentElement.children;
      for (let i = 0; i < children.length; i++) {
        if (children[i].tagName.toLowerCase() === tag) totalSame++;
      }
    }

    parts.unshift(totalSame > 1 ? `${tag}[${index}]` : tag);
    current = current.parentElement;
  }

  return "/" + parts.join("/");
}

// ── Context detection ─────────────────────────────────────────────

/**
 * Returns the semantic context for a DOM element.
 * Walks up the ancestor chain to find the nearest semantic container.
 */
function getContext(el) {
  let current = el;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const tag = current.tagName.toLowerCase();
    const cls = (current.getAttribute("class") || "").toLowerCase();

    // Article body
    if (cls.includes("article-body")) return "article-body";
    // Article heading area
    if (cls.includes("article-heading")) return "article-heading";
    // Breadcrumbs
    if (cls.includes("breadcrumb")) return "breadcrumb";
    // Table of contents
    if (cls.includes("toc") || cls.includes("table-of-contents")) return "toc";
    // Share / affiliate box
    if (cls.includes("affiliate-box")) return "affiliate-box";
    // Article navigation (prev/next)
    if (cls.includes("article-nav")) return "article-nav";
    // Top strip
    if (cls.includes("topstrip")) return "topstrip";

    // Semantic HTML5 elements
    if (tag === "footer") return "footer";
    if (tag === "nav") return "navigation";
    if (tag === "header") return "header";
    if (tag === "main") { current = current.parentElement; continue; }
    if (tag === "article") return "article-body";

    current = current.parentElement;
  }

  return "body";
}

// ── Text extraction ───────────────────────────────────────────────

/**
 * Extracts text from an element, merging inline children
 * but skipping text that belongs to nested block-extractable elements.
 *
 * <p>This is <strong>important</strong> text.</p>
 *   → "This is important text."
 *
 * <li>Fruits <ul><li>Apple</li></ul></li>
 *   → "Fruits"  (inner <li>Apple</li> is extracted separately)
 */
function extractInlineText(el) {
  const parts = [];
  _walkTextNodes(el, parts);
  return parts.join("").replace(/\s+/g, " ").trim();
}

function _walkTextNodes(el, parts) {
  for (let child = el.firstChild; child; child = child.nextSibling) {
    switch (child.nodeType) {
      case Node.TEXT_NODE:
        parts.push(child.textContent);
        break;

      case Node.ELEMENT_NODE: {
        const tag = child.tagName.toLowerCase();

        // Stop at block-extractable boundaries — those get their own nodes
        if (BLOCK_TEXT_TAGS.has(tag)) break;

        // Skip ignored subtrees
        if (IGNORE_TAGS.has(tag)) break;

        // Recurse into inline elements and other structural wrappers
        _walkTextNodes(child, parts);
        break;
      }

      default:
        break;
    }
  }
}

// ── Attribute extraction ──────────────────────────────────────────

/**
 * Returns an object with the translatable attributes of an element.
 * Only includes alt and aria-label (ignores id, class, href, src, data-*).
 */
function getAttributes(el) {
  const attrs = {};
  const alt = el.getAttribute("alt");
  const ariaLabel = el.getAttribute("aria-label");

  if (alt !== null && alt !== undefined) attrs.alt = alt.trim();
  if (ariaLabel !== null && ariaLabel !== undefined) attrs["aria-label"] = ariaLabel.trim();

  return attrs;
}

// ── Node factory ──────────────────────────────────────────────────

let _nodeCounter = 0;

function resetCounter() {
  _nodeCounter = 0;
}

function makeNode(tag, type, text, xpath, context, attributes) {
  _nodeCounter++;
  const node = {
    id: `n${_nodeCounter}`,
    tag,
    type,
    xpath: xpath || "",
    text: text || "",
    context: context || "body"
  };
  const attrs = attributes || {};
  if (Object.keys(attrs).length > 0) {
    node.attributes = attrs;
  }
  return node;
}

// ── DOM walker ────────────────────────────────────────────────────

/**
 * Recursively walks the DOM tree and extracts translatable nodes.
 */
function walkDOM(root, nodes, contextOverride) {
  // Skip ignored subtrees entirely
  if (root.nodeType === Node.ELEMENT_NODE && IGNORE_TAGS.has(root.tagName.toLowerCase())) {
    return;
  }

  // Process child nodes
  for (let child = root.firstChild; child; child = child.nextSibling) {
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const tag = child.tagName.toLowerCase();
    const context = contextOverride || getContext(child);

    // ── Skip ignored elements ──
    if (IGNORE_TAGS.has(tag)) continue;

    // ── Skip JSON-LD script blocks ──
    if (tag === "script" && child.getAttribute("type") === "application/ld+json") continue;

    // ── Extract block text elements ──
    if (BLOCK_TEXT_TAGS.has(tag)) {
      const text = extractInlineText(child);
      if (text.length > 0) {
        const xpath = buildXPath(child);
        const attrs = getAttributes(child);
        nodes.push(makeNode(tag, tag, text, xpath, context, attrs));
      }
      // Continue walking children for nested block-extractable elements
      // (e.g. <li> contains nested <ul><li>...</li></ul>)
      walkDOM(child, nodes, context);
      continue;
    }

    // ── Extract alt text from images and inputs ──
    if ((tag === "img" || tag === "input" || tag === "area") && child.hasAttribute("alt")) {
      const altText = (child.getAttribute("alt") || "").trim();
      if (altText.length > 0) {
        nodes.push(makeNode(tag, "alt", altText, buildXPath(child), context, { alt: altText }));
      }
      // Don't walk into img/input/area children (they have none)
      continue;
    }

    // ── Extract aria-label from any element ──
    if (child.hasAttribute("aria-label")) {
      const label = (child.getAttribute("aria-label") || "").trim();
      if (label.length > 0) {
        nodes.push(
          makeNode(tag, "aria-label", label, buildXPath(child), context, { "aria-label": label })
        );
      }
      // Walk children even after extracting aria-label
      walkDOM(child, nodes, context);
      continue;
    }

    // ── Walk children for all other elements ──
    walkDOM(child, nodes, context);
  }
}

// ── Context text extraction ────────────────────────────────────────

/**
 * Extracts text from non-block-tag elements within header/footer/nav contexts.
 * Captures text in <a>, <span>, <div> that would otherwise be missed
 * (e.g. nav links, copyright line, tagline).
 *
 * Only extracts from elements that have direct text nodes and are NOT
 * already covered by a block-text-tag ancestor extraction.
 */
function extractContextTextNodes(container, contextName, nodes) {
  if (!container) return;

  // Also check the container element itself (may have direct text, e.g. topstrip div)
  _extractElementIfTextual(container, contextName, nodes, container);

  const allEls = container.querySelectorAll("*");
  for (const el of allEls) {
    _extractElementIfTextual(el, contextName, nodes, container);
  }
}

/**
 * Extracts text from a single element for context text capture,
 * if it qualifies as a text-containing leaf element.
 */
function _extractElementIfTextual(el, contextName, nodes, container) {
  const tag = el.tagName.toLowerCase();

  // Skip ignored elements
  if (IGNORE_TAGS.has(tag)) return;

  // These are already extracted by the main walk — don't double-extract
  if (BLOCK_TEXT_TAGS.has(tag)) return;

  // Skip elements whose text is already captured by a block-text ancestor
  let ancestor = el.parentElement;
  let insideBlockTag = false;
  while (ancestor && ancestor !== container) {
    if (BLOCK_TEXT_TAGS.has(ancestor.tagName.toLowerCase())) {
      insideBlockTag = true;
      break;
    }
    ancestor = ancestor.parentElement;
  }
  if (insideBlockTag) return;

  // Only extract from elements that have direct (non-whitespace) text nodes
  let hasDirectText = false;
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && child.textContent.trim().length > 0) {
      hasDirectText = true;
      break;
    }
  }
  if (!hasDirectText) return;

  const text = extractInlineText(el);
  if (text.length === 0) return;

  const xpath = buildXPath(el);
  const attrs = getAttributes(el);
  nodes.push(makeNode(tag, tag, text, xpath, contextName, attrs));
}

// ── Head extraction ───────────────────────────────────────────────

/**
 * Extracts translatable nodes from the <head> element:
 * <title>, meta[name=description], meta[property="og:title"],
 * meta[property="og:description"]
 */
function extractHeadNodes(doc) {
  const nodes = [];

  // <title>
  const titleEl = doc.querySelector("title");
  if (titleEl) {
    const text = titleEl.textContent.trim();
    if (text) {
      nodes.push(makeNode("title", "title", text, "/html/head/title", "head"));
    }
  }

  // <meta name="description">
  const metaDesc = doc.querySelector('meta[name="description"]');
  if (metaDesc) {
    const content = (metaDesc.getAttribute("content") || "").trim();
    if (content) {
      nodes.push(
        makeNode("meta", "meta-description", content, buildXPath(metaDesc), "head", {
          name: "description"
        })
      );
    }
  }

  // <meta property="og:title">
  const ogTitle = doc.querySelector('meta[property="og:title"]');
  if (ogTitle) {
    const content = (ogTitle.getAttribute("content") || "").trim();
    if (content) {
      nodes.push(
        makeNode("meta", "og-title", content, buildXPath(ogTitle), "head", {
          property: "og:title"
        })
      );
    }
  }

  // <meta property="og:description">
  const ogDesc = doc.querySelector('meta[property="og:description"]');
  if (ogDesc) {
    const content = (ogDesc.getAttribute("content") || "").trim();
    if (content) {
      nodes.push(
        makeNode("meta", "og-description", content, buildXPath(ogDesc), "head", {
          property: "og:description"
        })
      );
    }
  }

  return nodes;
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Parses an article HTML string and returns a Translation AST.
 *
 * @param {string} html  - Raw HTML of the article page
 * @param {string} slug  - Article slug (e.g. "article-upi-digital-payments")
 * @returns {object} Translation AST with slug and nodes array
 *
 * @example
 * const ast = parseArticleHTML(htmlString, "article-upi-digital-payments");
 * // { slug: "article-upi-digital-payments", nodes: [{ id: "n1", ... }, ...] }
 */
export function parseArticleHTML(html, slug) {
  resetCounter();

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const nodes = [];

  // 1. Extract head nodes (title, meta tags)
  const headNodes = extractHeadNodes(doc);
  nodes.push(...headNodes);

  // 2. Walk the body to extract all translatable text nodes
  const body = doc.body;
  if (body) {
    walkDOM(body, nodes, null);

    // 3. Extract context text from header/footer/nav
    //    (text in <a>, <span>, <div> that isn't inside block text tags)
    const header = body.querySelector("header");
    if (header) extractContextTextNodes(header, "header", nodes);

    const footer = body.querySelector("footer");
    if (footer) extractContextTextNodes(footer, "footer", nodes);

    const navElements = body.querySelectorAll("nav");
    for (const nav of navElements) {
      extractContextTextNodes(nav, "navigation", nodes);
    }

    // Also capture top-strip text
    const topstrip = body.querySelector(".ic-topstrip, .topstrip");
    if (topstrip) extractContextTextNodes(topstrip, "topstrip", nodes);
  }

  return {
    slug: slug || "",
    nodeCount: nodes.length,
    nodes
  };
}

/**
 * Parses an article fetched by URL and returns the AST.
 * Convenience wrapper that fetches, then parses.
 *
 * @param {string} url  - Relative or absolute URL to the article HTML
 * @param {string} slug - Article slug
 * @returns {Promise<object>} Translation AST
 */
export async function parseArticleFromURL(url, slug) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch article: HTTP ${response.status}`);
  }
  const html = await response.text();
  return parseArticleHTML(html, slug);
}

/**
 * Parses multiple articles and returns a combined AST collection.
 *
 * @param {Array<{url: string, slug: string}>} articles
 * @returns {Promise<object[]>} Array of ASTs
 */
export async function parseArticles(articles) {
  const results = [];
  for (const { url, slug } of articles) {
    try {
      const ast = await parseArticleFromURL(url, slug);
      results.push({ slug, status: "ok", ast });
    } catch (err) {
      results.push({ slug, status: "error", error: err.message });
    }
  }
  return results;
}

// ── Utilities ─────────────────────────────────────────────────────

/**
 * Returns statistics about a parsed AST.
 */
export function getASTStats(ast) {
  const typeCounts = {};
  const contextCounts = {};
  let totalChars = 0;

  for (const node of ast.nodes) {
    typeCounts[node.type] = (typeCounts[node.type] || 0) + 1;
    contextCounts[node.context] = (contextCounts[node.context] || 0) + 1;
    totalChars += node.text.length;
  }

  return {
    slug: ast.slug,
    totalNodes: ast.nodes.length,
    totalChars,
    types: typeCounts,
    contexts: contextCounts
  };
}

/**
 * Finds nodes by type or context.
 */
export function findNodes(ast, filters = {}) {
  return ast.nodes.filter((node) => {
    if (filters.type && node.type !== filters.type) return false;
    if (filters.tag && node.tag !== filters.tag) return false;
    if (filters.context && node.context !== filters.context) return false;
    return true;
  });
}

export { INLINE_TAGS, IGNORE_TAGS, BLOCK_TEXT_TAGS, buildXPath, getContext, extractInlineText };
