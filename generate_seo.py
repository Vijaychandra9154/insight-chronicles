import json
from datetime import datetime
from xml.sax.saxutils import escape

SITE_URL = "https://insight-chronicles.com"

def load_articles():
    with open("articles.json", "r", encoding="utf-8") as f:
        return json.load(f)

def make_sitemap(articles):
    urls = [
        f"""  <url>
    <loc>{SITE_URL}/</loc>
    <priority>1.0</priority>
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
        # Convert YYYY-MM-DD to RSS format if possible
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
    <title>Insight Chronicles</title>
    <link>{SITE_URL}/</link>
    <description>Independent long-form analysis on history, geopolitics, and technology.</description>
    <language>en</language>
    <lastBuildDate>{now}</lastBuildDate>
{''.join(items)}
  </channel>
</rss>
"""

def main():
    articles = load_articles()

    with open("sitemap.xml", "w", encoding="utf-8") as f:
        f.write(make_sitemap(articles))

    with open("rss.xml", "w", encoding="utf-8") as f:
        f.write(make_rss(articles))

    print("✅ Generated sitemap.xml and rss.xml successfully")

if __name__ == "__main__":
    main()
