/**
 * One-off: points the four blog articles at their WebP covers in
 * public/blog-covers/ (1200 px, cached for 30 days by vercel.json), in place
 * of the JPEG copies and the 1600 px file in Supabase storage. Runs during
 * the Vercel build, where the service role key lives, and only touches
 * cover_url, by slug. Removed again once the change is live.
 */
const url = (process.env.PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const COVERS = {
  'should-you-clean-before-cleaner-comes-dublin': '/blog-covers/before-your-cleaner-arrives.webp',
  'end-of-tenancy-cleaning-cost-dublin': '/blog-covers/end-of-tenancy-kitchen.webp',
  'get-your-deposit-back-dublin-cleaning': '/blog-covers/end-of-tenancy-oven.webp',
  'airbnb-cleaning-cost-dublin-hosts': '/blog-covers/airbnb-bedroom.webp',
};
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
for (const [slug, cover_url] of Object.entries(COVERS)) {
  if (!url || !key) {
    console.log(`[update-covers] ${slug}: no service key here, skipped`);
    continue;
  }
  const res = await fetch(`${url}/rest/v1/posts?slug=eq.${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ cover_url }),
  });
  const rows = res.ok ? await res.json() : [];
  console.log(`[update-covers] ${slug}: ${res.ok ? (rows.length ? `cover ${cover_url}` : 'NOT FOUND') : `failed ${res.status} ${await res.text()}`}`);
}
