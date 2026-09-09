// Static hero variants for the pages astro:assets cannot serve.
//
// /blog/ is rendered on the server (prerender = false, the posts come from
// Supabase). On such a page <Image> emits no files at build time: it points
// at the runtime endpoint /_image?href=..., and on Vercel that endpoint
// answers 404, so the blog header showed its alt text instead of the room.
// Every other page is prerendered and gets real files, which is why only the
// blog was affected.
//
// So this writes the same responsive set Astro would have produced, as plain
// files under public/hero/, and HeroPhoto renders them with a plain <img>.
// Run it again whenever a frame in src/assets/ai/ changes:
//   node scripts/build-hero-static.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SETS = [{ from: 'src/assets/ai/hero-blog.jpg', to: 'public/hero/blog' }];
const WIDTHS = [480, 768, 1280, 1600];
const QUALITY = 76; // same as HeroPhoto's <Image quality={76}>

mkdirSync('public/hero', { recursive: true });
for (const { from, to } of SETS) {
  for (const w of WIDTHS) {
    const out = `${to}-${w}.webp`;
    const info = await sharp(from).resize({ width: w }).webp({ quality: QUALITY }).toFile(out);
    console.log(`${out}  ${info.width}x${info.height}  ${(info.size / 1024).toFixed(0)}kB`);
  }
}
