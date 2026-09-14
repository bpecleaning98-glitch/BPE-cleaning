type Choice = { version: 1; analytics: 'granted' | 'denied'; expires: number };
const KEY = 'bpe-cookie-consent';
const MAX_AGE = 180 * 24 * 60 * 60 * 1000;
const banner = document.querySelector<HTMLElement>('#cookie-banner')!;
const settings = document.querySelector<HTMLButtonElement>('#cookie-settings')!;
const dismiss = document.querySelector<HTMLButtonElement>('#cookie-dismiss')!;
const id = banner.dataset.gaId || '';
const globals = window as unknown as Record<string, any>;
let choice: Choice | null = null;
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved?.version === 1 && ['granted', 'denied'].includes(saved.analytics) && saved.expires > Date.now() && saved.expires <= Date.now() + MAX_AGE) choice = saved;
} catch { /* No optional storage or tracking when storage is unavailable. */ }
const gpc = Boolean((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl);
const gpcNotice = document.querySelector<HTMLElement>('#cookie-gpc');
if (gpcNotice) gpcNotice.hidden = !gpc;
globals.dataLayer = globals.dataLayer || [];
function gtag(..._args: unknown[]) { globals.dataLayer.push(arguments); }
globals.gtag = gtag;
gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
globals['ga-disable-' + id] = true;

function removeAnalyticsCookies() {
  const host = location.hostname.split('.');
  const domains = ['', location.hostname, ...host.map((_, i) => '.' + host.slice(i).join('.'))];
  for (const part of document.cookie.split(';')) {
    const name = part.trim().split('=')[0];
    if (!/^_ga(?:_|$)/.test(name)) continue;
    for (const domain of domains) document.cookie = `${name}=; Max-Age=0; Path=/;${domain ? ` Domain=${domain};` : ''} SameSite=Lax`;
  }
}
let analyticsStarted = false;
function enableAnalytics() {
  if (analyticsStarted || !/^G-[A-Z0-9]+$/.test(id) || gpc || !['bpecleaning.ie', 'www.bpecleaning.ie'].includes(location.hostname)) return;
  analyticsStarted = true;
  globals['ga-disable-' + id] = false;
  gtag('consent', 'update', { analytics_storage: 'granted' });
  gtag('js', new Date());
  let referrer = '';
  try { referrer = document.referrer ? new URL(document.referrer).origin : ''; } catch { /* Ignore malformed referrers. */ }
  gtag('config', id, {
    allow_google_signals: false, allow_ad_personalization_signals: false,
    cookie_expires: 15552000, cookie_update: false,
    page_location: location.origin + location.pathname,
    page_referrer: referrer,
    send_page_view: true,
  });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.append(script);
}
if (choice?.analytics === 'granted' && !gpc) enableAnalytics();
else removeAnalyticsCookies();
// Withdrawal or expiry must also stop a tag running in another open tab.
addEventListener('storage', event => { if (event.key === KEY) location.reload(); });
if (choice) setTimeout(() => location.reload(), Math.min(choice.expires - Date.now(), 2147483647));
function show(open: boolean) {
  banner.hidden = !open;
  settings.hidden = open;
  settings.setAttribute('aria-expanded', String(open));
  dismiss.hidden = !choice;
}
show(!choice);
settings.addEventListener('click', () => { show(true); banner.querySelector<HTMLButtonElement>('[data-consent]')?.focus(); });
dismiss.addEventListener('click', () => { show(false); settings.focus({ preventScroll: true }); });
banner.addEventListener('keydown', event => { if (event.key === 'Escape' && choice) { show(false); settings.focus({ preventScroll: true }); } });
banner.querySelectorAll<HTMLButtonElement>('[data-consent]').forEach(button => button.addEventListener('click', () => {
  const analytics = button.dataset.consent as Choice['analytics'];
  const next: Choice = { version: 1, analytics, expires: Date.now() + MAX_AGE };
  try { localStorage.setItem(KEY, JSON.stringify(next)); }
  catch { document.querySelector<HTMLElement>('#cookie-storage-error')!.hidden = false; return; }
  choice = next;
  show(false);
  settings.focus({ preventScroll: true });
  if (analytics === 'granted') enableAnalytics();
  else {
    globals['ga-disable-' + id] = true;
    removeAnalyticsCookies();
    // Only withdrawal needs to unload an already-running Google tag.
    if (analyticsStarted) location.reload();
  }
}));

// External embeds have no src until an informed click, including when JavaScript is off.
document.querySelectorAll<HTMLIFrameElement>('iframe[data-external-src]').forEach(frame => {
  frame.hidden = true;
  const placeholder = document.createElement('div');
  placeholder.className = 'external-consent';
  const text = document.createElement('p');
  text.textContent = 'This content is provided by Google or Vimeo. Loading it shares your IP address with the provider and may allow its cookies.';
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = 'Load external content';
  button.addEventListener('click', () => { frame.src = frame.dataset.externalSrc!; frame.hidden = false; placeholder.remove(); });
  const link = document.createElement('a'); link.href = '/cookies/'; link.textContent = 'About external content';
  placeholder.append(text, button, link); frame.before(placeholder);
});
