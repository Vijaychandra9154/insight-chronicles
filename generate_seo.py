import json
import os
import re
from datetime import datetime
from xml.sax.saxutils import escape

SITE_URL = "https://insight-chronicles.com"
SITE_NAME = "Insight Chronicles"
SITE_DESC = "Independent long-form analysis on history, geopolitics, and technology."

DRAFTS_DIR = "drafts"
TEMPLATE_FILE = "article_template.html"
INDEX_FILE = "index.html"

AUTO_START = "<!-- AUTO-LATEST-ARTICLES:START -->"
AUTO_END = "<!-- AUTO-LATEST-ARTICLES:END -->"

CATEGORIES = {
    "History": {
        "file": "history.html",
        "title": "History & Civilisations",
        "desc": "Long-form essays exploring empires, trade networks, institutions and the foundations of power.",
    },
    "Geopolitics": {
        "file": "geopolitics.html",
        "title": "Geopolitics & Strategy",
        "desc": "Analysis of power, alliances, industrial policy, and the evolving world order.",
    },
    "Technology": {
        "file": "technology.html",
        "title": "Technology & AI",
        "desc": "Deep dives into technology, AI, manufacturing capability, and the systems behind modern power.",
    },
    "Governance": {
        "file": "governance.html",
        "title": "Governance & Institutions",
        "desc": "Articles exploring reforms, public infrastructure, institutional design, and systems that scale.",
    },
}


def safe_slug(s):
    if not s:
        return ""
    return s.strip().replace("\\", "/").split("/")[-1]


def ensure_article_defaults(a):
    """
    Guarantee required keys exist so sitemap/rss never crash.
    """
    slug = safe_slug(a.get("slug", ""))
    if not slug:
        return None

    a["slug"] = slug
    a["title"] = a.get("title", "").strip() or "Untitled"
    a["desc"] = a.get("desc", "").strip() or "New article on Insight Chronicles."
    a["date"] = a.get("date", "").strip() or datetime.utcnow().strftime("%Y-%m-%d")
    a["thumb"] = a.get("thumb", "images/upi.webp")
    a["thumb_og"] = a.get("thumb_og", a["thumb"])

    # ✅ IMPORTANT FIX: auto-generate URL if missing
    a["url"] = a.get("url") or f"{SITE_URL}/{slug}"

    # tags can be list or missing
    if not isinstance(a.get("tags", []), list):
        a["tags"] = []
    if "tags" not in a:
        a["tags"] = []

    # support full-text search
    if "content_html" not in a:
        a["content_html"] = ""

    return a


def load_articles_json():
    if not os.path.exists("articles.json"):
        return []

    with open("articles.json", "r", encoding="utf-8") as f:
        raw = json.load(f)

    cleaned = []
    for a in raw:
        fixed = ensure_article_defaults(a)
        if fixed:
            cleaned.append(fixed)

    return cleaned


def save_articles_json(articles):
    with open("articles.json", "w", encoding="utf-8") as f:
        json.dump(articles, f, indent=2, ensure_ascii=False)


def load_template():
    with open(TEMPLATE_FILE, "r", encoding="utf-8") as f:
        return f.read()


def read_drafts():
    drafts = []
    if not os.path.exists(DRAFTS_DIR):
        return drafts

    for filename in os.listdir(DRAFTS_DIR):
        if filename.endswith(".json"):
            path = os.path.join(DRAFTS_DIR, filename)
            with open(path, "r", encoding="utf-8") as f:
                d = json.load(f)
                drafts.append(d)

    return drafts


def build_article_html(template, draft):
    # ✅ IMPORTANT FIX: accept both content and content_html
    content = draft.get("content", None)
    if content is None:
        content = draft.get("content_html", "")

    replacements = {
        "{{TITLE}}": draft.get("title", "Untitled"),
        "{{DESCRIPTION}}": draft.get("desc", "New article on Insight Chronicles."),
        "{{SLUG}}": safe_slug(draft.get("slug", "")),
        "{{DATE}}": draft.get("date", datetime.utcnow().strftime("%Y-%m-%d")),
        "{{THUMB}}": draft.get("thumb", "images/upi.webp"),
        "{{THUMB_OG}}": draft.get("thumb_og", draft.get("thumb", "images/upi.webp")),
        "{{TAGLINE}}": ", ".join(draft.get("tags", [])) or "Insight Chronicles",
        "{{CONTENT}}": content,
    }

    html = template
    for k, v in replacements.items():
        html = html.replace(k, str(v))
    return html


def publish_drafts(articles):
    template = load_template()
    drafts = read_drafts()

    existing_slugs = {safe_slug(a.get("slug")) for a in articles}

    published = 0
    for d in drafts:
        slug = safe_slug(d.get("slug", ""))
        if not slug:
            continue

        if slug in existing_slugs:
            continue

        # ✅ Create HTML article file
        html = build_article_html(template, d)
        with open(slug, "w", encoding="utf-8") as f:
            f.write(html)

        # ✅ Add to articles.json
        new_article = {
            "title": d.get("title", "Untitled"),
            "slug": slug,
            "url": d.get("url") or f"{SITE_URL}/{slug}",
            "desc": d.get("desc", "New article on Insight Chronicles."),
            "date": d.get("date", datetime.utcnow().strftime("%Y-%m-%d")),
            "thumb": d.get("thumb", "images/upi.webp"),
            "thumb_og": d.get("thumb_og", d.get("thumb", "images/upi.webp")),
            "tags": d.get("tags", []),
            "content_html": d.get("content_html") or d.get("content") or "",
        }

        articles.append(ensure_article_defaults(new_article))
        published += 1

    return published


def make_sitemap(articles):
    urls = [
        f"""  <url><loc>{SITE_URL}/</loc><priority>1.0</priority></url>""",
        f"""  <url><loc>{SITE_URL}/articles.html</loc><priority>0.9</priority></url>""",
        f"""  <url><loc>{SITE_URL}/search.html</loc><priority>0.7</priority></url>""",
    ]

    for cat in CATEGORIES.values():
        urls.append(f"""  <url><loc>{SITE_URL}/{cat["file"]}</loc><priority>0.7</priority></url>""")

    for a in sorted(articles, key=lambda x: x.get("date", ""), reverse=True):
        url = a.get("url") or f"{SITE_URL}/{a.get('slug','')}"
        urls.append(f"""  <url><loc>{escape(url)}</loc><priority>0.8</priority></url>""")

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{chr(10).join(urls)}
</urlset>
"""


def make_rss(articles):
    now = datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S +0000")
    items = []

    for a in sorted(articles, key=lambda x: x.get("date", ""), reverse=True):
        title = escape(a.get("title", "Untitled"))
        link = escape(a.get("url", f"{SITE_URL}/{a.get('slug','')}"))
        desc = escape(a.get("desc", "New article on Insight Chronicles."))
        pub_date = a.get("date", "")

        try:
            d = datetime.strptime(pub_date, "%Y-%m-%d")
            pub_date_rss = d.strftime("%a, %d %b %Y 00:00:00 +0000")
        except:
            pub_date_rss = now

        items.append(f"""
    <item>
      <title>{title}</title>
      <link>{link}</link>
      <guid>{link}</guid>
      <description>{desc}</description>
      <pubDate>{pub_date_rss}</pubDate>
    </item>
""")

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>{SITE_NAME}</title>
    <link>{SITE_URL}/</link>
    <description>{SITE_DESC}</description>
    <language>en</language>
    <lastBuildDate>{now}</lastBuildDate>
{''.join(items)}
  </channel>
</rss>
"""


def make_robots():
    return f"""User-agent: *
Allow: /

Sitemap: {SITE_URL}/sitemap.xml
"""


def strip_html(html):
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def make_search_index(articles):
    data = []
    for a in sorted(articles, key=lambda x: x.get("date", ""), reverse=True):
        body_html = a.get("content_html", "")
        body_text = strip_html(body_html) if body_html else ""

        data.append(
            {
                "title": a.get("title", ""),
                "slug": a.get("slug", ""),
                "url": a.get("url", ""),
                "desc": a.get("desc", ""),
                "date": a.get("date", ""),
                "thumb": a.get("thumb", ""),
                "tags": a.get("tags", []),
                "body": body_text,
            }
        )
    return json.dumps(data, indent=2, ensure_ascii=False)


def make_search_page():
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Search – {SITE_NAME}</title>
  <meta name="description" content="Search articles on Insight Chronicles." />
  <link rel="stylesheet" href="styles.css" />
</head>
<body class="ic-body">

<div class="ic-topstrip">Search • {SITE_NAME}</div>

<header class="ic-header">
  <div class="ic-container ic-header-inner">
    <a href="index.html" class="ic-logo">
      <span class="ic-logo-mark">IC</span>
      <span>
        <span class="ic-logo-title">{SITE_NAME}</span>
        <span class="ic-logo-sub">Long-form global analysis</span>
      </span>
    </a>

    <nav class="ic-nav">
      <a href="index.html" class="ic-nav-link">Home</a>
      <a href="articles.html" class="ic-nav-link">Articles</a>
      <a href="search.html" class="ic-nav-link ic-nav-link-active">Search</a>
    </nav>
  </div>
</header>

<main class="ic-main">
  <div class="ic-container">
    <section class="ic-sidebar-block">
      <h1 style="margin-top:0;">Search Articles</h1>
      <p style="color:#cbd5f5;">Type keywords to search across all published posts.</p>

      <input id="q" type="text" placeholder="Search (UPI, ONDC, labs, geopolitics...)"
        style="width:100%;padding:14px;border-radius:14px;border:1px solid rgba(148,163,184,0.25);background:#020617;color:#e5e7eb;" />

      <p id="count" style="margin-top:10px;color:#9ca3af;">Loading…</p>
    </section>

    <section class="ic-sidebar-block">
      <h2 style="margin-top:0;">Results</h2>
      <div id="results" style="display:grid;gap:14px;"></div>
    </section>
  </div>
</main>

<footer class="ic-footer">
  <div class="ic-container ic-footer-bottom">© 2026 {SITE_NAME}. All rights reserved.</div>
</footer>

<script>
  let data = [];

  async function loadIndex() {{
    const res = await fetch("search-index.json");
    data = await res.json();
    document.getElementById("count").textContent = data.length + " articles indexed";
    render("");
  }}

  function render(q) {{
    const results = document.getElementById("results");
    results.innerHTML = "";

    const query = q.trim().toLowerCase();

    const filtered = data.filter(a => {{
      const hay = (
        a.title + " " +
        a.desc + " " +
        (a.tags||[]).join(" ") + " " +
        a.date + " " +
        (a.body || "")
      ).toLowerCase();
      return query === "" || hay.includes(query);
    }});

    document.getElementById("count").textContent = filtered.length + " result(s)";

    filtered.forEach(a => {{
      const div = document.createElement("div");
      div.className = "ic-article-card";

      div.innerHTML = `
        <a href="${{a.slug}}" class="ic-article-thumb-link">
          <img src="${{a.thumb}}" alt="${{a.title}}" class="ic-article-thumb" />
        </a>
        <div>
          <div class="ic-article-tags">
            ${(a.tags||[]).slice(0,3).map(t => `<span class="ic-tag">${t}</span>`).join("")}
          </div>
          <h3 class="ic-article-title"><a href="${{a.slug}}">${{a.title}}</a></h3>
          <p class="ic-article-meta">${{a.date}}</p>
          <p class="ic-article-excerpt">${{a.desc}}</p>
          <a href="${{a.slug}}" class="ic-article-read">Read article →</a>
        </div>
      `;
      results.appendChild(div);
    }});
  }}

  document.getElementById("q").addEventListener("input", e => render(e.target.value));
  loadIndex();
</script>

</body>
</html>
"""


def make_site_json(articles):
    return json.dumps(
        {
            "site": {
                "name": SITE_NAME,
                "url": SITE_URL,
                "description": SITE_DESC,
                "language": "en",
            },
            "articles": articles,
        },
        indent=2,
        ensure_ascii=False,
    )


def make_404():
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>404 – Page Not Found | {SITE_NAME}</title>
  <meta name="robots" content="noindex"/>
  <link rel="stylesheet" href="styles.css"/>
</head>
<body class="ic-body">
  <div class="ic-topstrip">404 • Not Found</div>
  <main class="ic-main">
    <div class="ic-container" style="padding:50px 0;">
      <h1 style="font-size:42px;margin-bottom:10px;">Page not found</h1>
      <p style="max-width:650px;opacity:0.85;line-height:1.7;">
        The page you opened doesn’t exist. You can go back home or browse all articles.
      </p>
      <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;">
        <a class="ic-btn-primary" href="index.html">Go to Homepage</a>
        <a class="ic-btn-secondary" href="articles.html">Browse Articles</a>
      </div>
    </div>
  </main>
  <footer class="ic-footer">
    <div class="ic-container ic-footer-bottom">© 2026 {SITE_NAME}. All rights reserved.</div>
  </footer>
</body>
</html>
"""


def main():
    articles = load_articles_json()

    publish_drafts(articles)
    articles = [ensure_article_defaults(a) for a in articles if a]
    save_articles_json(articles)

    # SEO files
    with open("sitemap.xml", "w", encoding="utf-8") as f:
        f.write(make_sitemap(articles))
    with open("rss.xml", "w", encoding="utf-8") as f:
        f.write(make_rss(articles))
    with open("robots.txt", "w", encoding="utf-8") as f:
        f.write(make_robots())

    # Search system
    with open("search-index.json", "w", encoding="utf-8") as f:
        f.write(make_search_index(articles))
    with open("search.html", "w", encoding="utf-8") as f:
        f.write(make_search_page())

    # Support pages
    with open("404.html", "w", encoding="utf-8") as f:
        f.write(make_404())
    with open("site.json", "w", encoding="utf-8") as f:
        f.write(make_site_json(articles))

    print("✅ Generated everything successfully")


if __name__ == "__main__":
    main()









