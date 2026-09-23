import { SITE } from './site';

/** Shared default cover for articles created without an individual photo. */
export const DEFAULT_BLOG_COVER = {
  url: '/hero/blog-article-1600.webp',
  alt: 'A bright, tidy home interior with folded linens and a small cleaning bottle in soft daylight',
} as const;

const SEARCH_TITLE_LIMIT = 60;

/** Match the article editor's search preview to the published title tag. */
export function blogSearchTitle(title: string): string {
  const cleanTitle = title.trim();
  if (!cleanTitle) return '';
  const suffix = ` | ${SITE.name}`;
  return cleanTitle.length + suffix.length <= SEARCH_TITLE_LIMIT ? `${cleanTitle}${suffix}` : cleanTitle;
}
