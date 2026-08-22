/**
 * Everything the analytics routes need to know about an incoming request,
 * derived from headers only. No IP address is ever stored.
 */

/**
 * The salt for the visitor hash, read from the environment and from nowhere
 * else. There is deliberately no fallback: a salt written into the repository
 * is a salt the whole world has, and see visitorHash below for what a public
 * salt costs. Unset means unset, and the hash is then not produced at all.
 *
 * process.env is the runtime value on Vercel, import.meta.env is what
 * `astro dev` reads out of .env locally. Runtime wins, so rotating the value
 * in the Vercel dashboard takes effect without a rebuild. The lookup is
 * written with a variable key on purpose, so the value is never inlined into
 * a bundle at build time.
 */
const SALT_KEY = 'ANALYTICS_SALT';
const ANALYTICS_SALT = (
  (typeof process !== 'undefined' ? process.env?.[SALT_KEY] : undefined) ||
  (import.meta.env as Record<string, string | undefined>)[SALT_KEY] ||
  ''
).trim();

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|monitor|pingdom|curl|wget|python-requests|axios|scrapy|semrush|ahrefs|dataprovider|whatsapp|telegram|embedly/i;

export function isBot(ua: string): boolean {
  return !ua || BOT.test(ua);
}

export function deviceOf(ua: string): 'mobile' | 'tablet' | 'desktop' {
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(ua)) return 'mobile';
  return 'desktop';
}

export function browserOf(ua: string): string {
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\/|opera/i.test(ua)) return 'Opera';
  if (/samsungbrowser/i.test(ua)) return 'Samsung';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (/chrome|crios/i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua)) return 'Safari';
  return 'Other';
}

/**
 * Country and city come free from the edge on Vercel. Locally the headers
 * are absent and both stay null, which the cabinet renders as unknown.
 *
 * The two values are clipped even though the platform writes them, because
 * they are the only fields on a page view that do not come from our own
 * code, and a two letter column should never receive a kilobyte.
 */
export function placeOf(headers: Headers): { country: string | null; city: string | null } {
  const country = clip(headers.get('x-vercel-ip-country'), 2);
  const rawCity = headers.get('x-vercel-ip-city');
  let city: string | null = null;
  if (rawCity) {
    try {
      city = decodeURIComponent(rawCity);
    } catch {
      city = rawCity;
    }
  }
  return { country: country || null, city: clip(city, 80) };
}

/** sha256, hex, truncated. One place, so every hash here is built the same. */
async function sha256Hex(input: string, length: number): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}

/**
 * A visitor id that cannot follow anyone: sha256 of the day, the IP, the
 * user agent and a secret salt. It changes every midnight, so it counts
 * unique people within a day and is worthless for anything longer. This is
 * the same cookie-free approach privacy-first analytics tools use, and it is
 * why the site needs no cookie banner.
 *
 * Exactly what is guaranteed, and what is not.
 *
 * The formula is public, this file is in the repository, and the inputs are
 * small: a day, a user agent and an address out of a space one machine can
 * walk through in an afternoon. So the only thing standing between a stored
 * hash and the address it came from is the salt. With a secret salt, someone
 * holding a dump of page_views cannot get an address back out of it. Without
 * one, they can get every address back out of it, and the promise the
 * privacy page makes to visitors would be false.
 *
 * That is why no salt means no hash: the column is left null, the cabinet
 * loses its unique visitor count for those rows, and nothing weak is ever
 * written. The trade is one number on a dashboard against every visitor's
 * address, which is not a hard trade.
 *
 * What is still true with the salt set: it is not anonymisation in the
 * cryptographic sense, because whoever holds the salt can hash every address
 * in Ireland and match the day's rows back. It is unlinkable across days, no
 * address ever leaves this function, and the salt exists only in the
 * environment the server runs in. So it protects against a leaked database,
 * not against whoever holds the salt.
 */
export async function visitorHash(ip: string, ua: string): Promise<string | null> {
  if (!ip || !ANALYTICS_SALT) return null;
  const day = new Date().toISOString().slice(0, 10);
  return sha256Hex(`${day}|${ip}|${ua}|${ANALYTICS_SALT}`, 32);
}

/**
 * The address the request came from, normalised.
 *
 * On Vercel the platform writes x-forwarded-for itself and the adapter hands
 * the same raw header through as clientAddress, list and all, so the first
 * entry is the client and the rest are proxies. Locally neither exists and
 * the answer is an empty string, which every caller reads as "no key".
 */
export function clientIp(request: Request, fallback?: string | null): string {
  const forwarded = request.headers.get('x-forwarded-for') || fallback || '';
  const first = forwarded.split(',')[0].trim();
  return first || (request.headers.get('x-real-ip') || '').trim();
}

/**
 * The origin the VISITOR typed, which is not the one the function sees.
 *
 * Astro builds context.url from the incoming request, and on Vercel a
 * serverless function is handed the platform's internal address, so that URL
 * reads as localhost no matter which domain was actually asked for. Anything
 * built on it leaves the site: /go/[code] was redirecting every campaign
 * link, printed QR codes included, to https://localhost/.
 *
 * The real host is in x-forwarded-host, written by the platform and not by
 * the visitor's browser. It is only trusted for building our own addresses,
 * never for a security decision, and it is validated as a bare hostname so a
 * malformed header cannot smuggle anything into a Location line. Locally
 * neither header exists and the request URL is already right, which is what
 * keeps `astro dev` pointing at localhost instead of production.
 */
export function publicOrigin(request: Request, url: URL): URL {
  const host = (request.headers.get('x-forwarded-host') || '').split(',')[0].trim();
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return new URL(url.origin);
  const proto = (request.headers.get('x-forwarded-proto') || '').split(',')[0].trim();
  try {
    return new URL(`${proto === 'http' ? 'http' : 'https'}://${host}`);
  } catch {
    return new URL(url.origin);
  }
}

/**
 * Rate limiting, in memory.
 *
 * Read this before trusting it: the counters live in the memory of one
 * serverless instance. Vercel runs as many instances as it likes and recycles
 * them freely, so a determined client that spreads its requests wide enough
 * gets a fresh allowance on every cold instance. This is a speed bump against
 * a script hammering one endpoint, not a wall, and it is deliberately sized so
 * that no real visitor can ever reach the limit. The moment a Redis or KV
 * binding exists, the same call sites move to it unchanged.
 *
 * The key is a hash of the address, so no plaintext IP is held in memory even
 * for the minute a window lasts. It is salted with a random value this process
 * invented when it started: the counters never outlive the instance either, so
 * the key has nothing to gain from being stable anywhere else, and a key that
 * means nothing outside this process cannot be looked up against a list of
 * addresses. Nothing here is ever written down.
 */
const RATE_SALT = crypto.randomUUID();

type Counter = { count: number; resetAt: number };
const windows = new Map<string, Counter>();
const MAX_WINDOWS = 5000;
let lastSweep = 0;

function sweep(now: number): void {
  if (now - lastSweep < 60_000 && windows.size < MAX_WINDOWS) return;
  lastSweep = now;
  for (const [key, counter] of windows) {
    if (counter.resetAt <= now) windows.delete(key);
  }
  // Still full of live windows means something is flooding us from many
  // addresses. Dropping the table costs one free window each and keeps the
  // instance's memory bounded, which matters more than the counters.
  if (windows.size > MAX_WINDOWS) windows.clear();
}

export async function rateLimit(
  bucket: string,
  ip: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  // No address means no key. Better to record a real visit than to lump
  // every anonymous request into one shared counter.
  if (!ip) return true;
  const now = Date.now();
  sweep(now);
  const key = `${bucket}|${await sha256Hex(`rate|${ip}|${RATE_SALT}`, 24)}`;
  const found = windows.get(key);
  if (!found || found.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  found.count += 1;
  return found.count <= limit;
}

/** Only the hostname of a referrer is kept, and never our own. */
export function referrerHost(referrer: string | null | undefined, self: string): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '');
    return host === self.replace(/^www\./, '') ? null : host;
  } catch {
    return null;
  }
}

/**
 * Everything invisible is removed before a value is stored: the C0 and C1
 * control codes, the zero width and bidi marks, the byte order mark, and the
 * two Unicode line separators. None of them can be typed on purpose by a
 * person asking for a quote, all of them can make one string look like
 * another in the cabinet, in a CSV export or in the WhatsApp message. Real
 * newlines and tabs survive, because a note is allowed to have lines.
 */
const INVISIBLE =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g;

export function clip(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\r\n?/g, '\n').replace(INVISIBLE, '').trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

/**
 * sendBeacon posts text/plain, so the body is parsed by hand either way.
 *
 * The cap is the point of this function. Without it any client could hand a
 * serverless instance a body as large as it cares to send and make it pay for
 * reading it, so the stream is counted as it arrives and abandoned the moment
 * it goes over. A declared content-length over the cap is refused before a
 * single byte is read; a lying or absent one is caught by the counter.
 *
 * Two different nothings come back, and callers are expected to tell them
 * apart. An empty object is a body that was read and held nothing usable: it
 * was empty, or it was not JSON, or it was JSON that is not an object. `null`
 * is a body that went over the cap and was thrown away unread, so nobody can
 * say what was in it. That distinction is the difference between a blank
 * submit and a real enquiry that was lost, and only the second one is worth
 * anybody's attention.
 */
export async function readJson(
  request: Request,
  maxBytes = 16 * 1024
): Promise<Record<string, unknown> | null> {
  try {
    const declared = Number(request.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) return null;

    const stream = request.body;
    let text: string;
    if (stream) {
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        size += value.byteLength;
        if (size > maxBytes) {
          try {
            await reader.cancel();
          } catch {
            /* the client hung up first, which is the same outcome */
          }
          return null;
        }
        chunks.push(value);
      }
      const merged = new Uint8Array(size);
      let at = 0;
      for (const chunk of chunks) {
        merged.set(chunk, at);
        at += chunk.byteLength;
      }
      text = new TextDecoder().decode(merged);
    } else {
      text = await request.text();
      if (text.length > maxBytes) return null;
    }

    if (!text) return {};
    const value = JSON.parse(text);
    // An array is an object to typeof, and every caller here reads named
    // fields, so anything that is not a plain object is treated as nothing.
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuidOrNull(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value : null;
}

/**
 * A path this site could actually have served: rooted, one line, no host and
 * no scheme. Anything else is a client writing whatever it likes into a
 * column the cabinet later shows as a page.
 */
export function pathOrNull(value: unknown, max = 200): string | null {
  const raw = clip(value, max);
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
  return /[\s<>"'\\]/.test(raw) ? null : raw;
}

/** A bare hostname, the only part of a referrer that is ever kept. */
export function hostOrNull(value: unknown, max = 160): string | null {
  const raw = clip(value, max)?.toLowerCase() ?? null;
  if (!raw) return null;
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(raw) ? raw : null;
}

/** A language tag, en, en-IE, pt-BR. Nothing else belongs in that column. */
export function langOrNull(value: unknown): string | null {
  const raw = clip(value, 12);
  if (!raw) return null;
  return /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(raw) ? raw : null;
}

/** A campaign code or utm value: printable, short, no markup, no spaces. */
export function tagOrNull(value: unknown, max: number): string | null {
  const raw = clip(value, max);
  if (!raw) return null;
  return /[<>]/.test(raw) ? null : raw;
}

/** How many digits are in a string. A phone number is judged on this alone. */
export function digitCount(value: string | null): number {
  return value ? (value.match(/\d/g) || []).length : 0;
}

/**
 * A link, a tag or an entity in a field that should hold a person's name or a
 * town. Nobody types those by accident, every form spam script types them.
 */
export function looksInjected(value: string | null): boolean {
  if (!value) return false;
  return /https?:\/\/|www\.|<[a-z/!]|&#\d|\[url|\bhref\s*=|\r|\n/i.test(value);
}
