import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Marked } from 'marked';
import type { Post } from '../../lib/types';
import { fmtDate, slugify, supabase } from './client';
import { Btn, Caps, Empty, Field, Notice, Panel, Pill, Spinner, areaClass, inputClass } from './ui';

/**
 * The blog, written by the client herself.
 *
 * Two views in one component: the list of articles, and the editor. The
 * editor is deliberately opinionated. It writes plain Markdown, shows the
 * article as it will read while she types, shows how the result will look in
 * a Google result, and keeps a short checklist of the things that actually
 * matter for being found. Nothing here needs a developer, and nothing here
 * needs a rebuild: the pages under /blog/ are rendered on the server for
 * every visit, so a published article is live the second it is saved.
 */

const SITE = 'bpecleaning.ie';

const COLUMNS =
  'id, created_at, updated_at, published_at, slug, title, excerpt, content, cover_url, cover_alt, tags, seo_title, seo_description, author, published';

/** Google shows roughly this much of a description, and a little less title. */
const DESC_LIMIT = 155;
const TITLE_LIMIT = 60;

type Draft = {
  id: string | null;
  created_at: string | null;
  published_at: string | null;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  cover_url: string | null;
  cover_alt: string;
  tags: string;
  seo_title: string;
  seo_description: string;
  published: boolean;
};

const EMPTY_DRAFT: Draft = {
  id: null,
  created_at: null,
  published_at: null,
  slug: '',
  title: '',
  excerpt: '',
  content: '',
  cover_url: null,
  cover_alt: '',
  tags: '',
  seo_title: '',
  seo_description: '',
  published: false,
};

function toDraft(post: Post): Draft {
  return {
    id: post.id,
    created_at: post.created_at,
    published_at: post.published_at,
    slug: post.slug || '',
    title: post.title || '',
    excerpt: post.excerpt || '',
    content: post.content || '',
    cover_url: post.cover_url,
    cover_alt: post.cover_alt || '',
    tags: (post.tags || []).join(', '),
    seo_title: post.seo_title || '',
    seo_description: post.seo_description || '',
    published: post.published,
  };
}

type NoticeState = { kind: 'ok' | 'error' | 'info'; node: ReactNode } | null;

function clip(text: string, max: number): string {
  const value = text.trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Typing normalisation for the address field. slugify() strips a trailing
 * hyphen, which makes a hyphen impossible to type: "end-" becomes "end" and
 * the next letter lands against the previous word. So while she types, only
 * the illegal characters are folded away, and the full slugify runs when the
 * field is left and again on save.
 */
function softSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, 80);
}

function parseTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

/* --------------------------------------------------------------------------
 * Keeping unsaved work
 *
 * The editor lives inside a tab. Pressing Traffic or Overview in the header
 * unmounts it, and a reload or a closed tab does the same, so half an hour of
 * writing could leave without a word of warning. While the text on screen
 * differs from the row in the database it is mirrored into this browser under
 * the article's own key, and offered back the next time the same article is
 * opened. The copy never goes anywhere near the server, and it is dropped the
 * moment the article is saved or the changes are deliberately left behind.
 * ------------------------------------------------------------------------ */

const STASH_PREFIX = 'bpe.blog.draft.';

/** Old enough to be a different piece of writing, so it is not offered back. */
const STASH_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

type Stash = { at: number; draft: Draft };

function stashKey(id: string | null): string {
  return `${STASH_PREFIX}${id || 'new'}`;
}

function readStash(id: string | null): Draft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(stashKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stash;
    if (!parsed || typeof parsed.at !== 'number' || !parsed.draft || Date.now() - parsed.at > STASH_MAX_AGE) {
      window.localStorage.removeItem(stashKey(id));
      return null;
    }
    // Spread over the empty draft so a copy written before a field existed
    // still opens, and pin the id to the article actually being edited.
    return { ...EMPTY_DRAFT, ...parsed.draft, id };
  } catch {
    return null;
  }
}

/** A private window, a full quota or a blocked store is not worth an error. */
function writeStash(id: string | null, draft: Draft): void {
  if (typeof window === 'undefined') return;
  try {
    const stash: Stash = { at: Date.now(), draft };
    window.localStorage.setItem(stashKey(id), JSON.stringify(stash));
  } catch {
    /* ignored on purpose */
  }
}

function clearStash(id: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(stashKey(id));
  } catch {
    /* ignored on purpose */
  }
}

/**
 * What the editor opens with: the row as it stands, unless the browser is
 * holding a newer unsaved copy of the same article. Whether the article is
 * live, and the address it is live at, are always taken from the row, so a
 * copy kept in the browser can never move a published article.
 */
function opening(post: Post | null): { draft: Draft; mark: string; recovered: boolean } {
  const saved = post ? toDraft(post) : EMPTY_DRAFT;
  const mark = JSON.stringify(saved);
  const stashed = readStash(post ? post.id : null);
  if (!stashed) return { draft: saved, mark, recovered: false };

  const restored: Draft = {
    ...stashed,
    created_at: saved.created_at,
    published_at: saved.published_at,
    published: saved.published,
    slug: saved.published ? saved.slug : stashed.slug,
  };
  if (JSON.stringify(restored) === mark) return { draft: saved, mark, recovered: false };
  return { draft: restored, mark, recovered: true };
}

/** A label plus a hint, without the <label> wrapper: for groups that hold buttons. */
function Group({
  label,
  hint,
  children,
  className = '',
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Caps>{label}</Caps>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1.5 text-[0.7rem] leading-relaxed text-stone">{hint}</p>}
    </div>
  );
}

/* ========================================================================== */
/* The list                                                                    */
/* ========================================================================== */

export default function Blog() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<NoticeState>(null);
  const [editing, setEditing] = useState<{ post: Post | null } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) {
      setPosts([]);
      return;
    }
    setPosts(null);
    setError('');
    const { data, error: dbError } = await supabase
      .from('posts')
      .select(COLUMNS)
      .order('created_at', { ascending: false });
    if (dbError) {
      setError(dbError.message);
      setPosts([]);
      return;
    }
    setPosts((data || []) as unknown as Post[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remember = useCallback((saved: Post) => {
    setPosts((prev) => {
      const list = prev ? [...prev] : [];
      const index = list.findIndex((item) => item.id === saved.id);
      if (index >= 0) list[index] = saved;
      else list.unshift(saved);
      return list;
    });
  }, []);

  const remove = useCallback(async (post: Post) => {
    if (!supabase) return;
    setBusyId(post.id);
    const { error: dbError } = await supabase.from('posts').delete().eq('id', post.id);
    setBusyId(null);
    setConfirmId(null);
    if (dbError) {
      setNotice({ kind: 'error', node: `The article could not be deleted. ${dbError.message}` });
      return;
    }
    setPosts((prev) => (prev ? prev.filter((item) => item.id !== post.id) : prev));
    setNotice({ kind: 'ok', node: `"${post.title || 'Untitled article'}" was deleted.` });
  }, []);

  if (!supabase) {
    return <Empty>The cabinet is not connected to the database, so there is nothing to show yet.</Empty>;
  }

  if (editing) {
    return (
      <Editor
        post={editing.post}
        onSaved={remember}
        onBack={() => {
          setEditing(null);
          setNotice(null);
        }}
      />
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.7rem] font-[380] leading-tight text-ink md:text-[2rem]">
            The blog
          </h1>
          <p className="mt-1 text-[0.8rem] text-stone">
            Write an article, publish it, and it is on the website straight away.
          </p>
        </div>
        <Btn onClick={() => setEditing({ post: null })}>Write a new article</Btn>
      </div>

      {error && <Notice kind="error">The articles could not be loaded. {error}</Notice>}
      {notice && <Notice kind={notice.kind}>{notice.node}</Notice>}

      <Panel
        title="Articles"
        pad={false}
        action={
          posts && posts.length ? (
            <Caps>
              {posts.filter((p) => p.published).length} published, {posts.filter((p) => !p.published).length} draft
            </Caps>
          ) : undefined
        }
      >
        {posts === null && (
          <div className="px-5">
            <Spinner label="Loading the articles" />
          </div>
        )}

        {posts !== null && posts.length === 0 && (
          <div className="p-5">
            <Empty>No articles yet. Write the first one when you are ready.</Empty>
          </div>
        )}

        {posts !== null &&
          posts.map((post) => (
            <div
              key={post.id}
              className="flex flex-col gap-3 border-b border-ink/8 px-5 py-4 last:border-b-0 md:flex-row md:items-center md:justify-between md:gap-6"
            >
              <div className="min-w-0">
                <p className="font-display text-[1.05rem] leading-snug text-ink">
                  {post.title || 'Untitled article'}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-[0.72rem] text-stone">
                  <span className="tabular-nums">{fmtDate(post.published_at || post.created_at)}</span>
                  <span aria-hidden="true" className="text-ink/20">
                    /
                  </span>
                  <span className="break-all">/blog/{post.slug}/</span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 md:shrink-0 md:justify-end">
                <Pill tone={post.published ? 'gold' : 'muted'}>{post.published ? 'Published' : 'Draft'}</Pill>
                <Btn size="sm" variant="ghost" onClick={() => setEditing({ post })}>
                  Edit
                </Btn>
                {post.published && (
                  <Btn
                    size="sm"
                    variant="ghost"
                    title="Opens the article on the website in a new tab"
                    onClick={() => window.open(`/blog/${post.slug}/`, '_blank', 'noopener,noreferrer')}
                  >
                    View
                  </Btn>
                )}
                {confirmId === post.id ? (
                  <>
                    <Btn size="sm" variant="danger" disabled={busyId === post.id} onClick={() => void remove(post)}>
                      {busyId === post.id ? 'Deleting' : 'Delete for good'}
                    </Btn>
                    <Btn size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                      Keep it
                    </Btn>
                  </>
                ) : (
                  <Btn size="sm" variant="ghost" onClick={() => setConfirmId(post.id)}>
                    Delete
                  </Btn>
                )}
              </div>
            </div>
          ))}
      </Panel>
    </div>
  );
}

/* ========================================================================== */
/* The editor                                                                  */
/* ========================================================================== */

type Tool = 'h2' | 'h3' | 'bold' | 'italic' | 'link' | 'list' | 'quote' | 'photo';

const TOOLS: { id: Tool; label: string; title: string }[] = [
  { id: 'h2', label: 'Heading', title: 'A heading inside the article' },
  { id: 'h3', label: 'Subheading', title: 'A smaller heading under a heading' },
  { id: 'bold', label: 'Bold', title: 'Make the selected words bold' },
  { id: 'italic', label: 'Italic', title: 'Make the selected words italic' },
  { id: 'link', label: 'Link', title: 'Turn the selected words into a link' },
  { id: 'list', label: 'List', title: 'Turn the selected lines into a bulleted list' },
  { id: 'quote', label: 'Quote', title: 'Set the selected lines apart as a quote' },
  { id: 'photo', label: 'Photo', title: 'Place a photo inside the article' },
];

/**
 * The preview body wears the same rules as the public article page: serif
 * headings, sans body, generous leading, gold links, hairline rules. It is
 * written as one class string so the preview cannot drift from the article.
 */
const BODY_CLASS = [
  'post-body font-sans text-[0.92rem] leading-[1.85] text-ink/85',
  '[&>*+*]:mt-4',
  '[&_h2]:mt-9 [&_h2]:font-display [&_h2]:text-[1.35rem] [&_h2]:font-[420] [&_h2]:leading-snug [&_h2]:text-ink',
  '[&_h3]:mt-7 [&_h3]:font-display [&_h3]:text-[1.08rem] [&_h3]:font-[460] [&_h3]:leading-snug [&_h3]:text-ink',
  '[&_h4]:mt-6 [&_h4]:font-sans [&_h4]:text-[0.72rem] [&_h4]:font-semibold [&_h4]:uppercase [&_h4]:tracking-[0.2em] [&_h4]:text-gold-deep',
  '[&_a]:text-gold-deep [&_a]:underline [&_a]:underline-offset-4 [&_a]:decoration-gold/40',
  '[&_strong]:font-semibold [&_strong]:text-ink',
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-1.5 [&_li::marker]:text-gold',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-gold/45 [&_blockquote]:pl-4 [&_blockquote]:font-display [&_blockquote]:text-[1.05rem] [&_blockquote]:italic [&_blockquote]:text-ink/80',
  '[&_img]:mt-6 [&_img]:w-full [&_img]:border [&_img]:border-ink/10',
  '[&_figure]:mt-6 [&_figure_img]:mt-0',
  '[&_figcaption]:mt-2 [&_figcaption]:font-sans [&_figcaption]:text-[0.72rem] [&_figcaption]:leading-relaxed [&_figcaption]:text-stone',
  '[&_hr]:my-8 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-ink/12',
  '[&_code]:bg-porcelain [&_code]:px-1 [&_code]:text-[0.85em]',
  '[&_.post-scroll]:mt-6 [&_.post-scroll]:overflow-x-auto',
  '[&_table]:w-full [&_table]:text-[0.82rem] [&_th]:border-b [&_th]:border-ink/20 [&_th]:py-2 [&_th]:text-left [&_td]:border-t [&_td]:border-ink/10 [&_td]:py-2',
].join(' ');

/**
 * The preview runs the same two steps the public article runs: renderMarkdown
 * in src/lib/posts.ts, then prepareBody in src/pages/blog/[slug].astro, which
 * lifts an image title into a real caption, unwraps the paragraph markdown
 * puts around a lone image, and gives a wide table its own scroller. Both are
 * copied here rather than imported, because src/lib/posts.ts pulls in
 * src/lib/db.ts and the service role key with it. The proper home for them is
 * a db-free markdown module all three import. Until that exists, a change to
 * either of those two has to be made here as well or the preview drifts.
 */
const preview = new Marked({ gfm: true, breaks: false });

function previewBody(md: string): string {
  const html = preview.parse(md || '', { async: false }) as string;
  return html
    .replace(
      /<img([^>]*?)\stitle="([^"]*)"([^>]*)>/g,
      (_match, before: string, caption: string, after: string) =>
        `<figure><img${before}${after}><figcaption>${caption}</figcaption></figure>`,
    )
    .replace(/<p>(\s*<figure>[\s\S]*?<\/figure>\s*)<\/p>/g, '$1')
    .replace(/<table>/g, '<div class="post-scroll"><table>')
    .replace(/<\/table>/g, '</table></div>');
}

/** The title is voice, so it is the one field that is set in Fraunces. */
const titleClass = inputClass.replace(
  'font-sans text-sm',
  'font-display text-[1.35rem] font-[400] leading-snug md:text-[1.6rem]',
);

function Editor({
  post,
  onSaved,
  onBack,
}: {
  post: Post | null;
  onSaved: (post: Post) => void;
  onBack: () => void;
}) {
  const [start] = useState(() => opening(post));
  const [draft, setDraft] = useState<Draft>(start.draft);
  const [savedMark, setSavedMark] = useState(start.mark);
  const [notice, setNotice] = useState<NoticeState>(() =>
    start.recovered
      ? {
          kind: 'info',
          node: 'Changes from an earlier visit were never saved, so they have been brought back here. Save them, or press Back to the list twice to leave them behind and return to the saved version.',
        }
      : null,
  );
  const [saving, setSaving] = useState<'draft' | 'publish' | 'unpublish' | null>(null);
  const [uploading, setUploading] = useState<'cover' | 'body' | null>(null);
  const [seoOpen, setSeoOpen] = useState(Boolean(start.draft.seo_title || start.draft.seo_description));
  const [backArmed, setBackArmed] = useState(false);

  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const bodyInputRef = useRef<HTMLInputElement | null>(null);

  const dirty = JSON.stringify(draft) !== savedMark;

  /**
   * A live article keeps the address it went out with. Every link that was
   * shared, every bookmark and every indexed result points at it, and
   * src/pages/blog/[slug].astro answers a real 404 for an address that no
   * longer matches a row, so a rewritten slug is a dead article. While this
   * is true the address is shown as plain text and never rewritten on save.
   * Unpublishing hands it back, which is the deliberate way to move one.
   */
  const addressLocked = Boolean(draft.published && draft.id);

  useEffect(() => {
    setBackArmed(false);
  }, [draft]);

  /**
   * Two guards over the same fact, that what is on screen is not in the
   * database yet. The browser challenges a reload or a closed tab, and the
   * copy kept here survives the header switching to another tab, which
   * unmounts this editor outright. Both stop the moment the draft matches
   * what was saved, and the copy is removed with them.
   */
  useEffect(() => {
    if (!dirty) {
      clearStash(draft.id);
      return;
    }
    writeStash(draft.id, draft);
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, draft]);

  const set = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  /**
   * The address follows the title only while it is still the title's own
   * slug, and only while the article is a draft. The moment she edits it by
   * hand, or the moment the article is published, it stops moving: a live
   * address that changes under Google is a broken address.
   */
  const onTitle = useCallback((value: string) => {
    setDraft((current) => {
      const auto = !current.published && (current.slug === '' || current.slug === slugify(current.title));
      return { ...current, title: value, slug: auto ? slugify(value) : current.slug };
    });
  }, []);

  /* ---------------------------------------------------------------- writing */

  const apply = useCallback((next: string, from: number, to: number) => {
    setDraft((current) => ({ ...current, content: next }));
    requestAnimationFrame(() => {
      const el = areaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(from, to);
    });
  }, []);

  const insertAtCursor = useCallback(
    (snippet: string) => {
      const el = areaRef.current;
      const value = el ? el.value : draft.content;
      const start = el ? el.selectionStart : value.length;
      const end = el ? el.selectionEnd : value.length;
      const next = value.slice(0, start) + snippet + value.slice(end);
      apply(next, start + snippet.length, start + snippet.length);
    },
    [apply, draft.content],
  );

  /**
   * The toolbar, by hand on the textarea. Line tools rewrite whole lines and
   * toggle off if the mark is already there, inline tools wrap the selection
   * and leave the useful part selected so the next keystroke replaces it.
   */
  const runTool = useCallback(
    (tool: Tool) => {
      const el = areaRef.current;
      if (!el) return;
      const value = el.value;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = value.slice(start, end);

      if (tool === 'h2' || tool === 'h3' || tool === 'list' || tool === 'quote') {
        const prefix = tool === 'h2' ? '## ' : tool === 'h3' ? '### ' : tool === 'list' ? '- ' : '> ';
        const placeholder =
          tool === 'h2'
            ? 'A heading for this part'
            : tool === 'h3'
              ? 'A smaller heading'
              : tool === 'list'
                ? 'First point'
                : 'Something worth quoting';

        const lineStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
        const lineBreak = value.indexOf('\n', end);
        const lineEnd = lineBreak === -1 ? value.length : lineBreak;
        const block = value.slice(lineStart, lineEnd);

        if (!block.trim()) {
          const inserted = prefix + placeholder;
          const next = value.slice(0, lineStart) + inserted + value.slice(lineEnd);
          apply(next, lineStart + prefix.length, lineStart + inserted.length);
          return;
        }

        const lines = block.split('\n');
        const already = lines.every((line) => line.startsWith(prefix));
        const rebuilt = lines
          .map((line) => {
            const bare = line.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|>\s+)/, '');
            return already ? bare : prefix + bare;
          })
          .join('\n');
        const next = value.slice(0, lineStart) + rebuilt + value.slice(lineEnd);
        apply(next, lineStart, lineStart + rebuilt.length);
        return;
      }

      if (tool === 'link' || tool === 'photo') {
        const text = selected || (tool === 'link' ? 'the words people click' : 'what the photo shows');
        const inserted = tool === 'link' ? `[${text}](https://)` : `![${text}](https://)`;
        const next = value.slice(0, start) + inserted + value.slice(end);
        const addressFrom = start + (tool === 'link' ? text.length + 3 : text.length + 4);
        apply(next, addressFrom, addressFrom + 'https://'.length);
        return;
      }

      const mark = tool === 'bold' ? '**' : '*';
      const placeholder = tool === 'bold' ? 'important words' : 'a word with emphasis';
      const wrapped =
        selected.length >= mark.length * 2 && selected.startsWith(mark) && selected.endsWith(mark);
      const text = wrapped ? selected.slice(mark.length, selected.length - mark.length) : selected || placeholder;
      const inserted = wrapped ? text : `${mark}${text}${mark}`;
      const next = value.slice(0, start) + inserted + value.slice(end);
      const from = start + (wrapped ? 0 : mark.length);
      apply(next, from, from + text.length);
    },
    [apply],
  );

  /* ---------------------------------------------------------------- photos */

  const uploadImage = useCallback(async (file: File): Promise<{ url: string } | { error: string }> => {
    if (!supabase) return { error: 'The cabinet is not connected to the database.' };
    if (!file.type.startsWith('image/')) {
      return { error: 'That file is not a photo. Choose a JPG, a PNG or a WebP.' };
    }
    if (file.size > 8 * 1024 * 1024) {
      return { error: 'That photo is bigger than 8 MB. Save a smaller version and try again.' };
    }
    const dot = file.name.lastIndexOf('.');
    const ext = dot > -1 ? file.name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : 'jpg';
    const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext || 'jpg'}`;
    const { error: upErr } = await supabase.storage.from('blog').upload(path, file, {
      upsert: false,
      contentType: file.type,
      cacheControl: '31536000',
    });
    if (upErr) return { error: `The photo could not be uploaded. ${upErr.message}` };
    const { data } = supabase.storage.from('blog').getPublicUrl(path);
    if (!data?.publicUrl) return { error: 'The photo was uploaded but its address came back empty.' };
    return { url: data.publicUrl };
  }, []);

  const onCoverFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setUploading('cover');
      setNotice(null);
      const result = await uploadImage(file);
      setUploading(null);
      if ('error' in result) {
        setNotice({ kind: 'error', node: result.error });
        return;
      }
      setDraft((current) => ({ ...current, cover_url: result.url }));
      setNotice({ kind: 'ok', node: 'The cover photo is uploaded. Write a short description of it below.' });
    },
    [uploadImage],
  );

  const onBodyFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setUploading('body');
      setNotice(null);
      const result = await uploadImage(file);
      setUploading(null);
      if ('error' in result) {
        setNotice({ kind: 'error', node: result.error });
        return;
      }
      insertAtCursor(`\n\n![what the photo shows](${result.url})\n\n`);
      setNotice({
        kind: 'ok',
        node: 'The photo is in the article. Replace the words inside the square brackets with a short description of it.',
      });
    },
    [insertAtCursor, uploadImage],
  );

  /* ----------------------------------------------------------------- saving */

  const save = useCallback(
    async (intent: 'draft' | 'publish' | 'unpublish') => {
      if (!supabase) return;
      const title = draft.title.trim();
      // Locked means the address came out of the row and cannot have been
      // touched, so it goes back exactly as it came, unslugified.
      const slug = addressLocked
        ? draft.slug.trim()
        : draft.slug.trim()
          ? slugify(draft.slug)
          : slugify(title);
      if (!title) {
        setNotice({ kind: 'error', node: 'The article needs a title before it can be saved.' });
        return;
      }
      if (!slug) {
        setNotice({ kind: 'error', node: 'The address is empty. Write a few words for it, in letters.' });
        return;
      }

      const published = intent === 'publish' ? true : intent === 'unpublish' ? false : draft.published;
      const publishedAt = published ? draft.published_at || new Date().toISOString() : draft.published_at;

      const payload: Record<string, unknown> = {
        slug,
        title,
        excerpt: draft.excerpt.trim(),
        content: draft.content,
        cover_url: draft.cover_url,
        cover_alt: draft.cover_alt.trim(),
        tags: parseTags(draft.tags),
        seo_title: draft.seo_title.trim(),
        seo_description: draft.seo_description.trim(),
        published,
        published_at: publishedAt,
      };
      if (draft.id) payload.id = draft.id;

      setSaving(intent);
      setNotice(null);
      const { data, error: dbError } = await supabase
        .from('posts')
        .upsert(payload)
        .select(COLUMNS)
        .single();
      setSaving(null);

      if (dbError) {
        const duplicate = dbError.code === '23505';
        setNotice({
          kind: 'error',
          node: duplicate
            ? `Another article already lives at /blog/${slug}/. Change the address a little and save again.`
            : `Nothing was saved. ${dbError.message}`,
        });
        return;
      }

      const saved = data as unknown as Post;
      const next = toDraft(saved);
      // The row is now the truth. A new article was kept under the "new" key
      // until this moment, so it is dropped by hand rather than by the effect.
      clearStash(draft.id);
      setDraft(next);
      setSavedMark(JSON.stringify(next));
      onSaved(saved);

      const address = `${SITE}/blog/${saved.slug}/`;
      if (intent === 'publish') {
        setNotice({
          kind: 'ok',
          node: (
            <>
              Published. The article is live right now at{' '}
              <a
                href={`/blog/${saved.slug}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                {address}
              </a>
              . The blog pages are built on the server for every visit, so there is nothing to wait for and
              nothing to rebuild.
            </>
          ),
        });
      } else if (intent === 'unpublish') {
        setNotice({
          kind: 'info',
          node: `Taken off the website. ${address} no longer shows the article, and the text is kept here as a draft.`,
        });
      } else {
        setNotice({
          kind: 'ok',
          node: saved.published
            ? `Saved. The changes are already visible at ${address}.`
            : 'Draft saved. Nobody can see it on the website yet.',
        });
      }
    },
    [addressLocked, draft, onSaved],
  );

  const back = useCallback(() => {
    if (dirty && !backArmed) {
      setBackArmed(true);
      setNotice({
        kind: 'info',
        node: 'There are changes that are not saved. Press Back to the list once more to leave them behind.',
      });
      return;
    }
    // Leaving on purpose means the copy in the browser should not follow her
    // back the next time this article is opened.
    clearStash(draft.id);
    onBack();
  }, [backArmed, dirty, draft.id, onBack]);

  /* ---------------------------------------------------------------- preview */

  const html = useMemo(() => previewBody(draft.content), [draft.content]);
  const words = useMemo(() => countWords(draft.content), [draft.content]);

  const excerptLength = draft.excerpt.trim().length;
  const checklist = [
    { ok: draft.title.trim().length > 0, label: 'The article has a title' },
    {
      ok: excerptLength > 0 && excerptLength <= 165,
      label: 'A short summary, under 165 characters',
    },
    {
      ok: Boolean(draft.cover_url) && draft.cover_alt.trim().length > 0,
      label: 'A cover photo with a description',
    },
    { ok: words >= 300, label: 'At least 300 words' },
    { ok: /^#{2,6}\s+\S/m.test(draft.content), label: 'At least one subheading' },
    {
      ok: draft.slug.length > 3 && /[a-z]{3,}/.test(draft.slug) && !/\d{3,}/.test(draft.slug),
      label: 'An address made of words, not numbers',
    },
  ];
  const done = checklist.filter((item) => item.ok).length;

  const seoTitle = draft.seo_title.trim() || draft.title.trim();
  const seoDescription = draft.seo_description.trim() || draft.excerpt.trim();

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Btn size="sm" variant="ghost" onClick={back}>
            Back to the list
          </Btn>
          <Pill tone={draft.published ? 'gold' : 'muted'}>{draft.published ? 'Published' : 'Draft'}</Pill>
          {dirty && <Caps>Not saved</Caps>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {draft.published && draft.id && (
            <Btn
              size="sm"
              variant="ghost"
              onClick={() => window.open(`/blog/${draft.slug}/`, '_blank', 'noopener,noreferrer')}
            >
              View
            </Btn>
          )}
          <Btn size="sm" variant="ghost" disabled={saving !== null} onClick={() => void save('draft')}>
            {saving === 'draft' ? 'Saving' : 'Save draft'}
          </Btn>
          {draft.published ? (
            <Btn size="sm" variant="ghost" disabled={saving !== null} onClick={() => void save('unpublish')}>
              {saving === 'unpublish' ? 'Working' : 'Unpublish'}
            </Btn>
          ) : (
            <Btn size="sm" disabled={saving !== null} onClick={() => void save('publish')}>
              {saving === 'publish' ? 'Publishing' : 'Publish'}
            </Btn>
          )}
        </div>
      </div>

      {notice && <Notice kind={notice.kind}>{notice.node}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] lg:items-start">
        {/* ---------------------------------------------------------- left */}
        <div className="grid gap-6">
          <Panel title="The article">
            <div className="grid gap-6">
              <Field label="Title">
                <input
                  className={titleClass}
                  value={draft.title}
                  onChange={(event) => onTitle(event.target.value)}
                  placeholder="What is the article about"
                />
              </Field>

              <Field
                label="Address on the site"
                hint={
                  addressLocked
                    ? 'The article is live, so this address stays as it is. Changing it would break the links people already have. Unpublish the article first if it really has to move.'
                    : 'This fills itself in from the title. Keep it short and made of words.'
                }
              >
                <div className="flex flex-wrap items-center gap-1 border-b border-ink/25 py-2.5 focus-within:border-gold-deep">
                  <span className="shrink-0 font-sans text-sm text-stone">{SITE}/blog/</span>
                  {addressLocked ? (
                    <span className="min-w-0 flex-1 break-all font-sans text-sm text-ink/70">{draft.slug}</span>
                  ) : (
                    <input
                      className="min-w-0 flex-1 basis-full bg-transparent font-sans text-base text-ink placeholder:text-ink/30 focus:outline-none sm:basis-auto sm:text-sm"
                      value={draft.slug}
                      onChange={(event) => set('slug', softSlug(event.target.value))}
                      onBlur={() => set('slug', slugify(draft.slug))}
                      placeholder="end-of-tenancy-checklist"
                    />
                  )}
                  <span className="shrink-0 font-sans text-sm text-stone">/</span>
                </div>
              </Field>

              <Field
                label="Short summary"
                hint={
                  <>
                    Shown on the blog page and often under the title in Google, which usually shows about 155
                    characters.{' '}
                    <span
                      className={`tabular-nums ${excerptLength > 165 ? 'text-red-800' : 'text-gold-deep'}`}
                    >
                      {excerptLength}
                    </span>{' '}
                    so far.
                  </>
                }
              >
                <textarea
                  className={`${areaClass} min-h-[5.5rem]`}
                  value={draft.excerpt}
                  onChange={(event) => set('excerpt', event.target.value)}
                  placeholder="Two sentences telling someone what they will get out of reading this."
                />
              </Field>
            </div>
          </Panel>

          <Panel title="Cover photo">
            <div className="grid gap-5">
              {draft.cover_url ? (
                <div className="border border-ink/12">
                  <img
                    src={draft.cover_url}
                    alt={draft.cover_alt || 'Cover photo'}
                    className="block max-h-64 w-full object-cover"
                  />
                </div>
              ) : (
                <Empty>No cover photo yet. A cover is shown on the blog page and when the article is shared.</Empty>
              )}

              <Group
                label="Photo file"
                hint="JPG, PNG or WebP, up to 8 MB. A wide photo works best, around 1600 pixels across."
              >
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      event.target.value = '';
                      void onCoverFile(file);
                    }}
                  />
                  <Btn
                    size="sm"
                    variant="ghost"
                    disabled={uploading !== null}
                    onClick={() => coverInputRef.current?.click()}
                  >
                    {uploading === 'cover' ? 'Uploading' : draft.cover_url ? 'Replace the photo' : 'Choose a photo'}
                  </Btn>
                  {draft.cover_url && (
                    <Btn size="sm" variant="ghost" disabled={uploading !== null} onClick={() => set('cover_url', null)}>
                      Remove
                    </Btn>
                  )}
                </div>
                {uploading === 'cover' && <Spinner label="Uploading the photo" />}
              </Group>

              <Field
                label="Cover photo description"
                hint="Read aloud to people who cannot see the photo, and used by Google to understand it. Describe what is in it, plainly."
              >
                <input
                  className={inputClass}
                  value={draft.cover_alt}
                  onChange={(event) => set('cover_alt', event.target.value)}
                  placeholder="A cleaned kitchen with the worktops cleared"
                />
              </Field>
            </div>
          </Panel>

          <Panel title="The text">
            <Group
              label="Formatting"
              hint="Select some words first, then press a button. The little marks that appear tell the website how to show the text."
            >
              <div className="flex flex-wrap gap-1.5">
                {TOOLS.map((tool) => (
                  <Btn key={tool.id} size="sm" variant="ghost" title={tool.title} onClick={() => runTool(tool.id)}>
                    {tool.label}
                  </Btn>
                ))}
              </div>
            </Group>

            <div className="mt-4">
              <textarea
                ref={areaRef}
                className={`${areaClass} min-h-[26rem] font-sans leading-[1.7]`}
                value={draft.content}
                onChange={(event) => set('content', event.target.value)}
                placeholder={
                  'Write here.\n\nA blank line starts a new paragraph. Use Heading for the parts of the article, and keep the sentences short.'
                }
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="font-sans text-[0.72rem] text-stone">
                <span className="tabular-nums text-ink">{words}</span> words
              </p>
              <div className="flex items-center gap-2">
                <input
                  ref={bodyInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    event.target.value = '';
                    void onBodyFile(file);
                  }}
                />
                <Btn
                  size="sm"
                  variant="ghost"
                  disabled={uploading !== null}
                  title="Uploads a photo and drops it where the cursor is"
                  onClick={() => bodyInputRef.current?.click()}
                >
                  {uploading === 'body' ? 'Uploading' : 'Add a photo here'}
                </Btn>
              </div>
            </div>
          </Panel>

          <Panel
            title="How it looks on Google"
            action={
              <Btn size="sm" variant="ghost" onClick={() => setSeoOpen((open) => !open)}>
                {seoOpen ? 'Hide' : 'Show'}
              </Btn>
            }
          >
            <GoogleResult slug={draft.slug} title={seoTitle} description={seoDescription} />

            {seoOpen && (
              <div className="mt-6 grid gap-6 border-t border-ink/10 pt-6">
                <Field
                  label="Search engine title"
                  hint={
                    <>
                      Leave it empty to use the article title. Google usually shows about {TITLE_LIMIT} characters.{' '}
                      <span className="tabular-nums text-gold-deep">{seoTitle.length}</span> now.
                    </>
                  }
                >
                  <input
                    className={inputClass}
                    value={draft.seo_title}
                    onChange={(event) => set('seo_title', event.target.value)}
                    placeholder={draft.title || 'The title as you want it in Google'}
                  />
                </Field>

                <Field
                  label="Search engine description"
                  hint={
                    <>
                      Leave it empty to use the short summary. About {DESC_LIMIT} characters is what gets shown.{' '}
                      <span
                        className={`tabular-nums ${seoDescription.length > 165 ? 'text-red-800' : 'text-gold-deep'}`}
                      >
                        {seoDescription.length}
                      </span>{' '}
                      now.
                    </>
                  }
                >
                  <textarea
                    className={`${areaClass} min-h-[5rem]`}
                    value={draft.seo_description}
                    onChange={(event) => set('seo_description', event.target.value)}
                    placeholder={draft.excerpt || 'One sentence that makes someone want to click.'}
                  />
                </Field>
              </div>
            )}
          </Panel>

          <Panel title="Tags">
            <Field
              label="Tags"
              hint="Separate them with commas, for example: end of tenancy, deposit, Dublin. They group articles together on the blog."
            >
              <input
                className={inputClass}
                value={draft.tags}
                onChange={(event) => set('tags', event.target.value)}
                placeholder="end of tenancy, deposit, Dublin"
              />
            </Field>
            {parseTags(draft.tags).length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {parseTags(draft.tags).map((tag) => (
                  <Pill key={tag}>{tag}</Pill>
                ))}
              </div>
            )}
          </Panel>

          <div className="flex flex-wrap items-center gap-2">
            <Btn variant="ghost" disabled={saving !== null} onClick={() => void save('draft')}>
              {saving === 'draft' ? 'Saving' : 'Save draft'}
            </Btn>
            {draft.published ? (
              <Btn variant="ghost" disabled={saving !== null} onClick={() => void save('unpublish')}>
                {saving === 'unpublish' ? 'Working' : 'Unpublish'}
              </Btn>
            ) : (
              <Btn disabled={saving !== null} onClick={() => void save('publish')}>
                {saving === 'publish' ? 'Publishing' : 'Publish'}
              </Btn>
            )}
            <Btn variant="ghost" onClick={back}>
              Back to the list
            </Btn>
          </div>
        </div>

        {/* --------------------------------------------------------- right */}
        <div className="grid gap-6 lg:sticky lg:top-32">
          <Panel
            title="Before you publish"
            action={
              <Caps>
                <span className="tabular-nums">{done}</span> of {checklist.length}
              </Caps>
            }
          >
            <ul className="m-0 grid list-none gap-2.5 p-0">
              {checklist.map((item) => (
                <li key={item.label} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={`mt-[3px] h-3 w-3 shrink-0 border ${
                      item.ok ? 'border-gold-deep bg-gold-deep' : 'border-ink/25'
                    }`}
                  />
                  <span className={`font-sans text-[0.8rem] leading-snug ${item.ok ? 'text-ink' : 'text-stone'}`}>
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[0.72rem] leading-relaxed text-stone">
              These are suggestions, not rules. An article can be published without them, it simply tends to be
              found more easily with them.
            </p>
          </Panel>

          <Panel title="How the article will read" pad={false}>
            <div className="max-h-[70vh] overflow-y-auto p-5 lg:max-h-[calc(100vh-22rem)]">
              {draft.cover_url && (
                <img
                  src={draft.cover_url}
                  alt={draft.cover_alt || ''}
                  className="mb-6 block w-full border border-ink/10 object-cover"
                />
              )}
              <p className="font-sans text-[0.7rem] uppercase tracking-[0.22em] text-gold-deep">
                {fmtDate(draft.published_at || draft.created_at || new Date().toISOString())}
              </p>
              <h2 className="mt-3 font-display text-[1.7rem] font-[380] leading-[1.15] text-ink md:text-[2rem]">
                {draft.title || 'The title goes here'}
              </h2>
              {draft.excerpt.trim() && (
                <p className="mt-4 font-sans text-[0.95rem] leading-relaxed text-stone">{draft.excerpt}</p>
              )}
              <div className="my-6 h-px w-full bg-ink/12" />
              {/* previewBody above mirrors what the public page does, so a photo
                  caption and a wide table read here the way they will read there.
                  The Markdown is rendered raw: the only people who can type into
                  this box are the addresses in admin_emails, and leaving inline
                  HTML alone is how a map or a video gets embedded without a
                  developer. */}
              {draft.content.trim() ? (
                <div className={BODY_CLASS} dangerouslySetInnerHTML={{ __html: html }} />
              ) : (
                <Empty>The article is empty. Whatever is typed on the left appears here.</Empty>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/**
 * A Google result, drawn in the site's own colours: the address in gold, the
 * title in ink rather than the familiar blue, the description in stone. The
 * point is the lengths and the wording, not a costume.
 */
function GoogleResult({ slug, title, description }: { slug: string; title: string; description: string }) {
  return (
    <div className="border border-ink/12 bg-porcelain/60 p-4">
      <p className="font-sans text-[0.72rem] leading-snug text-gold-deep">
        {SITE} › blog › {slug || 'the-address'}
      </p>
      <p className="mt-1.5 font-sans text-[1.02rem] leading-snug text-ink">
        {clip(title, TITLE_LIMIT) || 'The title of the article'}
      </p>
      <p className="mt-1.5 font-sans text-[0.78rem] leading-relaxed text-stone">
        {clip(description, DESC_LIMIT) ||
          'The short summary appears here. Write it as if you were answering the question someone typed.'}
      </p>
    </div>
  );
}
