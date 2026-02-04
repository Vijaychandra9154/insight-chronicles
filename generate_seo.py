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
    "History": {"file": "history.html", "title": "History & Civilisations", "desc": "Long-form essays exploring empires, trade networks, institutions and the foundations of power."},
    "Geopolitics": {"file": "geopolitics.html", "title": "Geopolitics & Strategy", "desc": "Analysis of power, alliances, industrial policy, and the evolving world order."},
    "Technology": {"file": "technology.html", "title": "Technology & AI", "desc": "Deep dives into technology, AI, manufacturing capability, and the systems behind modern power."},
    "Governance": {"file": "governance.html", "title": "Governance & Institutions", "desc": "Articles exploring reforms, public infrastructure, institutional design, and systems that scale."}
}

def load_articles_json():
    if not os.path.exists("articles.json"):
        return []
    with open("articles.json", "r", encoding="utf-8") as f:
        return json.load(f)

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
                drafts.append(json.load(f))
    return drafts

def build_article_html(template, draft):
    replacements = {
        "{{TITLE}}": draft["title"],
        "{{DESCRIPTION}}": draft["desc"],
        "{{SLUG}}": draft["slug"],
        "{{DATE}}": draft["date"],
        "{{THUMB}}": draft["thumb"],
        "{{THUMB_OG}}": draft.get("thumb_og", draft["thumb"]),
        "{{TAGLINE}}": ", ".join(draft.get("tags", [])) or "Insight Chronicles",
        "{{CONTENT}}": draft["content"]
    }

    html = template
    for k, v in replacements.items():
        html = html.replace(k, v)
    return html

def publish_drafts(articles):
    template = load_template()
    drafts = read_drafts()
    existing_slugs = {a.get("slug") for a in articles}

    published = 0
    for d in drafts:
        slug = d["slug"]
        if slug in existing_slugs:
            continue

        # Create HTML article file
        html = build_article_html(template, d)
        with open(slug, "w", encoding="utf-8") as f:
            f.write(html)

        # Add/update articles.json
        articles.append({
            "title": d["title"],
            "slug": d["slug"],
            "url": f"{SITE_URL}/{d['slug']}",
            "desc": d["desc"],
            "date": d["date"],
            "thumb": d["thumb"],
            "thumb_og": d.get("thumb_og", d["thumb"]),
            "tags": d.get("tags", []),

            # FULL TEXT SEARCH SUPPORT
            "content_html": d.get("content", "")
        })

        published += 1

    return published

def make_sitemap(articles):
    urls = [
        f"""  <url><loc>{SITE_URL}/</loc><priority>1.0</priority></url>""",
        f"""  <url><loc>{SITE_URL}/articles.html</loc><priority>0.9</priority></url>""",
        f"""  <url><loc>{SITE_URL}/search.html</loc><priority>0.7</priority></url>"""
    ]

    # category pages
    for cat in CATEGORIES.values():
        urls.append(f"""  <url><loc>{SITE_URL}/{cat["file"]}</loc><priority>0.7</priority></url>""")

    for a in sorted(articles, key=lambda x: x.get("date", ""), reverse=True):
        urls.append(f"""  <url><loc>{escape(a["url"])}</loc><priority>0.8</priority></url>""")

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{chr(10).join(urls)}
</urlset>
"""

def make_rss(articles):
    now = datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S +0000")
    items = []

    for a in sorted(articles, key=lambda x: x.get("date", ""), reverse=True):
        title = escape(a["title"])
        link = escape(a["url"])
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

def make_homepage_cards(articles, limit=6):
    sorted_articles = sorted(articles, key=lambda x: x.get("date", ""), reverse=True)[:limit]
    blocks = []

    for a in sorted_articles:
        title = escape(a["title"])
        slug = escape(a["slug"])
        desc = escape(a.get("desc", ""))
        date = escape(a.get("date", ""))
        thumb = escape(a.get("thumb", "images/upi.webp"))
        tags = a.get("tags", [])
        tag_spans = "".join([f'<span class="ic-tag">{escape(t)}</span>' for t in tags[:3]])

        blocks.append(f"""
        <article class="ic-article-card">
          <a href="{slug}" class="ic-article-thumb-link">
            <img src="{thumb}" alt="{title}" class="ic-article-thumb" />
          </a>
          <div>
            <div class="ic-article-tags">{tag_spans}</div>
            <h3 class="ic-article-title"><a href="{slug}">{title}</a></h3>
            <p class="ic-article-meta">{date}</p>
            <p class="ic-article-excerpt">{desc}</p>
            <a href="{slug}" class="ic-article-read">Read article →</a>
          </div>
        </article>
        """)

    return "\n".join(blocks)

def update_index_html(articles):
    if not os.path.exists(INDEX_FILE):
        return

    with open(INDEX_FILE, "r", encoding="utf-8") as f:
        html = f.read()

    if AUTO_START not in html or AUTO_END not in html:
        return

    new_cards = make_homepage_cards(articles, limit=6)
    pattern = re.compile(re.escape(AUTO_START) + r"(.*?)" + re.escape(AUTO_END), re.DOTALL)
    html2 = pattern.sub(AUTO_START + "\n" + new_cards + "\n" + AUTO_END, html)

    with open(INDEX_FILE, "w", encoding="utf-8") as f:
        f.write(html2)

def make_articles_page(articles):
    sorted_articles = sorted(articles, key=lambda x: x.get("date", ""), reverse=True)
    cards = []

    for a in sorted_articles:
        title = escape(a["title"])
        slug = escape(a["slug"])
        desc = escape(a.get("desc", ""))
        date = escape(a.get("date", ""))
        thumb = escape(a.get("thumb", "images/upi.webp"))
        tags = a.get("tags", [])
        tags_html = " ".join([f'<span class="tag">{escape(t)}</span>' for t in tags])

        cards.append(f"""
        <article class="card">
          <a href="{slug}" class="thumbwrap">
            <img src="{thumb}" alt="{title}" />
          </a>
          <div class="cardbody">
            <div class="tags">{tags_html}</div>
            <h2><a href="{slug}">{title}</a></h2>
            <p class="meta">{date}</p>
            <p class="desc">{desc}</p>
            <a class="read" href="{slug}">Read article →</a>
          </div>
        </article>
        """)

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Articles – {SITE_NAME}</title>
  <meta name="description" content="All long-form articles published on {SITE_NAME}." />
  <link rel="stylesheet" href="styles.css" />
</head>
<body class="ic-body">
  <div class="ic-topstrip">All articles • {SITE_NAME}</div>

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
        <a href="articles.html" class="ic-nav-link ic-nav-link-active">Articles</a>
        <a href="search.html" class="ic-nav-link">Search</a>
      </nav>
    </div>
  </header>

  <main class="ic-main">
    <div class="ic-container">
      <div class="ic-section-header">
        <h1>All Articles</h1>
        <p>Newest first.</p>
      </div>

      <div class="ic-articles-grid">
        {''.join(cards)}
      </div>
    </div>
  </main>

  <footer class="ic-footer">
    <div class="ic-container ic-footer-bottom">© 2025 {SITE_NAME}. All rights reserved.</div>
  </footer>
</body>
</html>
"""

def make_category_page(tag_name, info, articles):
    filtered = [a for a in articles if tag_name in a.get("tags", [])]
    filtered = sorted(filtered, key=lambda x: x.get("date", ""), reverse=True)

    cards = []
    for a in filtered:
        title = escape(a["title"])
        slug = escape(a["slug"])
        desc = escape(a.get("desc", ""))
        date = escape(a.get("date", ""))
        thumb = escape(a.get("thumb", "images/upi.webp"))

        cards.append(f"""
        <article class="ic-article-card">
          <a href="{slug}" class="ic-article-thumb-link">
            <img src="{thumb}" alt="{title}" class="ic-article-thumb" />
          </a>
          <div>
            <h3 class="ic-article-title"><a href="{slug}">{title}</a></h3>
            <p class="ic-article-meta">{date}</p>
            <p class="ic-article-excerpt">{desc}</p>
            <a href="{slug}" class="ic-article-read">Read article →</a>
          </div>
        </article>
        """)

    cards_html = "\n".join(cards) if cards else "<p style='color:#9ca3af;'>No articles published yet. Coming soon.</p>"

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>{escape(info["title"])} – {SITE_NAME}</title>
  <meta name="description" content="{escape(info["desc"])}" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body class="ic-body">

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
      <a href="search.html" class="ic-nav-link">Search</a>
    </nav>
  </div>
</header>

<main class="ic-main">
  <div class="ic-container">
    <section class="ic-sidebar-block">
      <h1 style="margin-top:0;">{escape(info["title"])}</h1>
      <p style="color:#cbd5f5;">{escape(info["desc"])}</p>
    </section>

    <section class="ic-sidebar-block">
      <h2 style="margin-top:0;">Articles</h2>
      {cards_html}
    </section>
  </div>
</main>

<footer class="ic-footer">
  <div class="ic-container ic-footer-bottom">© 2025 {SITE_NAME}. All rights reserved.</div>
</footer>

</body>
</html>
"""

def write_category_pages(articles):
    for tag, info in CATEGORIES.items():
        with open(info["file"], "w", encoding="utf-8") as f:
            f.write(make_category_page(tag, info, articles))

def strip_html(html):
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def make_search_index(articles):
    data = []
    for a in sorted(articles, key=lambda x: x.get("date", ""), reverse=True):
        body_html = a.get("content_html", "")
        body_text = strip_html(body_html) if body_html else ""

        data.append({
            "title": a.get("title", ""),
            "slug": a.get("slug", ""),
            "url": a.get("url", ""),
            "desc": a.get("desc", ""),
            "date": a.get("date", ""),
            "thumb": a.get("thumb", ""),
            "tags": a.get("tags", []),
            "body": body_text
        })
    return json.dumps(data, indent=2, ensure_ascii=False)

def make_search_page():
    # ✅ FIXED: No Python code inside JS
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
  <div class="ic-container ic-footer-bottom">© 2025 {SITE_NAME}. All rights reserved.</div>
</footer>

<script>
  let data = [];

  async function loadIndex() {{
    const res = await fetch("search-index.json");
    data = await res.json();
    document.getElementById("count").textContent = data.length + " articles indexed";
    render("");
  }}

  function escapeHtml(str) {{
    return (str || "").replace(/[&<>"']/g, function (m) {{
      return {{
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }}[m];
    }});
  }}

  function makeTagsHtml(tags) {{
    if (!tags || !tags.length) return "";
    return tags.slice(0,3).map(t => `<span class="ic-tag">${{escapeHtml(t)}}</span>`).join("");
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
      div.style.gridTemplateColumns = "140px 1fr";

      div.innerHTML = `
        <a href="${{a.slug}}" class="ic-article-thumb-link">
          <img src="${{a.thumb}}" alt="${{escapeHtml(a.title)}}" class="ic-article-thumb" />
        </a>
        <div>
          <div class="ic-article-tags">${{makeTagsHtml(a.tags)}}</div>
          <h3 class="ic-article-title"><a href="${{a.slug}}">${{escapeHtml(a.title)}}</a></h3>
          <p class="ic-article-meta">${{escapeHtml(a.date)}}</p>
          <p class="ic-article-excerpt">${{escapeHtml(a.desc)}}</p>
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
    return json.dumps({
        "site": {"name": SITE_NAME, "url": SITE_URL, "description": SITE_DESC, "language": "en"},
        "articles": articles
    }, indent=2, ensure_ascii=False)

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
    <div class="ic-container ic-footer-bottom">© 2025 {SITE_NAME}. All rights reserved.</div>
  </footer>
</body>
</html>
"""

def main():
    articles = load_articles_json()

    publish_drafts(articles)
    save_articles_json(articles)

    update_index_html(articles)

    # SEO files
    with open("sitemap.xml", "w", encoding="utf-8") as f:
        f.write(make_sitemap(articles))
    with open("rss.xml", "w", encoding="utf-8") as f:
        f.write(make_rss(articles))
    with open("robots.txt", "w", encoding="utf-8") as f:
        f.write(make_robots())

    # Pages
    with open("articles.html", "w", encoding="utf-8") as f:
        f.write(make_articles_page(articles))
    write_category_pages(articles)

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










