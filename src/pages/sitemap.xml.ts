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

type StaticPage = { path: string; changefreq: string; priority: string };

const STATIC_PAGES: StaticPage[] = [
  { path: '/', changefreq: 'monthly', priority: '1.0' },
  { path: '/services/', changefreq: 'monthly', priority: '0.9' },
  { path: '/prices/', changefreq: 'monthly', priority: '0.9' },
  { path: '/quote/', changefreq: 'monthly', priority: '0.9' },
  { path: '/house-cleaning-dublin/', changefreq: 'monthly', priority: '0.8' },
  { path: '/deep-cleaning-dublin/', changefreq: 'monthly', priority: '0.8' },
  { path: '/end-of-tenancy-cleaning-dublin/', changefreq: 'monthly', priority: '0.8' },
  { path: '/after-builders-cleaning-dublin/', changefreq: 'monthly', priority: '0.8' },
  { path: '/office-cleaning-dublin/', changefreq: 'monthly', priority: '0.8' },
  { path: '/airbnb-cleaning-dublin/', changefreq: 'monthly', priority: '0.8' },
  { path: '/about/', changefreq: 'yearly', priority: '0.6' },
  { path: '/contact/', changefreq: 'yearly', priority: '0.6' },
  { path: '/blog/', changefreq: 'weekly', priority: '0.7' },
  { path: '/guides/', changefreq: 'monthly', priority: '0.7' },
  { path: '/guides/end-of-tenancy-cleaning-checklist/', changefreq: 'yearly', priority: '0.6' },
  { path: '/guides/deep-cleaning-vs-regular-cleaning/', changefreq: 'yearly', priority: '0.6' },
  { path: '/guides/airbnb-turnover-checklist/', changefreq: 'yearly', priority: '0.6' },
  { path: '/guides/after-builders-cleaning-guide/', changefreq: 'yearly', priority: '0.6' },
  { path: '/privacy/', changefreq: 'yearly', priority: '0.3' },
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

  const urls = [
    ...STATIC_PAGES.map((page) => entry(`${origin}${page.path}`, page.changefreq, page.priority)),
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
