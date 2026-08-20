# BPE Cleaning Services

Marketing site for BPE Cleaning Services, a cleaning company in Dublin, Ireland, plus the
client cabinet at `/admin`: cookie-free traffic stats, campaign links with QR codes, a blog
that publishes instantly, and the quote requests with the campaign that produced them.

Setup, deployment and the client walkthrough live in **[docs/CABINET-RO.md](docs/CABINET-RO.md)** (Romanian).

## Stack

- Astro 5, static by default. Every marketing page is prerendered HTML.
- React 19 islands, used only for the cabinet.
- Tailwind v4 via `@tailwindcss/vite`, tokens in `src/styles/global.css`.
- `@astrojs/vercel` adapter, for the few routes that opt out of prerendering with
  `export const prerender = false`: `/api/track`, `/api/lead`, `/go/[code]` and the blog.
- Supabase for Postgres, Auth and Storage. Schema and row level security in `supabase/schema.sql`.
- GSAP and Lenis for the motion on the public pages, `marked` for blog content,
  `qrcode` for the campaign QR codes.

## Commands

| Command | What it does |
|---|---|
| `npm install` | install dependencies |
| `npm run dev` | dev server on http://localhost:4380 |
| `npm run build` | production build through the Vercel adapter |
| `npm run preview` | serve the build locally |
| `node scripts/build-icons.mjs` | render favicons, app icons and the social card from the logo artwork |
| `node scripts/build-marks.mjs` | regenerate `src/data/marks.ts` from the designer's logo SVG exports |

`build-marks.mjs` reads its source SVGs from `brand/svg` in the repo, so a new delivery from
the designer goes in that folder and the script is rerun as it is. It needs the four
NEGRU-AURIU exports present.

## Environment

Copy `.env.example` to `.env` and fill it in. Without those values the public site works
unchanged, the cabinet reports that it is not connected, and nothing is tracked.

## Folders

```
src/
  assets/      photos, processed by Astro at build time
  components/  Astro components, home/ per homepage section, brand/ for the logo
    admin/     the React cabinet: AdminApp shell, ui and chart primitives, tabs
  data/        business facts, prices, areas, testimonials, generated logo marks
  layouts/     Base.astro, the shell every public page uses
  lib/         db clients, request helpers, blog reads, shared types
  pages/       routes, plus api/ for collection endpoints and go/ for campaign links
  scripts/     browser scripts: motion, cookie-free tracking
  styles/      global.css, the design tokens
public/        favicons, manifest, social card
brand/         logo artwork from the designer, SVG and PNG
scripts/       node build scripts, not shipped to the browser
supabase/      schema.sql, run it in the Supabase SQL editor
docs/          setup and handover notes
```

## Notes

- Copy rules: no em dash anywhere in visible text, no eyebrow labels in curly braces.
- Prices, service areas and contact details come from `src/data/`, never hardcoded in a component.
- The cabinet is `noindex` and excluded from its own analytics.
