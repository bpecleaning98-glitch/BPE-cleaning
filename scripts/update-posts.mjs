/**
 * One-off: rewrites the three articles of 1 Nov 2026 in the posts table
 * during the Vercel build, where the service role key lives. It updates by
 * slug and never creates a row, so a missing article is reported, not
 * invented. published_at is left alone; updated_at moves, which is what the
 * article's dateModified reads. Without the key (local builds) it only
 * reports and the build goes on. Removed again once the change is live.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const url = (process.env.PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const dir = path.resolve('scripts/update-posts');
const dry = process.argv.includes('--dry');

function parse(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error('missing front matter');
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(': ');
    if (i > 0) meta[line.slice(0, i)] = line.slice(i + 2).trim();
  }
  return {
    slug: meta.slug,
    fields: {
      title: meta.title,
      excerpt: meta.excerpt,
      content: m[2].trim(),
      cover_url: meta.cover_url || null,
      cover_alt: meta.cover_alt || '',
      tags: (meta.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
      seo_title: meta.seo_title || '',
      seo_description: meta.seo_description || '',
      updated_at: new Date().toISOString(),
    },
  };
}

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

for (const file of (await readdir(dir)).filter((f) => f.endsWith('.md')).sort()) {
  const { slug, fields } = parse(await readFile(path.join(dir, file), 'utf8'));
  if (dry) {
    console.log(`[update-posts] ${slug}: ${fields.content.split(/\s+/).length} words, cover ${fields.cover_url}, desc ${[...fields.seo_description].length}ch`);
    continue;
  }
  if (!url || !key) {
    console.log(`[update-posts] ${slug}: no service key here, skipped`);
    continue;
  }
  const res = await fetch(`${url}/rest/v1/posts?slug=eq.${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(fields),
  });
  const rows = res.ok ? await res.json() : [];
  console.log(`[update-posts] ${slug}: ${res.ok ? (rows.length ? 'updated' : 'NOT FOUND, nothing changed') : `failed ${res.status} ${await res.text()}`}`);
}
