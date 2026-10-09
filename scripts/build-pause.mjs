import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const { enabled } = JSON.parse(await read('site-pause.json'));

// A fresh Astro build still contains the complete site. Only the public
// routing changes; disabling this flag and rebuilding restores every page.
if (enabled) {
  let html = await read('src/maintenance/page.html');
  const assets = {
    MANROPE: ['node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2', 'font/woff2'],
    FRAUNCES: ['node_modules/@fontsource-variable/fraunces/files/fraunces-latin-opsz-normal.woff2', 'font/woff2'],
    FRAUNCES_ITALIC: ['node_modules/@fontsource-variable/fraunces/files/fraunces-latin-opsz-italic.woff2', 'font/woff2'],
    LOGO: ['brand/svg/LPO NEGRU-AURIU.svg', 'image/svg+xml'],
  };
  for (const [name, [path, mime]] of Object.entries(assets)) {
    const data = await readFile(new URL(path, root));
    html = html.replaceAll(`{{${name}}}`, `data:${mime};base64,${data.toString('base64')}`);
  }
  if (/\{\{[A-Z_]+\}\}/.test(html)) throw new Error('Unresolved pause-page asset');
  await writeFile(new URL('.vercel/output/static/__site-pause.html', root), html);

  const config = JSON.parse(await read('.vercel/output/config.json'));
  // Run before the filesystem: static pages, blog routes, campaign links,
  // unknown URLs and API writes must all pause. Keep the existing cabinet,
  // its bundled assets and the site's identity/verification files reachable.
  config.routes.unshift({
    src: '^/(?!admin(?:/|$)|_astro/|favicon\\.svg$|icon-(?:192|512)\\.png$|apple-touch-icon\\.png$|site\\.webmanifest$|google[a-z0-9]+\\.html$).*',
    dest: '/__site-pause.html',
    status: 503,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
      'Retry-After': '3600',
    },
  });
  await writeFile(new URL('.vercel/output/config.json', root), JSON.stringify(config, null, 2) + '\n');
  console.log('Public website paused (HTTP 503); existing site and cabinet preserved.');
}
