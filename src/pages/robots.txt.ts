import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * robots.txt. Everything public is open to crawlers. The three closed paths
 * are the cabinet, the endpoints behind the forms and tracking, and the
 * campaign redirects, which are single use addresses that should never end
 * up in an index.
 *
 * Served from a route rather than public/ so the sitemap line always points
 * at the site actually being served, on the preview domain as well as the
 * live one.
 */

const FALLBACK_SITE = 'https://bpecleaning.ie';

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL(FALLBACK_SITE)).origin;

  const body = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api
Disallow: /go

Sitemap: ${origin}/sitemap.xml
`;

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=3600',
    },
  });
};
