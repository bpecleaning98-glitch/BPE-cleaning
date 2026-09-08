import type { APIRoute } from 'astro';
import { dbAdmin } from '../../lib/db';
import {
  browserOf,
  clientIp,
  deviceOf,
  hostOrNull,
  isBot,
  langOrNull,
  pathOrNull,
  placeOf,
  rateLimit,
  readJson,
  tagOrNull,
  visitorHash,
} from '../../lib/request';
import { currentSession } from '../../lib/session';

export const prerender = false;

/**
 * First-party traffic collection. Two messages arrive here:
 *
 *   { t: 'view' }  a page was opened. Returns the row id.
 *   { t: 'exit' }  that page was left, with how long it was on screen.
 *
 * The browser never talks to the database directly, so nobody can inflate
 * the numbers from a console, and no anonymous write policy has to exist.
 * Bots are dropped, and a request with no Supabase configured is a no-op
 * that still answers 200 so the site never shows a failed request.
 *
 * Everything a client sends is treated as a claim, not as a fact. The only
 * values that reach the database unquestioned are the ones derived here from
 * headers: the device, the browser, the place, the visitor hash, and now the
 * visit itself. The browser no longer names its session: it is looked up
 * from the visitor hash and a 30 minute rule (src/lib/session.ts), so the
 * device stores nothing and the number cannot be forged from outside.
 */
const ok = (body: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ ok: true, ...body }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

/**
 * Tracking is chatty on purpose: one view per page, then a dwell beacon each
 * time the tab is hidden, at most one a second. A visitor reading fifteen
 * pages with a restless tab still lands far under this, so the limit only
 * ever meets a script. Over the limit is not an error, it is a quiet no-op,
 * because a failed request in the console is a worse outcome than a lost row.
 */
const LIMIT = 120;
const WINDOW_MS = 60_000;

/** A view older than this is history. Dwell is only written while it is news. */
const DWELL_WINDOW_MS = 6 * 60 * 60 * 1000;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // A view payload is a few hundred bytes and an exit beacon is under a
  // hundred. Four kilobytes is already generous. Nothing our own script sends
  // can go over that, so a body that does is a script of somebody else's, and
  // an empty object is the right thing to carry on with: it names no path, so
  // it falls out below as 'invalid' and no row is written.
  const body = (await readJson(request, 4 * 1024)) ?? {};
  if (!dbAdmin) return ok({ skipped: 'not-configured' });

  const ua = request.headers.get('user-agent') || '';
  if (isBot(ua)) return ok({ skipped: 'bot' });

  // The browser script already refuses to send anything when Global Privacy
  // Control is on. This is the same refusal, server side, so the promise on
  // the privacy page does not depend on one script running correctly.
  if (request.headers.get('sec-gpc') === '1') return ok({ skipped: 'gpc' });

  const ip = clientIp(request, clientAddress);
  if (!(await rateLimit('track', ip, LIMIT, WINDOW_MS))) return ok({ skipped: 'rate' });

  const hash = await visitorHash(ip, ua);

  // Leaving a page: only ever raise the recorded time, because a tab can be
  // hidden and shown again and each hide sends its own total.
  if (body.t === 'exit') {
    const id = Number(body.id);
    const ms = Math.min(Math.max(Number(body.ms) || 0, 0), 60 * 60 * 1000);
    if (!Number.isSafeInteger(id) || id <= 0 || ms <= 0) return ok({ skipped: 'noop' });

    // The row id is a plain counter, so a client can name a row that is not
    // its own. The row is therefore only touched if it carries the visitor
    // code of the request asking, which a stranger cannot know or forge:
    // it is made here, from their address, not ours. Where no code exists
    // (no salt configured) the two older guards still apply: the time can
    // only go up and only to an hour, and only views from the last few
    // hours can be touched at all.
    const since = new Date(Date.now() - DWELL_WINDOW_MS).toISOString();
    let update = dbAdmin
      .from('page_views')
      .update({ dwell_ms: ms })
      .eq('id', id)
      .lt('dwell_ms', ms)
      .gte('created_at', since);
    if (hash) update = update.eq('visitor_hash', hash);

    await update;
    return ok();
  }

  const path = pathOrNull(body.path);
  if (!path) return ok({ skipped: 'invalid' });

  // The visit this page belongs to, from our own records. A page inside the
  // gap joins the visit already under way; anything else starts a new one,
  // and the first page of a visit is its entry, which is what the cabinet's
  // "where do visits come from" is counted on.
  const existing = await currentSession(dbAdmin, hash);
  const sessionId = existing ?? crypto.randomUUID();

  const { country, city } = placeOf(request.headers);

  const { data, error } = await dbAdmin
    .from('page_views')
    .insert({
      session_id: sessionId,
      visitor_hash: hash,
      path,
      referrer_host: hostOrNull(body.ref),
      utm_source: tagOrNull(body.us, 80),
      utm_medium: tagOrNull(body.um, 80),
      utm_campaign: tagOrNull(body.uc, 120),
      link_code: tagOrNull(body.code, 60),
      device: deviceOf(ua),
      browser: browserOf(ua),
      country,
      city,
      is_entry: !existing,
      lang: langOrNull(body.lang),
    })
    .select('id')
    .single();

  if (error) return ok({ skipped: 'error' });
  return ok({ id: data?.id });
};
