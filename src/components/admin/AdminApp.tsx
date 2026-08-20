import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { MARKS } from '../../data/marks';
import { supabase, configured, RANGES, rangeBounds } from './client';
import { Btn, Caps, Field, Notice, Panel, Segments, Spinner, inputClass } from './ui';
import Dashboard from './Dashboard';
import Traffic from './Traffic';
import Links from './Links';
import Blog from './Blog';
import Requests from './Requests';

/**
 * The client's cabinet.
 *
 * Two gates, not one. Supabase Auth decides whether someone is signed in;
 * the admin_emails table decides whether that person is allowed to see
 * anything. A stray account gets past the first and stops dead at the
 * second. The real enforcement lives in the row level security policies, so
 * the check below only spares the user a screen full of empty panels.
 */

export type Range = { days: number; from: string; to: string };

const TABS = [
  { id: 'dashboard', label: 'Overview' },
  { id: 'traffic', label: 'Traffic' },
  { id: 'links', label: 'Campaign links' },
  { id: 'blog', label: 'Blog' },
  { id: 'requests', label: 'Requests' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function AdminApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<TabId>('dashboard');
  const [days, setDays] = useState<number>(30);

  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) {
      setIsAdmin(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('admin_emails')
      .select('email')
      .limit(1)
      .then(({ data }) => {
        if (!cancelled) setIsAdmin(Boolean(data && data.length));
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const signOut = useCallback(() => {
    supabase?.auth.signOut();
  }, []);

  if (!configured) return <Unconfigured />;
  if (checking) return <Centered><Spinner label="Checking your session" /></Centered>;
  if (!session) return <SignIn />;
  if (isAdmin === null) return <Centered><Spinner label="Opening the cabinet" /></Centered>;
  if (!isAdmin) return <NotAllowed email={session.user.email || ''} onSignOut={signOut} />;

  const bounds = rangeBounds(days);
  const range: Range = { days, ...bounds };

  return (
    <div className="min-h-screen bg-porcelain">
      <header className="sticky top-0 z-30 border-b border-ink/12 bg-porcelain/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[80rem] flex-wrap items-center justify-between gap-4 px-5 py-4 md:px-8">
          <div className="flex items-center gap-4">
            <a href="/" className="flex items-center" title="Back to the website">
              <BrandMark />
            </a>
            <span className="hidden h-6 w-px bg-ink/15 sm:block" />
            <Caps className="hidden sm:inline">Client cabinet</Caps>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden font-sans text-[0.72rem] text-stone md:inline">
              {session.user.email}
            </span>
            <Btn variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Btn>
          </div>
        </div>

        <nav className="mx-auto w-full max-w-[80rem] overflow-x-auto px-5 md:px-8">
          {/* wrap on phones: five tracked-caps tabs are ~490px, and a blind
              horizontal scroll hides exactly the two tabs the client uses. */}
          <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-0 p-0 md:flex-nowrap md:gap-7">
            {TABS.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`relative whitespace-nowrap border-b-2 py-3 font-sans text-[0.66rem] font-semibold uppercase tracking-[0.2em] transition-colors ${
                    tab === t.id
                      ? 'border-gold-deep text-ink'
                      : 'border-transparent text-stone hover:text-ink'
                  }`}
                >
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[80rem] px-5 py-8 md:px-8 md:py-10">
        {(tab === 'dashboard' || tab === 'traffic') && (
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-[1.7rem] font-[380] leading-tight text-ink md:text-[2rem]">
                {tab === 'dashboard' ? 'How the website is doing' : 'Where the visits come from'}
              </h1>
              <p className="mt-1 text-[0.8rem] text-stone">
                {new Date(range.from).toLocaleDateString('en-IE', { day: 'numeric', month: 'long' })}
                {' to '}
                {new Date(Date.now()).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <Segments
              value={days}
              onChange={(next) => setDays(next)}
              options={RANGES.map((r) => ({ value: r.days, label: r.label }))}
            />
          </div>
        )}

        {tab === 'dashboard' && <Dashboard range={range} />}
        {tab === 'traffic' && <Traffic range={range} />}
        {tab === 'links' && <Links />}
        {tab === 'blog' && <Blog />}
        {tab === 'requests' && <Requests />}
      </main>
    </div>
  );
}

/** The real horizontal lockup, from the same generated artwork the site uses. */
function BrandMark({ variant = 'horizontal' }: { variant?: 'horizontal' | 'symbol' }) {
  const mark = MARKS[variant];
  return (
    <svg
      viewBox={mark.viewBox}
      className={variant === 'symbol' ? 'h-8' : 'h-7'}
      style={{
        width: 'auto',
        ['--bpe-ink' as string]: 'var(--color-ink)',
        ['--bpe-gold' as string]: 'var(--color-gold)',
      }}
      role="img"
      aria-label="BPE Cleaning Services"
      dangerouslySetInnerHTML={{ __html: mark.body }}
    />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-porcelain px-5">{children}</div>
  );
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError('');
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (authError) setError('That email and password do not match an account.');
  };

  const reset = async () => {
    if (!supabase || !email) {
      setError('Type your email address first, then use this link.');
      return;
    }
    setError('');
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/admin` });
    setSent('If that address has an account, a reset link is on its way to it.');
  };

  return (
    <Centered>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <BrandMark />
        </div>
        <h1 className="text-center font-display text-2xl font-[380] text-ink">Client cabinet</h1>
        <p className="mt-2 text-center text-[0.8rem] text-stone">
          Traffic, campaign links, blog and requests for bpecleaning.ie
        </p>

        <form onSubmit={submit} className="mt-8 grid gap-5 border border-ink/12 bg-ivory p-6">
          <Field label="Email">
            <input
              className={inputClass}
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Password">
            <input
              className={inputClass}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          {error && <Notice kind="error">{error}</Notice>}
          {sent && <Notice kind="ok">{sent}</Notice>}
          <Btn type="submit" disabled={busy}>
            {busy ? 'Signing in' : 'Sign in'}
          </Btn>
          <button
            type="button"
            onClick={reset}
            className="py-3 text-center font-sans text-[0.68rem] uppercase tracking-[0.18em] text-stone underline-offset-4 hover:text-ink hover:underline"
          >
            Forgot the password
          </button>
        </form>
      </div>
    </Centered>
  );
}

function NotAllowed({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <Centered>
      <Panel title="No access" className="max-w-md">
        <p className="text-sm leading-relaxed text-ink">
          {email} is signed in, but it is not on the list of addresses allowed into this cabinet.
        </p>
        <p className="mt-3 text-[0.78rem] leading-relaxed text-stone">
          Ask the site administrator to add it, then sign in again.
        </p>
        <div className="mt-6">
          <Btn variant="ghost" size="sm" onClick={onSignOut}>
            Sign out
          </Btn>
        </div>
      </Panel>
    </Centered>
  );
}

function Unconfigured() {
  return (
    <Centered>
      <Panel title="Not connected yet" className="max-w-lg">
        <p className="text-sm leading-relaxed text-ink">
          The cabinet has no database to talk to. Add PUBLIC_SUPABASE_URL and
          PUBLIC_SUPABASE_ANON_KEY to the project environment, then reload this page.
        </p>
        <p className="mt-3 text-[0.78rem] leading-relaxed text-stone">
          The website itself is unaffected and keeps working exactly as it is.
        </p>
      </Panel>
    </Centered>
  );
}
