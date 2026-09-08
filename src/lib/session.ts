import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Visits, worked out on the server and nowhere else.
 *
 * A "visit" (a session, in the cabinet's words) used to be a random number
 * the browser kept in sessionStorage and sent with every page. That number
 * was information stored on the visitor's device for our own statistics,
 * which Regulation 5(3) of S.I. 336/2011 only allows with consent, and the
 * site would rather have no banner than a banner for a counter. So the
 * browser now keeps nothing, and the visit is reconstructed here the way
 * cookie-free analytics tools do it: the daily visitor code from
 * request.ts, plus a rule that two pages from the same code closer together
 * than SESSION_GAP_MS belong to the same visit.
 *
 * Two consequences worth knowing:
 *
 *   - Without ANALYTICS_SALT there is no visitor code, so nothing can be
 *     grouped and every page counts as its own visit. The cabinet's session
 *     count then equals its page view count. The salt is documented as
 *     required in .env.example for exactly this reason.
 *   - Two people behind one address with the same browser on the same day
 *     share a code, and so can share a visit. That is the same blur the
 *     unique visitor count already accepts, and it errs towards counting
 *     fewer people, never more.
 */

/** Two pages from one daily code closer together than this are one visit. */
export const SESSION_GAP_MS = 30 * 60 * 1000;

/** What the first page of a visit tells us about where the visit came from. */
export type Attribution = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  link_code: string | null;
  referrer_host: string | null;
  landing_path: string | null;
};

export const NO_ATTRIBUTION: Attribution = {
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  link_code: null,
  referrer_host: null,
  landing_path: null,
};

/**
 * The visit a request belongs to, if one is already under way: the session
 * id of the most recent page view from this visitor code inside the gap.
 * Null when there is no code, or when the last page from it is older than
 * the gap, which is how a new visit begins.
 */
export async function currentSession(
  db: SupabaseClient,
  visitorHash: string | null,
  now: number = Date.now()
): Promise<string | null> {
  if (!visitorHash) return null;
  const since = new Date(now - SESSION_GAP_MS).toISOString();
  const { data, error } = await db
    .from('page_views')
    .select('session_id')
    .eq('visitor_hash', visitorHash)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const id = (data as { session_id?: unknown }).session_id;
  return typeof id === 'string' && id ? id : null;
}

/**
 * Where a visit came from: the campaign tags, the referring site and the
 * landing page of its FIRST page view. This is what a quote request is
 * credited to, and it is read from the server's own records rather than
 * from anything the browser claims at the moment of sending.
 */
export async function entryOf(db: SupabaseClient, sessionId: string): Promise<Attribution | null> {
  const { data, error } = await db
    .from('page_views')
    .select('path, referrer_host, utm_source, utm_medium, utm_campaign, link_code')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const str = (value: unknown) => (typeof value === 'string' && value ? value : null);
  return {
    utm_source: str(row.utm_source),
    utm_medium: str(row.utm_medium),
    utm_campaign: str(row.utm_campaign),
    link_code: str(row.link_code),
    referrer_host: str(row.referrer_host),
    landing_path: str(row.path),
  };
}
