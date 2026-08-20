import type { APIRoute } from 'astro';
import { getPublishedPosts, postSummary, renderMarkdown } from '../../lib/posts';

export const prerender = false;

/**
 * RSS 2.0 for /blog/. Server rendered like the pages themselves, so a reader
 * or an aggregator sees a new article on its next poll with no rebuild.
 *
 * Everything that goes into the document is escaped, including the rendered
 * HTML of each article inside content:encoded. No CDATA anywhere: a body
 * containing "]]>" would break the feed, and escaping cannot.
 */

const FALLBACK_SITE = 'https://bpecleaning.ie';

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Characters XML 1.0 does not allow at all, whatever they are escaped as.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL(FALLBACK_SITE)).origin;
  const posts = await getPublishedPosts(50);

  const newest = posts[0];
  const lastBuild = new Date(
    newest ? newest.published_at || newest.created_at : Date.now()
  ).toUTCString();

  const items = posts
    .map((post) => {
      const url = `${origin}/blog/${post.slug}/`;
      const published = new Date(post.published_at || post.created_at).toUTCString();
      const categories = (Array.isArray(post.tags) ? post.tags : [])
        .map((tag) => `      <category>${esc(tag)}</category>`)
        .join('\n');

      return [
        '    <item>',
        `      <title>${esc(post.title)}</title>`,
        `      <link>${esc(url)}</link>`,
        `      <guid isPermaLink="true">${esc(url)}</guid>`,
        `      <pubDate>${esc(published)}</pubDate>`,
        `      <description>${esc(postSummary(post, 300))}</description>`,
        categories,
        `      <content:encoded>${esc(renderMarkdown(post.content))}</content:encoded>`,
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>BPE Cleaning Services</title>
    <link>${esc(`${origin}/blog/`)}</link>
    <description>Cleaning advice for homes, offices and Airbnb properties from a Dublin cleaning team.</description>
    <language>en-ie</language>
    <lastBuildDate>${esc(lastBuild)}</lastBuildDate>
    <atom:link href="${esc(`${origin}/blog/rss.xml`)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    status: 200,
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      // Short shared cache: a reader polls on its own clock anyway, and the
      // pages themselves are never cached.
      'cache-control': 'public, max-age=0, s-maxage=300',
    },
  });
};
