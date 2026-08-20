// Turn the designer's export SVGs into one clean TS module.
// The exports carry <style> blocks with generic .cls-1 / .cls-2 class names,
// which collide the moment two logos sit on the same page. Every shape gets
// its colour inlined as a CSS variable instead, so a single component can
// render the mark in brand colours, in currentColor, or in the site palette.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// The designer's two-tone masters, copied into the repo at brand/svg. The
// rest of that pack (AI, EPS, PDF, mockups, the guidelines PDF) stays in the
// original zip; only these four files decide what the site renders.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = `${ROOT}brand/svg`;

const FILES = {
  symbol: `${SRC}/S NEGRU-AURIU.svg`,
  horizontal: `${SRC}/LPO NEGRU-AURIU.svg`,
  vertical: `${SRC}/LSV NEGRU-AURIU.svg`,
  wordmark: `${SRC}/LST NEGRU-AURIU.svg`,
};

const GOLD = '#c59a4a';
const INK = '#222223';

function convert(file) {
  const raw = readFileSync(file, 'utf8');

  const viewBox = raw.match(/viewBox="([^"]+)"/)[1];

  // .cls-N { fill: #hex; } -> which class paints gold, which paints ink
  const roleOf = {};
  for (const m of raw.matchAll(/\.(cls-\d+)\s*\{\s*fill:\s*(#[0-9a-fA-F]{6});?\s*\}/g)) {
    const hex = m[2].toLowerCase();
    roleOf[m[1]] = hex === GOLD ? 'gold' : hex === INK ? 'ink' : null;
    if (!roleOf[m[1]]) throw new Error(`Unexpected fill ${hex} in ${file}`);
  }
  if (!Object.keys(roleOf).length) throw new Error(`No class rules in ${file}`);

  // Body = everything inside the root <svg>, minus <defs> (only holds the
  // style block) and minus the wrapper <g id="Layer_1"> ids.
  let body = raw.slice(raw.indexOf('>', raw.indexOf('<svg')) + 1, raw.lastIndexOf('</svg>'));
  body = body.replace(/<defs>[\s\S]*?<\/defs>/g, '');
  body = body.replace(/\s(id|data-name)="[^"]*"/g, '');

  body = body.replace(/class="(cls-\d+)"/g, (_, cls) => {
    const role = roleOf[cls];
    // Fallback hex keeps the file correct anywhere the vars are not defined
    // (an <img src="...svg">, a mail client, a downloaded asset).
    return `class="bpe-${role}" fill="var(--bpe-${role}, ${role === 'gold' ? '#C59A4A' : '#222223'})"`;
  });

  // Collapse whitespace between tags, keep the point data untouched.
  body = body.replace(/>\s+</g, '><').trim();

  const inkCount = (body.match(/bpe-ink/g) || []).length;
  const goldCount = (body.match(/bpe-gold/g) || []).length;
  return { viewBox, body, inkCount, goldCount };
}

const out = {};
for (const [name, file] of Object.entries(FILES)) {
  out[name] = convert(file);
  const { viewBox, inkCount, goldCount, body } = out[name];
  console.log(`${name.padEnd(11)} viewBox=${viewBox.padEnd(22)} ink=${inkCount} gold=${goldCount} ${body.length}b`);
}

/**
 * A fifth lockup that the designer did not ship, because it only makes sense
 * on screen: the wordmark's BPE with the CLEANING SERVICES line removed, for
 * the giant cropped sign-off at the foot of the site. Taking the ink shapes
 * out of the typographic logo keeps the exact letterforms of the identity.
 *
 * The tight box is measured rather than guessed: render the ink shapes on
 * their own, let sharp trim the transparent margin, and read the offsets
 * back. Guessed numbers would leave the letters off centre in the crop.
 */
async function bpeOnly(wordmark) {
  const inkOnly = wordmark.body
    .split(/(?=<)/)
    .filter((chunk) => !chunk.includes('bpe-gold'))
    .join('');

  const [, , vw, vh] = wordmark.viewBox.split(' ').map(Number);
  const SCALE = 4; // sub-unit precision on the trim, at a trivial cost
  const png = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${wordmark.viewBox}" ` +
        `width="${Math.round(vw * SCALE)}" height="${Math.round(vh * SCALE)}">${inkOnly}</svg>`,
    ),
  )
    .trim({ threshold: 1 })
    .toBuffer({ resolveWithObject: true });

  const { info } = png;
  const round = (n) => Math.round(n * 100) / 100;
  const box = [
    round(-info.trimOffsetLeft / SCALE),
    round(-info.trimOffsetTop / SCALE),
    round(info.width / SCALE),
    round(info.height / SCALE),
  ];

  return { viewBox: box.join(' '), body: inkOnly };
}

out.wordmarkBpe = await bpeOnly(out.wordmark);
console.log(
  `${'wordmarkBpe'.padEnd(11)} viewBox=${out.wordmarkBpe.viewBox.padEnd(22)} cropped from wordmark`,
);

const ts = `// GENERATED from the designer's brand pack (BPE - Cleaning Services.zip,
// received 16 Aug 2026). Do not hand-edit: rerun scripts/build-marks.mjs.
//
// Every shape carries its colour as a CSS variable with the brand hex as the
// fallback, so one markup can render three ways:
//   brand  -> --bpe-ink: #222223, --bpe-gold: #C59A4A  (the brand book)
//   site   -> the page palette's ink and bronze
//   mono   -> both vars set to currentColor
// The generic .cls-1 / .cls-2 classes from the export are gone, which is what
// made it safe to inline more than one lockup on the same page.
export type MarkName = 'symbol' | 'horizontal' | 'vertical' | 'wordmark' | 'wordmarkBpe';

export const MARKS: Record<MarkName, { viewBox: string; body: string }> = ${JSON.stringify(
  Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { viewBox: v.viewBox, body: v.body }])),
  null,
  2,
)} as const;

/** Brand book, page 4. The only three colours the identity uses. */
export const BRAND = {
  ink: '#222223',
  gold: '#C59A4A',
  paper: '#ECEBEC',
} as const;
`;

const dest = `${ROOT}src/data/marks.ts`;
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, ts);
console.log('\nwrote', dest, `(${ts.length} bytes)`);
