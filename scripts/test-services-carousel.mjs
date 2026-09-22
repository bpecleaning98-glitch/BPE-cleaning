import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const component = readFileSync(new URL('../src/components/home/ServicesGrid.astro', import.meta.url), 'utf8');
const source = ts.transpileModule(component.split('<script>')[1].split('</script>')[0], {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function setup(reduced = false) {
  const element = () => {
    const classes = new Set();
    return {
      dataset: {}, offsetWidth: 300, style: { setProperty(k, v) { this[k] = v; } },
      classList: { toggle(k, on) { on ? classes.add(k) : classes.delete(k); }, contains: k => classes.has(k) },
      addEventListener(k, fn) { this[k] = fn; },
    };
  };
  const cards = Array.from({ length: 6 }, element);
  const captions = Array.from({ length: 6 }, element);
  const prev = element(), next = element(), listeners = {}, timers = [];
  let now = 0;
  const root = { offsetWidth: 1600, querySelectorAll: selector => ({
    '.svc-card': cards, '[data-caption]': captions,
    '[data-svc-prev]': [prev], '[data-svc-next]': [next],
  })[selector] };
  vm.runInNewContext(source, {
    document: { querySelector: () => root }, matchMedia: () => ({ matches: reduced }),
    addEventListener: (event, fn) => { listeners[event] = fn; },
    setTimeout: (fn, ms) => { timers.push({ fn, at: now + ms }); },
  });
  function check() {
    assert.equal(cards.filter(c => c.style.opacity === '1').length, 5, 'five cards must remain visible');
    const centre = cards.findIndex(c => c.classList.contains('is-active'));
    assert(centre >= 0 && cards[centre].style.opacity === '1', 'centre must never disappear');
    assert.equal(cards.filter(c => c.classList.contains('is-active')).length, 1);
    assert.equal(captions.findIndex(c => c.classList.contains('active')), centre, 'caption must match image');
    assert.equal(captions.filter(c => !c.inert).length, 1);
    assert.equal(cards.filter(c => c.tabIndex === 0).length, 1);
    assert.equal(new Set(cards.map(c => c.dataset.d)).size, 6, 'no stacked cards');
    assert(timers.length <= 1, 'only one animation may own the row');
    return centre;
  }
  function advance(ms) {
    const until = now + ms;
    while (timers.length && timers[0].at <= until) {
      const timer = timers.shift(); now = timer.at; timer.fn(); check();
    }
    now = until;
  }
  return { cards, prev, next, timers, listeners, check, advance };
}

for (const direction of ['prev', 'next']) {
  const s = setup();
  for (let i = 1; i <= 24; i++) {
    s[direction].click();
    assert.equal(s.check(), direction === 'next' ? i % 6 : (6 - i % 6) % 6);
    s.advance(600);
  }
}
const burst = setup();
for (let i = 0; i < 100; i++) { burst.prev.click(); burst.check(); burst.advance(40); }
burst.advance(1200);
assert.equal(burst.timers.length, 0, 'burst must settle without a long backlog');
const reversal = setup();
for (let i = 0; i < 40; i++) {
  reversal[i % 2 ? 'prev' : 'next'].click();
  reversal.cards.forEach(c => { c.offsetWidth = 260 + i; });
  reversal.listeners.resize(); reversal.check(); reversal.advance(100);
}
reversal.advance(1200);
assert.equal(reversal.timers.length, 0);
const reduced = setup(true);
for (let i = 0; i < 30; i++) { reduced.prev.click(); reduced.check(); }
assert.equal(reduced.timers.length, 0, 'reduced motion is immediate');
console.log('Carousel checks passed: both directions, repeated wraps, 100 rapid clicks, reversals, resize and reduced motion.');
