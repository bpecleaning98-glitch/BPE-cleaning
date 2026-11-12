import type { APIRoute } from 'astro';
import { getPublishedPosts } from '../lib/posts';

export const prerender = false;

/**
 * The sitemap is server rendered, not built, for one reason: articles are
 * written in the cabinet and published without a deploy, so a sitemap frozen
 * at build time would always be one article behind.
 *
 * The static list below is maintained by hand on purpose. It is the set of
 * pages we want indexed, which is not the same thing as the set of files in
 * src/pages: /admin, /api and /go are deliberately absent, and so is any
 * error page.
 */

const FALLBACK_SITE = 'https://bpecleaning.ie';

/**
 * lastmod is the date the page's own content last changed, taken from the
 * commit that changed it, never the deploy date: Google only trusts the field
 * when it is accurate. Move it by hand when a page's text changes. /blog/ has
 * none here because it is derived from the newest article below.
 */
type StaticPage = { path: string; changefreq: string; priority: string; lastmod?: string };

const STATIC_PAGES: StaticPage[] = [
  { path: '/', changefreq: 'monthly', priority: '1.0', lastmod: '2026-09-22' },
  { path: '/services/', changefreq: 'monthly', priority: '0.9', lastmod: '2026-09-09' },
  { path: '/areas/', changefreq: 'monthly', priority: '0.8', lastmod: '2026-09-21' },
  { path: '/prices/', changefreq: 'monthly', priority: '0.9', lastmod: '2026-09-09' },
  { path: '/quote/', changefreq: 'monthly', priority: '0.9', lastmod: '2026-09-09' },
  { path: '/house-cleaning-dublin/', changefreq: 'monthly', priority: '0.8', lastmod: '2026-11-02' },
  { path: '/deep-cleaning-dublin/', changefreq: 'monthly', priority: '0.8', lastmod: '2026-11-02' },
  { path: '/end-of-tenancy-cleaning-dublin/', changefreq: 'monthly', priority: '0.8', lastmod: '2026-11-02' },
  { path: '/after-builders-cleaning-dublin/', changefreq: 'monthly', priority: '0.8', lastmod: '2026-11-02' },
  { path: '/office-cleaning-dublin/', changefreq: 'monthly', priority: '0.8', lastmod: '2026-09-09' },
  { path: '/airbnb-cleaning-dublin/', changefreq: 'monthly', priority: '0.8', lastmod: '2026-11-02' },
  { path: '/about/', changefreq: 'yearly', priority: '0.6', lastmod: '2026-09-09' },
  { path: '/contact/', changefreq: 'yearly', priority: '0.6', lastmod: '2026-09-21' },
  { path: '/blog/', changefreq: 'weekly', priority: '0.7' },
  { path: '/guides/', changefreq: 'monthly', priority: '0.7', lastmod: '2026-09-08' },
  { path: '/guides/end-of-tenancy-cleaning-checklist/', changefreq: 'yearly', priority: '0.6', lastmod: '2026-09-08' },
  { path: '/guides/deep-cleaning-vs-regular-cleaning/', changefreq: 'yearly', priority: '0.6', lastmod: '2026-09-23' },
  { path: '/guides/airbnb-turnover-checklist/', changefreq: 'yearly', priority: '0.6', lastmod: '2026-09-23' },
  { path: '/guides/after-builders-cleaning-guide/', changefreq: 'yearly', priority: '0.6', lastmod: '2026-09-08' },
  { path: '/privacy/', changefreq: 'yearly', priority: '0.3', lastmod: '2026-09-23' },
  { path: '/cookies/', changefreq: 'yearly', priority: '0.3', lastmod: '2026-09-21' },
  { path: '/terms/', changefreq: 'yearly', priority: '0.3', lastmod: '2026-09-23' },
  { path: '/refunds/', changefreq: 'yearly', priority: '0.3', lastmod: '2026-09-08' },
];

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function entry(loc: string, changefreq: string, priority: string, lastmod?: string): string {
  return [
    '  <url>',
    `    <loc>${esc(loc)}</loc>`,
    lastmod ? `    <lastmod>${esc(lastmod)}</lastmod>` : '',
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ]
    .filter(Boolean)
    .join('\n');
}

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL(FALLBACK_SITE)).origin;
  const posts = await getPublishedPosts(500);
  // The blog index changes whenever an article is published or edited.
  const newestPost = posts
    .map((post) => new Date(post.updated_at || post.published_at || post.created_at).toISOString())
    .sort()
    .pop();

  const urls = [
    ...STATIC_PAGES.map((page) =>
      entry(
        `${origin}${page.path}`,
        page.changefreq,
        page.priority,
        page.path === '/blog/' ? newestPost : page.lastmod
      )
    ),
    ...posts.map((post) =>
      entry(
        `${origin}/blog/${post.slug}/`,
        'yearly',
        '0.7',
        // An edit in the cabinet moves updated_at, which is exactly what
        // lastmod is for.
        new Date(post.updated_at || post.published_at || post.created_at).toISOString()
      )
    ),
  ].join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(xml, {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=600',
    },
  });
};
