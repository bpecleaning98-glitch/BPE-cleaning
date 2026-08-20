import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';

// Still a static site: every marketing page is prerendered at build time and
// served as plain HTML, exactly as before. The adapter only exists for the
// handful of routes that must run per request, each opting in with
// `export const prerender = false`:
//   /api/*        analytics collection, lead capture
//   /go/[code]    campaign link redirects
//   /blog/*       so a new article is live the second it is published,
//                 as server-rendered HTML, with no rebuild in between
//   /sitemap.xml  because it has to include those articles
export default defineConfig({
  site: 'https://bpecleaning.ie',
  trailingSlash: 'ignore',
  integrations: [react()],
  adapter: vercel(),
  vite: {
    plugins: [tailwindcss()],
  },
});
