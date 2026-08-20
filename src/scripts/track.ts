/**
 * First-party traffic tracking, ~1 KB, no cookies, no third party.
 *
 * What it sends: the page opened, where the visit came from the first time
 * it landed, and how long each page stayed on screen. Nothing that
 * identifies a person, nothing stored on the device beyond the tab session,
 * no request to any domain other than this one. That is what keeps the site
 * free of a cookie banner.
 *
 * Everything is wrapped so a failure here can never break a page.
 */

type Attribution = {
  us: string | null;
  um: string | null;
  uc: string | null;
  code: string | null;
  ref: string | null;
  landing: string;
};

declare global {
  interface Window {
    __bpeAttr?: Attribution & { sid: string };
  }
}

const KEY_SID = 'bpe_sid';
const KEY_ATTR = 'bpe_attr';

function start() {
  // Global Privacy Control is a real opt-out signal, so it is honoured.
  if ((navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
  // The cabinet is not part of the traffic it reports on.
  if (location.pathname.startsWith('/admin')) return;

  // One session per tab, gone when the tab closes. Never written to disk.
  let sid = sessionStorage.getItem(KEY_SID);
  const isEntry = !sid;
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem(KEY_SID, sid);
  }

  // Attribution is captured once, on the page the visit started at, and then
  // reused for the rest of the session. Otherwise every internal click would
  // overwrite "came from Facebook" with "came from our own homepage".
  let attr: Attribution;
  const stored = sessionStorage.getItem(KEY_ATTR);
  if (stored) {
    attr = JSON.parse(stored) as Attribution;
  } else {
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
    attr = {
      us: q.get('utm_source'),
      um: q.get('utm_medium'),
      uc: q.get('utm_campaign'),
      code: q.get('k'),
      ref,
      landing: location.pathname,
    };
    sessionStorage.setItem(KEY_ATTR, JSON.stringify(attr));
  }
  window.__bpeAttr = { ...attr, sid };

  const payload = {
    t: 'view',
    sid,
    path: location.pathname,
    entry: isEntry,
    lang: navigator.language,
    ...attr,
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
 * image and swapping in the webfonts: a request, a JSON parse and a
 * sessionStorage round trip competing with the first paint, for a number
 * nobody reads in real time.
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
// module, which is what lets the `declare global` block above be legal.
export {};
