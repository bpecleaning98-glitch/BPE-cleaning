// QR codes for print: business cards, flyers, the van.
//
//   node scripts/build-qr.mjs                     -> points at https://bpecleaning.ie
//   node scripts/build-qr.mjs https://... [name]  -> any other address, e.g. a /go/ link
//
// Writes three designs into brand/qr/, each as a vector SVG for the printer and
// a 2048px PNG for anything that will not take a vector. The files are not kept
// in the repository: they are regenerated from this script whenever they are
// needed, so a QR can never drift away from the address it claims to carry.
//
// Why it draws the modules itself instead of asking the qrcode package for an
// SVG: the artwork needs the brand's own colours, a cleared square for the
// diamond and the real lockup underneath, and none of that survives a generic
// export. The matrix comes from the library, the drawing is ours.
//
// Error correction is fixed at H (30% recoverable), which is what makes the
// cleared centre safe. Do not lower it while a mark sits in the middle.

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'brand', 'qr');

const url = process.argv[2] || 'https://bpecleaning.ie';
const slug = process.argv[3] || 'site';

/** Brand book, page 4. The only three colours the identity uses. */
const BRAND = { ink: '#222223', gold: '#C59A4A', paper: '#ECEBEC' };

/**
 * The marks live in a generated TypeScript file, which this plain script cannot
 * import. The object inside it is written as strict JSON, so it is read out of
 * the source text rather than duplicated here: one copy of the artwork, and it
 * stays the copy the site itself renders.
 */
function readMarks() {
  const source = readFileSync(join(ROOT, 'src', 'data', 'marks.ts'), 'utf8');
  const start = source.indexOf('= {', source.indexOf('export const MARKS')) + 2;
  const end = source.indexOf('\n} as const;');
  if (start < 0 || end < 0) throw new Error('MARKS not found in src/data/marks.ts');
  return JSON.parse(source.slice(start, end + 2));
}

const MARKS = readMarks();

/**
 * A mark, recoloured and placed. The bodies carry their colours as
 * var(--bpe-ink, #222223), which a browser resolves and a printer's software
 * does not, so the variables are flattened to plain hex on the way out.
 */
function placeMark(name, { x, y, width, ink, gold }) {
  const mark = MARKS[name];
  const [vx, vy, vw, vh] = mark.viewBox.split(/\s+/).map(Number);
  const scale = width / vw;
  const body = mark.body
    .replace(/var\(--bpe-ink,\s*#[0-9A-Fa-f]{3,8}\)/g, ink)
    .replace(/var\(--bpe-gold,\s*#[0-9A-Fa-f]{3,8}\)/g, gold);
  return {
    height: vh * scale,
    markup: `<g transform="translate(${x} ${y}) scale(${scale}) translate(${-vx} ${-vy})">${body}</g>`,
  };
}

const CELL = 24; // drawing units per module, so every edge lands on a whole number
const QUIET = 4; // the standard quiet zone, in modules. Less and scanners start to miss it.

/**
 * One design.
 *
 * `clear` is the side of the square knocked out of the middle for the diamond,
 * as a fraction of the code. At 0.2 the mark covers 4% of the modules, well
 * inside what level H can rebuild, and the cleared square is drawn in the
 * background colour so no module is ever half covered.
 */
function draw(matrix, size, { background, module: moduleColour, mark, lockup, clear = 0 }) {
  const side = (size + QUIET * 2) * CELL;
  const rects = [];

  const clearFrom = clear ? Math.floor((size - size * clear) / 2) : -1;
  const clearTo = clear ? Math.ceil((size + size * clear) / 2) : -1;

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (!matrix[row * size + column]) continue;
      const inCleared =
        clear &&
        row >= clearFrom &&
        row < clearTo &&
        column >= clearFrom &&
        column < clearTo;
      if (inCleared) continue;
      const x = (column + QUIET) * CELL;
      const y = (row + QUIET) * CELL;
      rects.push(`M${x} ${y}h${CELL}v${CELL}h-${CELL}z`);
    }
  }

  const parts = [];
  if (background) parts.push(`<rect width="${side}" height="${side}" fill="${background}"/>`);
  parts.push(`<path fill="${moduleColour}" d="${rects.join('')}"/>`);

  let height = side;

  if (mark) {
    // The cleared square gets its own plate, a touch wider than the mark, so a
    // neighbouring module never brushes against the diamond.
    const plate = side * clear * 1.06;
    const plateX = (side - plate) / 2;
    parts.push(
      `<rect x="${plateX}" y="${plateX}" width="${plate}" height="${plate}" fill="${background || '#FFFFFF'}"/>`,
    );
    const width = side * clear * 0.82;
    const placed = placeMark('symbol', {
      x: (side - width) / 2,
      y: (side - width) / 2,
      width,
      ink: mark.ink,
      gold: mark.gold,
    });
    parts.push(placed.markup);
  }

  if (lockup) {
    const width = side * 0.52;
    const gap = CELL * 2;
    const placed = placeMark('horizontal', {
      x: (side - width) / 2,
      y: side + gap,
      width,
      ink: lockup.ink,
      gold: lockup.gold,
    });
    height = side + gap + placed.height + CELL * QUIET;
    // The background has to grow with the artwork, or the lockup sits on nothing.
    if (background) {
      parts[0] = `<rect width="${side}" height="${height}" fill="${background}"/>`;
    }
    parts.push(placed.markup);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${height}" width="${side}" height="${height}">${parts.join('')}</svg>`;
}

const qr = QRCode.create(url, { errorCorrectionLevel: 'H' });
const matrix = qr.modules.data;
const size = qr.modules.size;

const designs = [
  {
    name: 'plain',
    note: 'Ink on nothing. The safest one: any printer, any surface, no assumptions.',
    svg: draw(matrix, size, { background: null, module: BRAND.ink }),
  },
  {
    name: 'paper',
    note: 'Ink on paper, diamond in the middle, lockup underneath. The business card one.',
    svg: draw(matrix, size, {
      background: BRAND.paper,
      module: BRAND.ink,
      clear: 0.2,
      mark: { ink: BRAND.ink, gold: BRAND.gold },
      lockup: { ink: BRAND.ink, gold: BRAND.gold },
    }),
  },
  {
    name: 'ink',
    note: 'Paper on ink, for the dark side of the card. Test this one on a phone before printing a thousand.',
    svg: draw(matrix, size, {
      background: BRAND.ink,
      module: BRAND.paper,
      clear: 0.2,
      mark: { ink: BRAND.paper, gold: BRAND.gold },
      lockup: { ink: BRAND.paper, gold: BRAND.gold },
    }),
  },
];

mkdirSync(OUT, { recursive: true });

for (const design of designs) {
  const base = join(OUT, `bpe-qr-${slug}-${design.name}`);
  writeFileSync(`${base}.svg`, design.svg);
  await sharp(Buffer.from(design.svg), { density: 600 })
    .resize({ width: 2048 })
    .png()
    .toFile(`${base}.png`);
  console.log(`${design.name}: ${base}.svg + .png`);
}

writeFileSync(
  join(OUT, 'README.md'),
  `# QR codes

Generated by \`node scripts/build-qr.mjs\`. Not committed: rerun the script instead of
editing a file here, so the picture and the address can never disagree.

Address in these files: ${url}

${designs.map((d) => `- **${d.name}**: ${d.note}`).join('\n')}

Printing notes:

- Keep the empty border. It is part of the code, not a margin, and a design that
  crops it tight is a code that stops scanning.
- Do not stretch. Same width and height, always.
- Smallest safe print is about 25mm across for a card held in the hand. Below that,
  cheap cameras start to miss it.
- Test the printed piece with two phones, one of them not new, before a print run.
- The dark variant reads as an inverted code. Modern phones handle it, older
  scanners sometimes do not, which is why the plain one exists.

To point a code at a campaign link instead of the homepage, create the link in the
cabinet (Campaign links) and pass it in:

    node scripts/build-qr.mjs https://bpecleaning.ie/go/card card
`,
);

console.log(`\nAddress: ${url}\nFolder:  brand/qr/`);
