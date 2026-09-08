/**
 * First-party traffic tracking, under 1 KB, no cookies, no third party, and
 * nothing stored on the device at all.
 *
 * What it sends: the page opened, the site that linked to it, any campaign
 * tags in the address bar, the browser language, and later how long the page
 * stayed on screen. Nothing that identifies a person, and no request to any
 * domain other than this one.
 *
 * What it deliberately does NOT do any more: keep a visit number or the
 * campaign the visit arrived from in sessionStorage. Regulation 5(3) of
 * S.I. 336/2011 covers anything stored on a visitor's device, session
 * storage included, and a visit number for our own statistics is not
 * "strictly necessary" for anything the visitor asked for, so keeping one
 * would have needed a consent banner. Instead the server groups pages into
 * visits itself, from its daily visitor code and a 30 minute rule
 * (src/lib/session.ts), and works out a request's campaign the same way.
 * The browser keeps nothing, so there is nothing to ask consent for.
 *
 * Everything is wrapped so a failure here can never break a page.
 */

function start() {
  // Global Privacy Control is a real opt-out signal, so it is honoured.
  if ((navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
  // The cabinet is not part of the traffic it reports on.
  if (location.pathname.startsWith('/admin')) return;

  const q = new URLSearchParams(location.search);
  // Only the hostname ever leaves the browser. The full referring address
  // can carry a search query or a private group path, and the answer the
  // cabinet needs is just "which website sent this person".
  let ref: string | null = null;
  try {
    const bare = (host: string) => host.replace(/^www\./, '');
    const host = document.referrer ? bare(new URL(document.referrer).hostname) : '';
    ref = host && host !== bare(location.hostname) ? host : null;
  } catch {
    ref = null;
  }

  const payload = {
    t: 'view',
    path: location.pathname,
    lang: navigator.language,
    ref,
    us: q.get('utm_source'),
    um: q.get('utm_medium'),
    uc: q.get('utm_campaign'),
    code: q.get('k'),
  };

  let viewId: number | null = null;
  fetch('/api/track', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((r) => {
      if (r && typeof r.id === 'number') viewId = r.id;
    })
    .catch(() => {});

  // Time on the page means time actually on screen: a tab left open in the
  // background for an hour is not an hour of reading. `onScreen` is tracked
  // by hand rather than read at flush time, because by the moment the
  // visibilitychange handler runs the state has already flipped to hidden
  // and the last visible stretch would be lost.
  let since = performance.now();
  let total = 0;
  let sent = 0;
  let onScreen = document.visibilityState === 'visible';

  const settle = () => {
    if (onScreen) total += performance.now() - since;
    since = performance.now();
  };

  const flush = () => {
    settle();
    const ms = Math.round(total);
    if (!viewId || ms < 1000 || ms - sent < 1000) return;
    sent = ms;
    // The row id lives only in this closure, in memory, for the life of the
    // page. The server checks the beacon against its own visitor code, so a
    // stranger guessing an id cannot rewrite somebody else's row.
    const body = JSON.stringify({ t: 'exit', id: viewId, ms });
    // sendBeacon survives the page going away; fetch would be cancelled.
    if (navigator.sendBeacon) navigator.sendBeacon('/api/track', body);
    else fetch('/api/track', { method: 'POST', body, keepalive: true }).catch(() => {});
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flush();
      onScreen = false;
    } else {
      onScreen = true;
      since = performance.now();
    }
  });
  addEventListener('pagehide', flush);
}

/**
 * WHEN this runs matters as much as what it does. The module is deferred, so
 * it used to fire its POST while the browser was still decoding the hero
 * image and swapping in the webfonts: a request and a JSON parse competing
 * with the first paint, for a number nobody reads in real time.
 *
 * So it waits for the page to be interactive (the load event), and then for
 * the first gap in the main thread. requestIdleCallback carries a timeout,
 * so a permanently busy page still reports within a couple of seconds
 * rather than never.
 *
 * The one thing that must not be lost is a fast bounce, where the visitor
 * leaves before load has even fired. pagehide and a hidden tab therefore
 * boot it immediately, ahead of the idle callback, and `booted` keeps that
 * to a single run whichever gets there first.
 */
let booted = false;
const boot = () => {
  if (booted) return;
  booted = true;
  try {
    start();
  } catch {
    /* analytics must never take the site down with it */
  }
};

const bootWhenIdle = () => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(boot, { timeout: 2000 });
  else setTimeout(boot, 200);
};

if (document.readyState === 'complete') bootWhenIdle();
else addEventListener('load', bootWhenIdle, { once: true });

// A visitor who leaves in the first second is still a visit. Both of these
// fire before the page goes away, and the view POST is sent with keepalive.
addEventListener('pagehide', boot, { once: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') boot();
});

// This file is loaded for its side effect only. The empty export makes it a
// module.
export {};
