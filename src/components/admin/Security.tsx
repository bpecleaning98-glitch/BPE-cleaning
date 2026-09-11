import { useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from './client';
import { Btn, Caps, Notice, Panel } from './ui';

/**
 * Two step sign in, on Supabase Auth (TOTP).
 *
 * Two screens live here: the panel inside the cabinet, where it is switched on
 * and off, and the screen that asks for the code at the door. They share the
 * same traps and the same wording, so they share a file.
 *
 * The screen is NOT the barrier. A guard written in React can be walked around,
 * /admin is a public page and the anon key is public by design, so anyone
 * holding the password could talk to the API directly. The barrier is in the
 * database: is_admin() in supabase/schema.sql asks for aal2 from the moment the
 * account has a confirmed factor, which a session only reaches by passing the
 * code from the phone.
 *
 * While the account has no confirmed factor, aal1 is still enough. Otherwise
 * nobody could get in to switch this on, and the cabinet would lock its own
 * owner out.
 */

/** TOTP codes are six digits. The field accepts nothing else. */
function onlyDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

/**
 * A factor name has to be unique on the account, and a label stamped to the
 * minute repeats itself if two enrolments land in the same minute. So the name
 * takes a suffix on the second try instead of failing with
 * mfa_factor_name_conflict in front of the client.
 */
function factorName(attempt: number): string {
  const stamp = new Date().toLocaleDateString('en-IE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return attempt === 0 ? `Phone ${stamp}` : `Phone ${stamp} (${attempt + 1})`;
}

type Enrolment = { factorId: string; qr: string; secret: string };

export default function Security() {
  const [hasFactor, setHasFactor] = useState<boolean | null>(null);
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [asking, setAsking] = useState(false);

  /**
   * listFactors() asks the server, so it answers correctly even when the
   * enrolment happened in another browser. nextLevel from
   * getAuthenticatorAssuranceLevel() reads the local session, which can be
   * stale, and has no business here.
   */
  async function refresh() {
    try {
      const { data, error: listError } = await supabase!.auth.mfa.listFactors();
      if (listError) {
        setHasFactor(false);
        return;
      }
      setHasFactor((data?.totp ?? []).some((factor) => factor.status === 'verified'));
    } catch {
      setHasFactor(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  /**
   * Abandoned enrolments leave unconfirmed factors behind, and they pile up
   * with every attempt. They are cleared before a new one. Confirmed factors
   * are never touched here: somebody changing phones has to keep the old one
   * working until the new code is confirmed.
   */
  async function clearUnverified() {
    const { data } = await supabase!.auth.mfa.listFactors();
    const stale = (data?.all ?? []).filter((factor) => factor.status === 'unverified');
    for (const factor of stale) {
      await supabase!.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  /**
   * Any call here can throw as well as return { error }. Without try/finally a
   * dropped connection leaves the button on "Preparing" for good, with no
   * message, and the client reads that as a broken cabinet.
   */
  async function start() {
    setBusy(true);
    setError('');
    setNote('');
    try {
      await clearUnverified();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { data, error: enrolError } = await supabase!.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: factorName(attempt),
        });
        if (!enrolError && data) {
          setEnrolment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
          setCode('');
          return;
        }
        // Only the name conflict is worth retrying. Anything else is a real error.
        if (!String(enrolError?.message ?? '').includes('already exists')) break;
      }
      setError('That did not start. Try again in a moment.');
    } catch {
      setError('That did not start. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (!enrolment || code.length !== 6) return;
    setBusy(true);
    setError('');
    try {
      const { error: verifyError } = await supabase!.auth.mfa.challengeAndVerify({
        factorId: enrolment.factorId,
        code,
      });
      if (verifyError) {
        setError('That code was not right. The app shows a new one every 30 seconds.');
        setCode('');
        return;
      }
      setEnrolment(null);
      setNote('Two step sign in is on. From now on this cabinet asks for a code from your phone.');
      await refresh();
    } catch {
      setError('That code could not be checked. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setError('');
    try {
      const { data } = await supabase!.auth.mfa.listFactors();
      for (const factor of data?.all ?? []) {
        await supabase!.auth.mfa.unenroll({ factorId: factor.id });
      }
      setAsking(false);
      setNote('Two step sign in is off. The cabinet now asks for the password only.');
      await refresh();
    } catch {
      setError('That did not switch off. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-2xl gap-8">
      <header>
        <h1 className="font-display text-[1.7rem] font-[380] leading-tight text-ink md:text-[2rem]">
          Two step sign in
        </h1>
        <p className="mt-2 text-[0.85rem] leading-relaxed text-stone">
          A password can be guessed, reused or read over a shoulder. With this on, the cabinet also
          asks for a six digit code that only your phone can produce, and that changes every thirty
          seconds.
        </p>
      </header>

      <Panel title={hasFactor ? 'It is on' : 'It is off'}>
        <p className="text-sm leading-relaxed text-ink">
          {hasFactor
            ? 'Signing in takes the password and then a code from your phone. Nobody gets in with the password alone.'
            : 'Signing in takes the password only. Anyone who learns it is inside.'}
        </p>

        {note && (
          <div className="mt-5">
            <Notice kind="ok">{note}</Notice>
          </div>
        )}
        {error && (
          <div className="mt-5">
            <Notice kind="error">{error}</Notice>
          </div>
        )}

        {/* switching it on, step by step */}
        {!hasFactor && !enrolment && (
          <div className="mt-6">
            <Btn onClick={start} disabled={busy}>
              {busy ? 'Preparing' : 'Switch it on'}
            </Btn>
          </div>
        )}

        {enrolment && (
          <form onSubmit={confirm} className="mt-6 grid gap-5">
            <ol className="m-0 grid list-none gap-2 p-0 text-sm leading-relaxed text-ink">
              <li>
                <span className="text-stone">1.</span> On your phone, install Google Authenticator
                from the App Store or Google Play. Any code app works, this is just the common one.
              </li>
              <li>
                <span className="text-stone">2.</span> Open it, choose to add an account, and scan
                the square below.
              </li>
              <li>
                <span className="text-stone">3.</span> Type the six digits the app shows.
              </li>
            </ol>

            <div className="grid justify-items-center gap-4 bg-porcelain/70 p-6">
              <QrCode value={enrolment.qr} />
              <div className="text-center">
                <Caps>If the camera will not scan, type this instead</Caps>
                <code className="mt-2 block break-all font-sans text-[0.8rem] tracking-[0.12em] text-ink">
                  {enrolment.secret}
                </code>
              </div>
            </div>

            <label className="block">
              <Caps>The six digits from the app</Caps>
              <input
                value={code}
                onChange={(event) => setCode(onlyDigits(event.target.value))}
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label="The six digits from the app"
                placeholder="000000"
                className="mt-2 block w-full max-w-[14rem] border border-ink/20 bg-transparent px-4 py-3 text-center font-sans text-[1.3rem] tracking-[0.35em] tabular-nums text-ink placeholder:text-ink/25 transition-colors focus:border-gold-deep focus:outline-none"
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <Btn type="submit" disabled={busy || code.length !== 6}>
                {busy ? 'Checking' : 'Confirm'}
              </Btn>
              <Btn
                variant="ghost"
                onClick={() => {
                  setEnrolment(null);
                  setError('');
                }}
              >
                Cancel
              </Btn>
            </div>
          </form>
        )}

        {/* switching it off, or moving it to a new phone */}
        {hasFactor && !enrolment && !asking && (
          <div className="mt-6 grid gap-4">
            <p className="text-[0.8rem] leading-relaxed text-stone">
              New phone? Switch it on again there first, and only then switch the old one off. Doing
              it the other way round leaves a moment with no phone at all.
            </p>
            <div className="flex flex-wrap gap-3">
              <Btn onClick={start} disabled={busy}>
                {busy ? 'Preparing' : 'Set up a new phone'}
              </Btn>
              <Btn variant="ghost" onClick={() => setAsking(true)}>
                Switch it off
              </Btn>
            </div>
          </div>
        )}

        {asking && (
          <div className="mt-6 grid gap-4 bg-porcelain/70 p-6">
            <p className="text-sm leading-relaxed text-ink">
              Switch two step sign in off? After that the password is all anyone needs to open this
              cabinet.
            </p>
            <div className="flex flex-wrap gap-3">
              <Btn variant="danger" onClick={turnOff} disabled={busy}>
                {busy ? 'Switching off' : 'Yes, switch it off'}
              </Btn>
              <Btn variant="ghost" onClick={() => setAsking(false)}>
                Keep it on
              </Btn>
            </div>
          </div>
        )}
      </Panel>

      <p className="text-[0.75rem] leading-relaxed text-stone">
        Lost the phone with the codes on it? The site administrator can clear the second step from
        the Supabase console, and you set it up again on the new phone.
      </p>
    </div>
  );
}

/**
 * Supabase hands the QR back as an SVG. In some versions it arrives as a data
 * URL and in others as raw markup, so this takes either: otherwise the client
 * looks at an empty rectangle with nothing to scan.
 */
function QrCode({ value }: { value: string }) {
  if (value.trim().startsWith('<svg')) {
    return (
      <div
        className="h-[196px] w-[196px] bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: value }}
      />
    );
  }
  return (
    <img src={value} alt="" width={196} height={196} className="h-[196px] w-[196px] bg-white p-2" />
  );
}

/**
 * The screen at the door: the password has gone through, a session exists, but
 * it is still aal1. Nothing of the cabinet shows until the code from the phone
 * arrives, and the database would not answer it anyway.
 */
export function MfaChallenge({
  brand,
  onPassed,
  onSignOut,
}: {
  brand?: ReactNode;
  onPassed: () => void;
  onSignOut: () => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    field.current?.focus();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: listError } = await supabase!.auth.mfa.listFactors();
      const factor = (data?.totp ?? []).find((one) => one.status === 'verified');
      if (listError || !factor) {
        setError('The second step could not be read. Sign out and in again.');
        setBusy(false);
        return;
      }
      const { error: verifyError } = await supabase!.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code,
      });
      if (verifyError) {
        setError('That code was not right. The app shows a new one every 30 seconds.');
        setCode('');
        setBusy(false);
        field.current?.focus();
        return;
      }
      onPassed();
    } catch {
      setError('That code could not be checked. Try again in a moment.');
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      {brand && <div className="mb-8 flex justify-center">{brand}</div>}
      <h1 className="text-center font-display text-2xl font-[380] text-ink">One more step</h1>
      <p className="mt-2 text-center text-[0.8rem] leading-relaxed text-stone">
        Open the code app on your phone and type the six digits it shows for BPE Cleaning.
      </p>

      <form onSubmit={submit} className="mt-8 grid gap-5 border border-ink/12 bg-ivory p-6">
        <label className="block">
          <Caps>Code</Caps>
          <input
            ref={field}
            value={code}
            onChange={(event) => setCode(onlyDigits(event.target.value))}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="The six digits from the app"
            placeholder="000000"
            className="mt-2 w-full border border-ink/20 bg-transparent px-4 py-3 text-center font-sans text-[1.4rem] tracking-[0.35em] tabular-nums text-ink placeholder:text-ink/25 transition-colors focus:border-gold-deep focus:outline-none"
          />
        </label>
        {error && <Notice kind="error">{error}</Notice>}
        <Btn type="submit" disabled={busy || code.length !== 6}>
          {busy ? 'Checking' : 'Continue'}
        </Btn>
      </form>

      <div className="mt-4 flex justify-center">
        <Btn variant="ghost" size="sm" onClick={onSignOut}>
          Sign out
        </Btn>
      </div>
    </div>
  );
}
