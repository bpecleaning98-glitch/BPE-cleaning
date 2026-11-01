/**
 * One-off: publishes the articles in scripts/seed-posts/ into the posts table
 * during the Vercel build, where the service role key lives. An article whose
 * slug already exists is left untouched, so repeated builds change nothing.
 * Without the key (local builds) it only reports and the build goes on.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const url = (process.env.PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const dir = path.resolve('scripts/seed-posts');
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
    title: meta.title,
    excerpt: meta.excerpt,
    content: m[2].trim(),
    cover_alt: meta.cover_alt || '',
    tags: (meta.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
    seo_title: meta.seo_title || '',
    seo_description: meta.seo_description || '',
    published: true,
    published_at: new Date().toISOString(),
  };
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
};

const files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort();
for (const file of files) {
  const post = parse(await readFile(path.join(dir, file), 'utf8'));
  if (dry) {
    console.log(`[seed-posts] ${post.slug}: ${post.content.split(/\s+/).length} words, tags ${post.tags.join('/')}`);
    continue;
  }
  if (!url || !key) {
    console.log(`[seed-posts] ${post.slug}: no service key here, skipped`);
    continue;
  }
  const check = await fetch(`${url}/rest/v1/posts?select=slug&slug=eq.${encodeURIComponent(post.slug)}`, { headers });
  const existing = check.ok ? await check.json() : [];
  if (!check.ok) {
    console.log(`[seed-posts] ${post.slug}: lookup failed ${check.status} ${await check.text()}`);
    continue;
  }
  if (existing.length) {
    console.log(`[seed-posts] ${post.slug}: already published, skipped`);
    continue;
  }
  const res = await fetch(`${url}/rest/v1/posts`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify(post),
  });
  console.log(`[seed-posts] ${post.slug}: ${res.ok ? 'published' : `failed ${res.status} ${await res.text()}`}`);
}
