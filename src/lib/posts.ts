import { Marked } from 'marked';
import { dbPublic } from './db';
import type { Post } from './types';

/**
 * Blog reads, used by the server-rendered pages under /blog/.
 *
 * They go through the anon key, so row level security decides what comes
 * back: an unpublished draft is invisible here no matter what is asked for.
 */

const SELECT =
  'id, created_at, updated_at, published_at, slug, title, excerpt, content, cover_url, cover_alt, tags, seo_title, seo_description, author, published';

export async function getPublishedPosts(limit = 100): Promise<Post[]> {
  if (!dbPublic) return [];
  const { data, error } = await dbPublic
    .from('posts')
    .select(SELECT)
    .eq('published', true)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error || !data) return [];
  return data as Post[];
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  if (!dbPublic || !slug) return null;
  const { data, error } = await dbPublic
    .from('posts')
    .select(SELECT)
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle();
  if (error || !data) return null;
  return data as Post;
}

/**
 * Markdown to HTML. The only people who can write a post are the two
 * addresses in admin_emails, so inline HTML is left alone on purpose: it is
 * how a client embeds a map or a video without needing a developer.
 */
const marked = new Marked({ gfm: true, breaks: false });

export function renderMarkdown(md: string): string {
  return marked.parse(md || '', { async: false }) as string;
}

export function postDate(post: Post): string {
  const iso = post.published_at || post.created_at;
  return new Date(iso).toLocaleDateString('en-IE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function postIso(post: Post): string {
  return new Date(post.published_at || post.created_at).toISOString();
}

/** Rounded up, floor of one minute, the usual convention. */
export function readingMinutes(post: Post): number {
  const words = (post.content || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Falls back to the first sentences of the article when no excerpt is set. */
export function postSummary(post: Post, max = 165): string {
  const base =
    post.excerpt?.trim() ||
    (post.content || '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[#>*_`~-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  return base.length > max ? `${base.slice(0, max - 1).trimEnd()}…` : base;
}
