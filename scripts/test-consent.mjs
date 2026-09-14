import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../src/scripts/consent.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const now = Date.now();
const saved = analytics => JSON.stringify({ version: 1, analytics, expires: now + 86400000 });
function run({ value = null, gpc = false, hostname = 'bpecleaning.ie', unavailable = false } = {}) {
  const handlers = new Map(); const appended = []; const deleted = [];
  const element = (dataset = {}) => ({ dataset, hidden: true, setAttribute() {}, focus() {}, addEventListener(name, fn) { this[name] = fn; }, append() {}, before() {}, remove() {} });
  const accept = element({ consent: 'granted' }); const refuse = element({ consent: 'denied' });
  const banner = element({ gaId: 'G-TEST123' });
  banner.querySelectorAll = () => [accept, refuse]; banner.querySelector = () => refuse;
  const settings = element(); const dismiss = element(); const error = element();
  const elements = { '#cookie-banner': banner, '#cookie-settings': settings, '#cookie-dismiss': dismiss, '#cookie-storage-error': error };
  const document = { referrer: 'https://example.com/private?email=secret', querySelector: s => elements[s], querySelectorAll: () => [], createElement: () => element(), head: { append: node => appended.push(node) } };
  Object.defineProperty(document, 'cookie', { get: () => '_ga=123; _ga_TEST123=456; other=keep', set: v => deleted.push(v) });
  const location = { hostname, origin: `https://${hostname}`, pathname: '/quote/', search: '?email=private', reload: () => { location.reloaded = true; } };
  const storage = { value, getItem() { if (unavailable) throw Error(); return this.value; }, setItem(k, v) { if (unavailable) throw Error(); this.value = v; } };
  const window = {};
  vm.runInNewContext(source, { window, document, location, navigator: { globalPrivacyControl: gpc }, localStorage: storage, URL, Date, setTimeout() {}, addEventListener: (k, fn) => handlers.set(k, fn) });
  return { window, appended, deleted, banner, accept, refuse, settings, location, storage, error, handlers };
}
for (const options of [{}, { value: saved('denied') }, { value: '{bad json' }, { value: JSON.stringify({version: 1, analytics: 'granted', expires: now - 1}) }, { value: saved('granted'), gpc: true }, { value: saved('granted'), hostname: '127.0.0.1' }, { unavailable: true }]) {
  assert.equal(run(options).appended.length, 0, `must not load Google: ${JSON.stringify(options)}`);
}
const accepted = run({ value: saved('granted') });
assert.equal(accepted.appended.length, 1);
assert.match(accepted.appended[0].src, /^https:\/\/www.googletagmanager.com\/gtag\/js\?id=G-TEST123$/);
const config = accepted.window.dataLayer.find(v => v[0] === 'config')[2];
assert.equal(config.page_location, 'https://bpecleaning.ie/quote/');
assert.equal(config.page_referrer, 'https://example.com');
assert.equal(config.allow_google_signals, false);
assert.equal(config.allow_ad_personalization_signals, false);
assert.equal(accepted.window.dataLayer[0][2].ad_user_data, 'denied');
accepted.refuse.click();
assert.equal(JSON.parse(accepted.storage.value).analytics, 'denied');
assert.equal(accepted.window['ga-disable-G-TEST123'], true);
assert.equal(accepted.location.reloaded, true);
assert(accepted.deleted.every(cookie => cookie.startsWith('_ga')));
const first = run(); first.accept.click(); assert.equal(JSON.parse(first.storage.value).analytics, 'granted'); assert.equal(first.location.reloaded, true);
const blocked = run({ unavailable: true }); blocked.accept.click(); assert.equal(blocked.error.hidden, false); assert.equal(blocked.appended.length, 0);
const otherTab = run({value: saved('granted')}); otherTab.handlers.get('storage')({key:'bpe-cookie-consent'}); assert.equal(otherTab.location.reloaded, true);
console.log('Consent checks passed: default, refusal, acceptance, expiry, corrupt/blocked storage, GPC, local preview, query redaction, withdrawal and cross-tab withdrawal.');
