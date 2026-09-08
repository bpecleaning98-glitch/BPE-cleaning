import type { APIRoute } from 'astro';
import { dbAdmin } from '../../lib/db';
import { sendLeadEmail } from '../../lib/email';
import {
  clientIp,
  clip,
  digitCount,
  hostOrNull,
  isBot,
  looksInjected,
  pathOrNull,
  rateLimit,
  readJson,
  tagOrNull,
  visitorHash,
} from '../../lib/request';
import { NO_ATTRIBUTION, currentSession, entryOf, type Attribution } from '../../lib/session';

export const prerender = false;

/**
 * A request from the quote form. The form still opens WhatsApp, which is
 * where the work is actually scheduled; this route only makes sure the same
 * request is also written down, together with the campaign that produced it.
 * That is the whole point of the attribution: not which channel brings
 * visits, but which channel brings people who ask for a price.
 *
 * Nothing here is allowed to block the visitor, so every failure answers 200
 * and the form carries on to WhatsApp regardless. That rule now covers the
 * unexpected too: the whole body is wrapped, so a database that is down or a
 * connection that dies mid insert still ends in a 200 and a booking.
 *
 * Everything below only ever decides whether a row is written. It can never
 * decide whether the visitor reaches WhatsApp, because that already happened
 * in the browser before this request was sent.
 *
 * What is stored is only what the form asks for (name, phone, service, size,
 * preferred date, area, an optional note), plus the campaign the visit is
 * credited to. The form does not ask for an email address and this route
 * would not keep one; the `email` column in the table stays empty.
 */

/**
 * A real person asks for a price once, twice if they mistyped something. Ten
 * in a quarter of an hour from one address is already far past a family
 * sharing a connection, and the ones after it are a script.
 */
const LIMIT = 10;
const WINDOW_MS = 15 * 60 * 1000;

/**
 * The longest a genuine request can be. The note is the only field with room
 * to grow and the input in QuoteForm.astro stops it at 2000 characters, the
 * same number the server clips it to, so a real enquiry cannot reach this cap
 * even with every other field full.
 */
const MAX_BODY = 16 * 1024;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const answer = (extra: Record<string, unknown> = {}) =>
    new Response(JSON.stringify({ ok: true, ...extra }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });

  try {
    const body = await readJson(request, MAX_BODY);
    const ua = request.headers.get('user-agent') || '';

    // Over the cap, so the body was dropped unread and there is nothing to
    // look at. This is its own answer and not 'empty', because the two mean
    // opposite things: 'empty' is somebody who submitted nothing, this is an
    // enquiry that may well have had a name and a phone number in it and was
    // lost anyway. The form caps the note, so reaching this is either a bug
    // or a script, and both are worth being able to see.
    if (body === null) return answer({ skipped: 'too-large' });

    // No early exit on a missing database any more. Writing the row and
    // ringing the owner's phone are two separate jobs with two separate
    // failure modes, and the notification is the one that has to survive: a
    // request nobody sees today is worth more lost than a row in a report
    // read at the end of the month. The database is checked where it is
    // actually used, below.
    if (isBot(ua)) return answer({ skipped: 'bot' });
    // Honeypot: a hidden field only an automated filler would ever complete.
    if (clip(body.hp, 100)) return answer({ skipped: 'trap' });

    const ip = clientIp(request, clientAddress);
    if (!(await rateLimit('lead', ip, LIMIT, WINDOW_MS))) return answer({ skipped: 'rate' });

    const name = clip(body.name, 120);
    const phone = clip(body.phone, 40);
    const service = clip(body.service, 120);
    const size = clip(body.size, 120);
    const date = clip(body.date, 40);
    const area = clip(body.area, 120);
    const notes = clip(body.notes, 2000);

    // There has to be someone to call back. A name is two letters or more, a
    // phone number is seven digits or more, which is under any Irish number
    // and under any international one. Neither means nobody, and the row
    // would only ever be noise in the cabinet.
    const hasName = (name?.match(/\p{L}/gu) || []).length >= 2;
    const hasPhone = digitCount(phone) >= 7;
    if (!hasName && !hasPhone) return answer({ skipped: 'empty' });

    // Form spam announces itself: a link or a tag in a field that holds a
    // person's name, a town or a date. Nobody types that by accident. The
    // note is judged more gently, because a customer might paste one link to
    // a listing, but three is an advert.
    const shortFields = [name, phone, service, size, date, area];
    if (shortFields.some(looksInjected)) return answer({ skipped: 'junk' });
    if ((notes?.match(/https?:\/\//gi) || []).length >= 3) return answer({ skipped: 'junk' });

    // Which campaign this request is credited to. The answer comes from the
    // server's own record of the visit: the visitor code made from this
    // request's address and browser finds the visit under way, and the
    // FIRST page of that visit says where it came from (src/lib/session.ts).
    // Nothing about it was ever stored in the browser.
    //
    // The browser still sends what its own page can see, the query string,
    // the referrer and the path, and that is used only when there is no
    // recorded visit to read from: no salt configured, or a person who
    // landed straight on the form and sent it before the page view landed.
    // Either way it is a claim from the browser's side and is validated as
    // such. With Global Privacy Control on, nothing about the visit is
    // recorded at all, so nothing is credited either; the request itself is
    // still written, because the visitor asked for it.
    const gpc = request.headers.get('sec-gpc') === '1';
    const hash = gpc ? null : await visitorHash(ip, ua);
    const sessionId = dbAdmin && hash ? await currentSession(dbAdmin, hash) : null;
    const recorded = dbAdmin && sessionId ? await entryOf(dbAdmin, sessionId) : null;
    const claimed: Attribution = {
      utm_source: tagOrNull(body.us, 80),
      utm_medium: tagOrNull(body.um, 80),
      utm_campaign: tagOrNull(body.uc, 120),
      link_code: tagOrNull(body.code, 60),
      referrer_host: hostOrNull(body.ref),
      landing_path: pathOrNull(body.landing),
    };
    const attribution = gpc ? NO_ATTRIBUTION : (recorded ?? claimed);
    const source = attribution.utm_source;
    const campaign = attribution.utm_campaign;
    const linkCode = attribution.link_code;
    const referrer = attribution.referrer_host;
    const landing = attribution.landing_path;

    // Both at once, because they have nothing to say to each other and the
    // visitor's browser stops waiting after 1.2s either way. Neither can
    // reject: insert() reports errors in its result and sendLeadEmail
    // answers with a status, so there is no failure here to catch.
    const [written, mailed] = await Promise.all([
      dbAdmin
        ? dbAdmin
            .from('leads')
            .insert({
              name: name || '',
              phone: phone || '',
              service,
              size,
              preferred_date: date,
              area,
              notes,
              utm_source: source,
              utm_medium: attribution.utm_medium,
              utm_campaign: campaign,
              link_code: linkCode,
              referrer_host: referrer,
              landing_path: landing,
              session_id: gpc ? null : sessionId,
            })
            .then(({ error }) => (error ? 'error' : 'ok'))
        : Promise.resolve('not-configured' as const),
      sendLeadEmail({
        name: name || '',
        phone: phone || '',
        service,
        size,
        date,
        area,
        notes,
        // The label the owner reads, not the raw tag: a request that came
        // through a flyer's QR code should say so in one word.
        source: source || referrer || null,
        campaign,
        linkCode,
        landing,
      }),
    ]);

    return answer({ stored: written, mailed });
  } catch {
    // The record is a bonus, the WhatsApp hand off is the job.
    return answer({ skipped: 'error' });
  }
};
