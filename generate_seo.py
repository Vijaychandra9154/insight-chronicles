import json
from datetime import datetime
from xml.sax.saxutils import escape

SITE_URL = "https://insight-chronicles.com"
SITE_NAME = "Insight Chronicles"
SITE_DESC = "Independent long-form analysis on history, geopolitics, and technology."

def load_articles():
    with open("articles.json", "r", encoding="utf-8") as f:
        return json.load(f)

def make_sitemap(articles):
    urls = [
        f"""  <url>
    <loc>{SITE_URL}/</loc>
    <priority>1.0</priority>
  </url>""",
        f"""  <url>
    <loc>{SITE_URL}/articles.html</loc>
    <priority>0.9</priority>
  </url>""",
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
        <a href="index.html#topics" class="ic-nav-link">Topics</a>
        <a href="index.html#about" class="ic-nav-link">About</a>
      </nav>
    </div>
  </header>

  <main class="ic-main">
    <div class="ic-container">
      <div class="ic-section-header">
        <h1>All Articles</h1>
        <p>All long-form pieces, newest first.</p>
      </div>

      <div class="ic-articles-grid">
        {''.join(cards_html)}
      </div>
    </div>
  </main>

  <footer class="ic-footer">
    <div class="ic-container ic-footer-grid">
      <div><h4>{SITE_NAME}</h4><p>Independent writing on history, geopolitics and technology.</p></div>
      <div><h4>Pages</h4><ul><li><a href="index.html">Home</a></li><li><a href="articles.html">Articles</a></li></ul></div>
      <div><h4>Legal</h4><ul><li><a href="privacy.html">Privacy</a></li><li><a href="terms.html">Terms</a></li><li><a href="disclaimer.html">Disclaimer</a></li></ul></div>
      <div><h4>Contact</h4><p><a href="mailto:moonoriginblue@gmail.com">moonoriginblue@gmail.com</a></p></div>
    </div>
    <div class="ic-footer-bottom">© 2025 {SITE_NAME}. All rights reserved.</div>
  </footer>
</body>
</html>
"""

def make_robots():
    return f"""User-agent: *
Allow: /

Sitemap: {SITE_URL}/sitemap.xml
"""

def make_404():
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>404 – Page Not Found | {SITE_NAME}</title>
  <meta name="robots" content="noindex" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body class="ic-body">
  <div class="ic-topstrip">404 • Not Found</div>

  <main class="ic-main">
    <div class="ic-container" style="padding:50px 0;">
      <h1 style="font-size:42px;margin-bottom:10px;">Page not found</h1>
      <p style="max-width:650px;opacity:0.85;line-height:1.7;">
        The link you opened doesn’t exist on Insight Chronicles.  
        You can go back to the homepage or browse all articles.
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

def make_site_json(articles):
    clean_articles = []
    for a in articles:
        clean_articles.append({
            "title": a.get("title"),
            "slug": a.get("slug"),
            "url": a.get("url"),
            "desc": a.get("desc"),
            "date": a.get("date"),
            "thumb": a.get("thumb"),
            "tags": a.get("tags", [])
        })

    data = {
        "site": {
            "name": SITE_NAME,
            "url": SITE_URL,
            "description": SITE_DESC,
            "language": "en"
        },
        "articles": clean_articles
    }
    return json.dumps(data, indent=2)

def main():
    articles = load_articles()

    with open("sitemap.xml", "w", encoding="utf-8") as f:
        f.write(make_sitemap(articles))

    with open("rss.xml", "w", encoding="utf-8") as f:
        f.write(make_rss(articles))

    with open("articles.html", "w", encoding="utf-8") as f:
        f.write(make_articles_page(articles))

    with open("robots.txt", "w", encoding="utf-8") as f:
        f.write(make_robots())

    with open("404.html", "w", encoding="utf-8") as f:
        f.write(make_404())

    with open("site.json", "w", encoding="utf-8") as f:
        f.write(make_site_json(articles))

    print("✅ Generated: sitemap.xml, rss.xml, articles.html, robots.txt, 404.html, site.json")

if __name__ == "__main__":
    main()


