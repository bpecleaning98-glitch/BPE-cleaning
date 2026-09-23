// Static hero variants for the server-rendered blog index and article pages.
//
// The blog reads live posts from Supabase, so Astro cannot pre-generate the
// image variants for these routes. HeroPhoto therefore reads plain files
// under public/hero/ instead. Run this after changing either source frame:
//   node scripts/build-hero-static.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SETS = [
  { from: 'src/assets/ai/hero-blog.jpg', to: 'public/hero/blog' },
  { from: 'src/assets/ai/hero-blog-article.jpg', to: 'public/hero/blog-article' },
];
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
