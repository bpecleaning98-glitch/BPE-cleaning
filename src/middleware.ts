import { defineMiddleware } from 'astro:middleware';
import vercelConfig from '../vercel.json';

/**
 * Security headers.
 *
 * WHY THERE ARE TWO PLACES, AND WHICH ONE OWNS WHAT
 *
 * This site is static almost everywhere. Every marketing page is prerendered
 * at build time and served straight off the Vercel CDN by the filesystem
 * handler, which never wakes a function, so this middleware never runs for
 * them. It runs only for the routes that opt out of prerendering: /api/lead,
 * /api/track, /go/[code], /blog and /blog/[slug], /sitemap.xml, /robots.txt.
 *
 * So the split is not a preference, it is where the request is answered:
 *
 *   vercel.json   owns every response the platform serves by itself. That is
 *                 the fifteen prerendered pages, /admin included, and every
 *                 asset under /_astro. It is the only layer that can put a
 *                 header on those, and being the outermost layer it also
 *                 covers the function responses, so it is the site's floor.
 *
 *   this file     owns the routes that are rendered per request. It sends the
 *                 same values on purpose, for two reasons. Repeated identical
 *                 values are safe whichever way the platform resolves a
 *                 collision, whether the outer layer replaces the header or
 *                 the browser sees it twice and enforces both. And without it
 *                 the on-demand routes would be bare anywhere vercel.json is
 *                 not read: `astro dev`, `astro preview`, a node host, a
 *                 future move off Vercel.
 *
 * ONE POLICY TEXT, NOT TWO COPIES
 *
 * The values below are not typed out again. This file imports vercel.json and
 * reads the header blocks straight out of it, so the two layers cannot drift
 * apart: editing a policy in vercel.json is editing the one this file sends.
 * vercel.json is the source rather than the other way round because it is the
 * only one of the two that the platform itself can read, and because it is
 * the layer that covers the prerendered pages this middleware never sees.
 *
 * If a block ever loses its name in vercel.json, the lookup below throws the
 * moment this module loads instead of quietly serving a page the wrong
 * policy. That is deliberate: a policy that is silently too loose is the
 * failure worth preventing here.
 *
 * THREE SCOPES, NOT TWO
 *
 * The catch-all block is the floor, and two paths override it:
 *
 *   /api/     answers JSON to a script and nothing else. Nothing in that
 *             response may ever load, frame or submit anything, so it is
 *             allowed nothing at all.
 *
 *   /admin    is the cabinet, a React island that talks to Supabase straight
 *             from the browser, so it is the one page that needs connect-src
 *             wider than 'self'. Miss this and signing in fails with a CSP
 *             violation in the console and no database behind it. The block
 *             named /admin and the block named /admin/(.*) in vercel.json
 *             carry the same values, so reading the first covers both.
 *
 * WHAT THE POLICY ALLOWS, AND WHY
 *
 * Read this before tightening anything, because two of these look loose and
 * are not negotiable with the site as it is built today.
 *
 *   script-src 'self' 'unsafe-inline'
 *     Astro inlines every small component script directly into the page: the
 *     built homepage carries six inline blocks, /contact carries seven, and
 *     the `is:inline` block in Base.astro that sets the `js` class before
 *     anything paints. Their content changes with every build, so hashes
 *     would have to be regenerated on every build, and a nonce cannot exist
 *     at all on a page that was rendered once at build time and is now a file
 *     on a CDN. That leaves 'unsafe-inline'. Be honest about what that costs:
 *     against injected inline script this directive buys nothing. What it
 *     still buys is real, and it is the reason it is here: no third party
 *     origin can load script on this site, so an injected <script src> to
 *     somebody else's domain is dead, and with it the usual way stolen data
 *     leaves a page.
 *
 *   style-src 'self' 'unsafe-inline'
 *     Same story, worse numbers: the built pages carry over six hundred
 *     style attributes between them, from the motion work and the parallax
 *     layers that write transforms at runtime. A style attribute is not
 *     covered by a hash, only by 'unsafe-inline'.
 *
 *   img-src and media-src ... https:
 *     Blog articles are written in the cabinet, their cover photos live in
 *     Supabase storage under a project origin this file cannot know, and the
 *     article body is markdown with raw HTML left in on purpose so the client
 *     can embed a photo or a video without a developer. Naming origins here
 *     would mean the client's next article silently loses its pictures. An
 *     image cannot execute, so the trade is a cheap one. The data: and blob:
 *     sources are what the cabinet needs for the QR code it draws for a
 *     campaign link and for the file it hands over on an export.
 *
 *   frame-src
 *     /contact builds a Google Maps iframe when the visitor presses the map,
 *     and the blog can embed a video. Those hosts are named, nothing else can
 *     be framed. The cabinet frames nothing at all, so its own policy says
 *     'none'.
 *
 *   connect-src 'self'
 *     Nothing on the public site talks to anywhere but here: tracking and the
 *     quote form both post to /api. Only the cabinet needs Supabase, and only
 *     the cabinet is allowed it, in the admin scope. It names *.supabase.co
 *     rather than the project, because the project origin is an environment
 *     variable and vercel.json cannot read one. Narrow it to the exact origin
 *     once it exists; the wildcard is the loosest thing here. The wss: entry
 *     beside it is for the socket the Supabase client opens when a screen
 *     subscribes to live rows.
 *
 * The rest is closed: no plugins, no framing of this site, no <base> rewrite,
 * forms post to this origin only, and everything is upgraded to https.
 */

type HeaderBlock = { source: string; headers: { key: string; value: string }[] };

function blockFor(source: string): HeaderBlock {
  const found = (vercelConfig.headers as HeaderBlock[]).find((block) => block.source === source);
  if (!found) throw new Error(`vercel.json has no header block for "${source}"`);
  return found;
}

function valueOf(block: HeaderBlock, key: string): string {
  const found = block.headers.find((header) => header.key === key);
  if (!found) throw new Error(`vercel.json block "${block.source}" has no ${key} header`);
  return found.value;
}

const CATCH_ALL = blockFor('/(.*)');
const API_SCOPE = blockFor('/api/(.*)');
const ADMIN_SCOPE = blockFor('/admin');

/**
 * The floor, minus HSTS. That one is sent below and only over https, because
 * pinning a plain http dev origin would be a nuisance nobody asked for.
 *
 * Two of the headers in it are worth a note. X-Frame-Options is redundant beside
 * frame-ancestors, which is already in the policy, and is kept only for the
 * browsers and the scanners that still read nothing else. And the opener
 * policy is same-origin-allow-popups rather than plain same-origin because
 * the quote form opens the WhatsApp tab first and points it at the chat
 * afterwards, so popups must keep their opener: anything stricter there would
 * cost a booking.
 */
const BASE_HEADERS = CATCH_ALL.headers.filter(
  (header) => header.key !== 'Strict-Transport-Security'
);

/**
 * Two years, subdomains included. Deliberately without `preload`: that one is
 * a one way door, and it should only be added once somebody has checked that
 * no subdomain of bpecleaning.ie will ever need to answer over http.
 */
const HSTS = valueOf(CATCH_ALL, 'Strict-Transport-Security');

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  const headers = response.headers;
  const path = context.url.pathname;

  for (const { key, value } of BASE_HEADERS) headers.set(key, value);

  // Same order the platform resolves them in: the floor first, then the one
  // scope that claims this path writes over it.
  const scope = path.startsWith('/api/')
    ? API_SCOPE
    : path === '/admin' || path.startsWith('/admin/')
      ? ADMIN_SCOPE
      : null;
  if (scope) {
    for (const { key, value } of scope.headers) headers.set(key, value);
  }

  // Sent only over https, so a local dev origin is never pinned.
  const secure =
    context.url.protocol === 'https:' ||
    context.request.headers.get('x-forwarded-proto') === 'https';
  if (secure) headers.set('Strict-Transport-Security', HSTS);

  return response;
});
