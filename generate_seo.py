import json
import os
from datetime import datetime
from xml.sax.saxutils import escape

SITE_URL = "https://insight-chronicles.com"
SITE_NAME = "Insight Chronicles"
SITE_DESC = "Independent long-form analysis on history, geopolitics, and technology."

DRAFTS_DIR = "drafts"
TEMPLATE_FILE = "article_template.html"

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

def build_article_html(template, draft):
    html = template
    replacements = {
        "{{TITLE}}": draft["title"],
        "{{DESCRIPTION}}": draft["desc"],
        "{{SLUG}}": draft["slug"],
        "{{DATE}}": draft["date"],
        "{{THUMB}}": draft["thumb"],
        "{{TAGLINE}}": ", ".join(draft.get("tags", [])) or "Insight Chronicles",
        "{{CONTENT}}": draft["content"]
    }
    for k, v in replacements.items():
        html = html.replace(k, v)
    return html

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

def publish_drafts(articles):
    template = load_template()
    drafts = read_drafts()
    published = 0

    existing_slugs = {a.get("slug") for a in articles}

    for d in drafts:
        slug = d["slug"]

        if slug in existing_slugs:
            continue

        # Create HTML file automatically
        html = build_article_html(template, d)
        with open(slug, "w", encoding="utf-8") as f:
            f.write(html)

        # Add to articles.json
        new_entry = {
            "title": d["title"],
            "slug": d["slug"],
            "url": f"{SITE_URL}/{d['slug']}",
            "desc": d["desc"],
            "date": d["date"],
            "thumb": d["thumb"],
            "tags": d.get("tags", [])
        }
        articles.append(new_entry)
        published += 1

    return published

def make_sitemap(articles):
    urls = [
        f"""  <url>
    <loc>{SITE_URL}/</loc>
    <priority>1.0</priority>
  </url>""",
        f"""  <url>
    <loc>{SITE_URL}/articles.html</loc>
    <priority>0.9</priority>
  </url>"""
    ]
    for a in articles:
        urls.append(f"""  <url>
    <loc>{escape(a["url"])}</loc>
    <priority>0.8</priority>
  </url>""")
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

def make_articles_page(articles):
    sorted_articles = sorted(articles, key=lambda x: x.get("date", ""), reverse=True)
    cards_html = []

    for a in sorted_articles:
        title = escape(a["title"])
        slug = escape(a["slug"])
        desc = escape(a.get("desc", ""))
        date = escape(a.get("date", ""))
        thumb = escape(a.get("thumb", "images/upi.webp"))
        tags = a.get("tags", [])
        tags_html = " ".join([f'<span class="tag">{escape(t)}</span>' for t in tags])

        cards_html.append(f"""
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
        {''.join(cards_html)}
      </div>
    </div>
  </main>

  <footer class="ic-footer">
    <div class="ic-container ic-footer-bottom">© 2025 {SITE_NAME}. All rights reserved.</div>
  </footer>
</body>
</html>
"""

def make_robots():
    return f"""User-agent: *
Allow: /

Sitemap: {SITE_URL}/sitemap.xml
"""

def main():
    articles = load_articles_json()

    published_count = publish_drafts(articles)
    save_articles_json(articles)

    with open("sitemap.xml", "w", encoding="utf-8") as f:
        f.write(make_sitemap(articles))
    with open("rss.xml", "w", encoding="utf-8") as f:
        f.write(make_rss(articles))
    with open("articles.html", "w", encoding="utf-8") as f:
        f.write(make_articles_page(articles))
    with open("robots.txt", "w", encoding="utf-8") as f:
        f.write(make_robots())

    print(f"✅ Published {published_count} new draft(s).")
    print("✅ Updated: articles.json, sitemap.xml, rss.xml, articles.html, robots.txt")

if __name__ == "__main__":
    main()



