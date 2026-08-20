// Favicons, app icons and the social card, all rendered from the real logo.
// Run: node scripts/build-icons.mjs
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BRAND = { gold: '#C59A4A', ink: '#222223' };
const NIGHT = '#14110D'; // the site's own near-black, what every page opens with
const CREAM = '#EFEAE0';

const root = fileURLToPath(new URL('..', import.meta.url));
const marks = readFileSync(`${root}src/data/marks.ts`, 'utf8');

/** Pull one lockup back out of the generated module. */
function mark(name) {
  const block = marks.split(`"${name}": {`)[1];
  const viewBox = block.match(/"viewBox":\s*"([^"]+)"/)[1];
  const body = JSON.parse('"' + block.match(/"body":\s*"((?:[^"\\]|\\.)*)"/)[1] + '"');
  const [, , w, h] = viewBox.split(' ').map(Number);
  return { viewBox, body, w, h };
}

/** A standalone SVG string with the colour variables resolved. */
function svg(name, { ink, gold, width, height }) {
  const m = mark(name);
  const body = m.body
    .replaceAll('var(--bpe-ink, #222223)', ink)
    .replaceAll('var(--bpe-gold, #C59A4A)', gold);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${m.viewBox}" width="${width}" height="${height}">${body}</svg>`;
}

function fit(name, box) {
  const m = mark(name);
  const s = Math.min(box / m.w, box / m.h);
  return { width: Math.round(m.w * s), height: Math.round(m.h * s) };
}

mkdirSync(`${root}public`, { recursive: true });

// 1. favicon.svg. All gold, single colour: a tab strip can be light or dark
//    and the ink half of the two-tone version would vanish on the dark one.
const faviconBox = fit('symbol', 512);
writeFileSync(
  `${root}public/favicon.svg`,
  svg('symbol', { ink: BRAND.gold, gold: BRAND.gold, ...faviconBox }),
);

// 2. App icons. The mark sits on the brand's near-black at 66% of the tile,
//    which is roughly the safe area every launcher crops to.
async function tile(size, out, pad = 0.66) {
  const box = fit('symbol', Math.round(size * pad));
  const art = Buffer.from(svg('symbol', { ink: BRAND.gold, gold: BRAND.gold, ...box }));
  await sharp({
    create: { width: size, height: size, channels: 4, background: NIGHT },
  })
    .composite([{ input: await sharp(art).png().toBuffer(), gravity: 'centre' }])
    .png()
    .toFile(`${root}public/${out}`);
}

// 3. Social card. The horizontal lockup on night over the client's tagline,
//    closed by the gold rule the site uses as its one piece of structure.
async function socialCard() {
  const W = 1200;
  const H = 630;
  const box = fit('horizontal', 560);
  const gap = 74; // between the baseline of the lockup and the tagline
  const stack = box.height + gap;
  const top = Math.round((H - stack) / 2);

  const art = Buffer.from(svg('horizontal', { ink: CREAM, gold: BRAND.gold, ...box }));
  const tagline = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${gap}">` +
      `<text x="${W / 2}" y="52" text-anchor="middle" fill="${BRAND.gold}"` +
      ` font-family="Avenir Next, Avenir, Helvetica Neue, Helvetica, sans-serif"` +
      ` font-size="27" letter-spacing="6.5">WHERE CLEAN MEETS PERFECTION</text></svg>`,
  );
  const rule = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="5"><rect width="${W}" height="5" fill="${BRAND.gold}"/></svg>`,
  );

  await sharp({ create: { width: W, height: H, channels: 4, background: NIGHT } })
    .composite([
      { input: await sharp(art).png().toBuffer(), top, left: Math.round((W - box.width) / 2) },
      { input: await sharp(tagline).png().toBuffer(), top: top + box.height, left: 0 },
      { input: await sharp(rule).png().toBuffer(), top: H - 5, left: 0 },
    ])
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(`${root}public/og-image.jpg`);
}

await tile(180, 'apple-touch-icon.png', 0.62);
await tile(192, 'icon-192.png');
await tile(512, 'icon-512.png');
await socialCard();

// 4. Web app manifest, so an installed shortcut carries the identity too.
writeFileSync(
  `${root}public/site.webmanifest`,
  JSON.stringify(
    {
      name: 'BPE Cleaning Services',
      short_name: 'BPE Cleaning',
      description: 'Premium cleaning for homes, offices and Airbnb properties across Dublin.',
      start_url: '/',
      display: 'standalone',
      background_color: NIGHT,
      theme_color: NIGHT,
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
    },
    null,
    2,
  ) + '\n',
);

console.log('icons written to public/');
