import type { APIRoute } from 'astro';
import { dbAdmin } from '../../lib/db';
import { deviceOf, isBot, placeOf, referrerHost } from '../../lib/request';

export const prerender = false;

/**
 * Campaign links: bpecleaning.ie/go/facebook-oct
 *
 * One short address per channel, printed on a flyer or pasted into a post.
 * It records the click and forwards to the real page carrying the campaign
 * tags, so every visit and every quote request that follows can be traced
 * back to where it came from.
 *
 * A link that has expired or been switched off is NOT a dead end: it still
 * lands on the homepage, and the click is recorded as expired. A flyer that
 * is already printed keeps working forever, it just stops being credited to
 * a finished campaign.
 */
export const GET: APIRoute = async ({ params, request, url, redirect }) => {
  const code = (params.code || '').toLowerCase().slice(0, 60);
  const home = new URL('/', url).toString();
  if (!dbAdmin || !code) return redirect(home, 302);

  const { data: link } = await dbAdmin
    .from('link_campaigns')
    .select('id, code, destination, utm_source, utm_medium, utm_campaign, expires_at, active')
    .eq('code', code)
    .maybeSingle();

  const expired =
    !link || !link.active || (link.expires_at ? new Date(link.expires_at) < new Date() : false);

  let target = home;
  if (link && !expired) {
    const destination = new URL(link.destination || '/', url);
    if (link.utm_source) destination.searchParams.set('utm_source', link.utm_source);
    if (link.utm_medium) destination.searchParams.set('utm_medium', link.utm_medium);
    if (link.utm_campaign) destination.searchParams.set('utm_campaign', link.utm_campaign);
    destination.searchParams.set('k', link.code);
    target = destination.toString();
  }

  const ua = request.headers.get('user-agent') || '';
  if (!isBot(ua)) {
    const { country, city } = placeOf(request.headers);
    await dbAdmin.from('link_clicks').insert({
      link_id: link?.id ?? null,
      code,
      referrer_host: referrerHost(request.headers.get('referer'), url.hostname),
      country,
      city,
      device: deviceOf(ua),
      status: !link ? 'unknown' : expired ? 'expired' : 'ok',
    });
  }

  return redirect(target, 302);
};
