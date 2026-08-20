import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase clients.
 *
 * Two of them, on purpose:
 *   dbPublic   the anon key. Used for reads that the public is allowed to
 *              make anyway (published articles). Row level security still
 *              applies, so a bug here cannot leak anything private.
 *   dbAdmin    the service role key. Bypasses row level security, so it is
 *              only ever used for the two things the browser must not be
 *              able to do itself: writing analytics rows and writing leads.
 *              It never reaches the client bundle.
 *
 * Both are null when the project has no Supabase credentials yet. Every
 * caller checks, and the site works without them: the blog shows an empty
 * list, tracking quietly does nothing, forms still open WhatsApp.
 */
const env = (key: string): string | undefined =>
  // process.env is the runtime value on Vercel, import.meta.env is what
  // `astro dev` reads out of .env locally. Runtime wins, so rotating a key
  // in the Vercel dashboard takes effect without a rebuild.
  (typeof process !== 'undefined' ? process.env?.[key] : undefined) ||
  (import.meta.env as Record<string, string | undefined>)[key];

const url = env('PUBLIC_SUPABASE_URL');
const anonKey = env('PUBLIC_SUPABASE_ANON_KEY');
const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

export const dbPublic: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey, opts) : null;

export const dbAdmin: SupabaseClient | null =
  url && serviceKey ? createClient(url, serviceKey, opts) : null;

export const dbConfigured = Boolean(url && anonKey);
