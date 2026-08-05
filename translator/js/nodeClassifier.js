/**
 * Node Classifier — Insight Chronicles
 * Classifies a parser.js AST node as translatable, partially translatable, or ignore.
 * @module nodeClassifier
 */

// ── Type → { type, priority } mapping for parser.js block-text nodes ──
const TYPE_MAP = {
  title:            ["title",            "high"  ],
  "meta-description":["meta-description","high"  ],
  "og-title":       ["og-title",        "high"  ],
  "og-description": ["og-description",  "high"  ],
  h1:               ["h1",              "high"  ],
  h2:               ["h2",              "medium"],
  h3:               ["h3",              "medium"],
  h4:               ["h4",              "medium"],
  h5:               ["h5",              "medium"],
  h6:               ["h6",              "medium"],
  p:                ["paragraph",       "high"  ],
  li:               ["list-item",       "high"  ],
  dt:               ["list-item",       "medium"],
  dd:               ["paragraph",       "medium"],
  blockquote:       ["blockquote",      "high"  ],
  figcaption:       ["figcaption",      "medium"],
  caption:          ["caption",         "medium"],
  th:               ["table-cell",      "medium"],
  td:               ["table-cell",      "medium"],
  button:           ["button",          "medium"],
  label:            ["label",           "medium"],
  alt:              ["alt",             "medium"],
  "aria-label":     ["aria-label",      "medium"],
  summary:          ["summary",         "medium"],
  details:          ["details",         "medium"],
  option:           ["option",          "medium"],
  legend:           ["legend",          "medium"],
};

// Context → type for nodes without a direct TYPE_MAP entry (context-extracted text)
const CONTEXT_MAP = {
  navigation: ["navigation", "medium"],
  footer:     ["footer",     "low"   ],
  header:     ["header",     "low"   ],
  topstrip:   ["header",     "low"   ],
};

// Blacklisted — should never reach the classifier but handled defensively
const IGNORE = new Set([
  "script", "style", "noscript", "svg", "canvas",
  "pre", "code", "iframe", "object", "embed"
]);

// Contexts / types that always need human review
const PARTIAL = new Set(["navigation", "button", "alt", "aria-label", "header", "footer"]);

// ── Public API ────────────────────────────────────────────────────

/**
 * @param {object} node — { id, tag, type, text, xpath, context, attributes? }
 * @returns {object} { translatable, partiallyTranslatable?, type, priority, context, reason? }
 */
export function classifyNode(node) {
  const type = node.type || "";
  const tag = node.tag || "";
  const ctx = node.context || "body";
  const text = (node.text || "").trim();

  // Defensive ignores
  if (IGNORE.has(tag) || IGNORE.has(type)) {
    return { translatable: false, type: type || tag, priority: "ignore", context: ctx, reason: "blacklisted" };
  }
  if (text.length < 1) {
    return { translatable: false, type: type || tag, priority: "ignore", context: ctx, reason: "empty" };
  }
  if (tag === "script" || type === "json-ld") {
    return { translatable: false, type: "json-ld", priority: "ignore", context: ctx, reason: "structured-data" };
  }

  // 1. Direct type mapping
  const mapped = TYPE_MAP[type] || TYPE_MAP[tag];
  if (mapped) {
    const [label, priority] = mapped;
    const partial = isPartial(label, ctx, text);
    return partial
      ? { translatable: false, partiallyTranslatable: true, type: label, priority, context: ctx }
      : { translatable: true, type: label, priority, context: ctx };
  }

  // 2. Context-based mapping (for a/span/div text from header/footer/nav extraction)
  const ctxMapped = CONTEXT_MAP[ctx];
  if (ctxMapped) {
    const [label, priority] = ctxMapped;
    return { translatable: false, partiallyTranslatable: true, type: label, priority, context: ctx };
  }

  // 3. Fallback — unrecognized
  return { translatable: false, partiallyTranslatable: true, type: type || tag || "unknown", priority: "low", context: ctx, reason: "unrecognized" };
}

// ── Helpers ───────────────────────────────────────────────────────

function isPartial(label, ctx, text) {
  if (PARTIAL.has(label) || PARTIAL.has(ctx)) return true;

  // Symbols that need review: ↑↓→←©®™€£¥$%±°
  if (/[↑↓→←©®™€£¥$%±°]/.test(text)) return true;

  // > 30% non-alpha characters suggests mixed content
  const nonAlpha = text.replace(/[a-zA-Z\sऀ-ॿఀ-౿]/g, "");
  if (nonAlpha.length / Math.max(text.length, 1) > 0.3) return true;

  // Short text with proper-noun pattern (1-2 capitalized words)
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 2 && /[A-Z][a-z]{2,}/.test(text)) return true;

  return false;
}
