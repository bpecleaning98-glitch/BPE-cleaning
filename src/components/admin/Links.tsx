import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import type { LinkCampaign, StatsLink } from '../../lib/types';
import { supabase, rangeBounds, fmtNumber, fmtDate, slugify } from './client';
import {
  Btn,
  Caps,
  Empty,
  Field,
  Notice,
  Panel,
  Pill,
  Spinner,
  Toggle,
  areaClass,
  inputClass,
} from './ui';

/**
 * Campaign links.
 *
 * One short address per channel: bpecleaning.ie/go/facebook-oct. It gets
 * printed on a flyer or pasted into a post, it records every click, and it
 * carries the campaign tags to the real page, so a quote request that
 * arrives an hour later can still be traced back to the flyer that caused
 * it. A link that is paused or past its date is not a dead end: it lands on
 * the homepage anyway, which is what makes a printed QR safe to order.
 */

/** The public address printed on flyers. Not location.origin: the cabinet is
 *  sometimes opened on a preview domain, and a QR must never carry that. */
const SITE = 'https://bpecleaning.ie';

/** Clicks and requests are always read over the same window. */
const STATS_DAYS = 90;

/** The database constrains the short code: lower case, letters, numbers and
 *  dashes, 2 to 60 characters. Mirrored here so a bad code is caught in the
 *  form instead of coming back as a Postgres check violation. */
const CODE_MAX = 60;
const CODE_RE = /^[a-z0-9-]{2,60}$/;

/** slugify() runs to 80 characters, which the code column will not take, and a
 *  name long enough to be cut usually ends on a dash. */
function codeSlug(value: string): string {
  return slugify(value).slice(0, CODE_MAX).replace(/-+$/, '');
}

const DESTINATIONS: { value: string; label: string }[] = [
  { value: '/', label: 'Home' },
  { value: '/prices/', label: 'Prices' },
  { value: '/quote/', label: 'Get a quote' },
  { value: '/contact/', label: 'Contact' },
  { value: '/services/', label: 'Services' },
  { value: '/deep-cleaning-dublin/', label: 'Deep cleaning' },
  { value: '/end-of-tenancy-cleaning-dublin/', label: 'End of tenancy cleaning' },
  { value: '/after-builders-cleaning-dublin/', label: 'After builders cleaning' },
  { value: '/airbnb-cleaning-dublin/', label: 'Airbnb cleaning' },
  { value: '/house-cleaning-dublin/', label: 'House cleaning' },
  { value: '/office-cleaning-dublin/', label: 'Office cleaning' },
  { value: '/about/', label: 'About' },
  { value: '/blog/', label: 'Blog' },
];

/** The medium is what the tag means to Google Analytics later: paper or screen. */
const SOURCES: { value: string; label: string; medium: string }[] = [
  { value: 'facebook', label: 'Facebook', medium: 'social' },
  { value: 'instagram', label: 'Instagram', medium: 'social' },
  { value: 'whatsapp', label: 'WhatsApp', medium: 'message' },
  { value: 'google', label: 'Google', medium: 'listing' },
  { value: 'flyer', label: 'Flyer', medium: 'print' },
  { value: 'business-card', label: 'Business card', medium: 'print' },
  { value: 'qr', label: 'QR code', medium: 'print' },
  { value: 'van', label: 'Van', medium: 'print' },
  { value: 'other', label: 'Other', medium: 'referral' },
];

type RowMessage = { id: string; kind: 'ok' | 'error' | 'info'; text: string };

function linkUrl(code: string): string {
  return `${SITE}/go/${code}`;
}

/** A file the client can hand to a print shop, without a server round trip. */
function saveFile(name: string, blob: Blob): void {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(head)?.[1] || 'image/png';
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function statusOf(link: LinkCampaign): { label: string; tone: 'gold' | 'muted' | 'neutral' } {
  if (!link.active) return { label: 'Paused', tone: 'muted' };
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return { label: 'Expired', tone: 'muted' };
  }
  return { label: 'Active', tone: 'gold' };
}

export default function Links() {
  const [links, setLinks] = useState<LinkCampaign[] | null>(null);
  const [stats, setStats] = useState<Record<string, StatsLink>>({});
  const [loadError, setLoadError] = useState('');
  const [statsError, setStatsError] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [rowMessage, setRowMessage] = useState<RowMessage | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const [openQr, setOpenQr] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<Record<string, string>>({});

  const bounds = useMemo(() => rangeBounds(STATS_DAYS), []);

  const load = useCallback(async () => {
    if (!supabase) {
      setLinks([]);
      setLoadError('The cabinet has no database connection, so links cannot be listed.');
      return;
    }
    const { data, error } = await supabase
      .from('link_campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      setLoadError('The links could not be loaded. Reload the page and try again.');
      setLinks([]);
      return;
    }
    setLoadError('');
    setLinks((data || []) as LinkCampaign[]);
  }, []);

  const loadStats = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('stats_links', {
      p_from: bounds.from,
      p_to: bounds.to,
    });
    if (error) {
      setStatsError('The click counts could not be read just now. The links themselves are fine.');
      return;
    }
    setStatsError('');
    const map: Record<string, StatsLink> = {};
    for (const row of (data || []) as StatsLink[]) map[row.code.toLowerCase()] = row;
    setStats(map);
  }, [bounds.from, bounds.to]);

  useEffect(() => {
    void load();
    void loadStats();
  }, [load, loadStats]);

  const copy = useCallback(async (link: LinkCampaign) => {
    const url = linkUrl(link.code);
    try {
      await navigator.clipboard.writeText(url);
      setRowMessage({ id: link.id, kind: 'ok', text: 'Address copied, ready to paste.' });
    } catch {
      setRowMessage({ id: link.id, kind: 'info', text: `Copy it by hand: ${url}` });
    }
  }, []);

  const toggleActive = useCallback(
    async (link: LinkCampaign) => {
      if (!supabase) return;
      setBusyId(link.id);
      const next = !link.active;
      const { error } = await supabase
        .from('link_campaigns')
        .update({ active: next })
        .eq('id', link.id);
      setBusyId(null);
      if (error) {
        setRowMessage({ id: link.id, kind: 'error', text: 'That change was not saved. Try again.' });
        return;
      }
      setLinks((prev) =>
        prev ? prev.map((row) => (row.id === link.id ? { ...row, active: next } : row)) : prev,
      );
      setRowMessage({
        id: link.id,
        kind: 'ok',
        text: next
          ? 'Back on. It sends people to its page again.'
          : 'Paused. It now lands on the homepage instead.',
      });
    },
    [],
  );

  const remove = useCallback(async (link: LinkCampaign) => {
    if (!supabase) return;
    setBusyId(link.id);
    const { error } = await supabase.from('link_campaigns').delete().eq('id', link.id);
    setBusyId(null);
    setConfirmId(null);
    if (error) {
      setRowMessage({ id: link.id, kind: 'error', text: 'That link was not deleted. Try again.' });
      return;
    }
    setLinks((prev) => (prev ? prev.filter((row) => row.id !== link.id) : prev));
    if (openQr === link.id) setOpenQr(null);
    setRowMessage(null);
  }, [openQr]);

  const showQr = useCallback(
    async (link: LinkCampaign) => {
      if (openQr === link.id) {
        setOpenQr(null);
        return;
      }
      setOpenQr(link.id);
      if (qrSvg[link.id]) return;
      try {
        const svg = await QRCode.toString(linkUrl(link.code), {
          type: 'svg',
          margin: 1,
          color: { dark: '#191512', light: '#0000' },
        });
        setQrSvg((prev) => ({ ...prev, [link.id]: svg }));
      } catch {
        // Close the panel again, otherwise it sits on the spinner for good:
        // nothing else will ever write this id into qrSvg.
        setOpenQr((current) => (current === link.id ? null : current));
        setRowMessage({
          id: link.id,
          kind: 'error',
          text: 'The QR code could not be drawn in this browser.',
        });
      }
    },
    [openQr, qrSvg],
  );

  const saveSvg = useCallback(
    (link: LinkCampaign) => {
      const svg = qrSvg[link.id];
      if (!svg) return;
      saveFile(`bpe-qr-${link.code}.svg`, new Blob([svg], { type: 'image/svg+xml' }));
    },
    [qrSvg],
  );

  const savePng = useCallback(async (link: LinkCampaign) => {
    try {
      const dataUrl = await QRCode.toDataURL(linkUrl(link.code), {
        width: 1024,
        margin: 1,
        color: { dark: '#191512', light: '#FFFFFF' },
      });
      saveFile(`bpe-qr-${link.code}.png`, dataUrlToBlob(dataUrl));
    } catch {
      setRowMessage({
        id: link.id,
        kind: 'error',
        text: 'The PNG could not be produced in this browser. The SVG still works.',
      });
    }
  }, []);

  return (
    <div className="grid gap-8">
      <header>
        <h1 className="font-display text-[1.7rem] font-[380] leading-tight text-ink md:text-[2rem]">
          Campaign links
        </h1>
        <p className="mt-2 max-w-2xl text-[0.85rem] leading-relaxed text-stone">
          One short address per channel. Hand it out, then see how many people came through it
          and how many of them asked for a price. A link that is paused or past its date still
          opens the homepage, so a printed flyer or QR never dead ends.
        </p>
      </header>

      <Panel
        title="New campaign link"
        action={
          <Btn variant="ghost" size="sm" onClick={() => setFormOpen((open) => !open)}>
            {formOpen ? 'Close' : 'New link'}
          </Btn>
        }
      >
        {formOpen ? (
          <NewLinkForm
            existing={links || []}
            onCreated={() => {
              setFormOpen(false);
              void load();
              void loadStats();
            }}
          />
        ) : (
          <p className="text-[0.82rem] leading-relaxed text-stone">
            Make a link for a post, a flyer or the van, then come back here to see what it
            brought in.
          </p>
        )}
      </Panel>

      <Panel title="Your links" action={<Caps>Last {STATS_DAYS} days</Caps>} pad={false}>
        {loadError && (
          <div className="p-5">
            <Notice kind="error">{loadError}</Notice>
          </div>
        )}

        {links === null && !loadError && (
          <div className="px-5">
            <Spinner label="Loading your links" />
          </div>
        )}

        {links !== null && !loadError && links.length === 0 && (
          <div className="p-5">
            <Empty>No links yet. Make the first one above and hand it out.</Empty>
          </div>
        )}

        {links !== null && links.length > 0 && (
          <ul className="m-0 list-none p-0">
            {links.map((link) => (
              <LinkRow
                key={link.id}
                link={link}
                stat={stats[link.code.toLowerCase()]}
                busy={busyId === link.id}
                message={rowMessage && rowMessage.id === link.id ? rowMessage : null}
                confirming={confirmId === link.id}
                qrOpen={openQr === link.id}
                qrSvg={qrSvg[link.id]}
                onCopy={() => void copy(link)}
                onToggle={() => void toggleActive(link)}
                onAskDelete={() => setConfirmId(link.id)}
                onCancelDelete={() => setConfirmId(null)}
                onDelete={() => void remove(link)}
                onQr={() => void showQr(link)}
                onSaveSvg={() => saveSvg(link)}
                onSavePng={() => void savePng(link)}
              />
            ))}
          </ul>
        )}

        {statsError && (
          <div className="border-t border-ink/10 p-5">
            <Notice kind="info">{statsError}</Notice>
          </div>
        )}
      </Panel>
    </div>
  );
}

/* -------------------------------------------------------------------------
   One link
   ------------------------------------------------------------------------- */

function LinkRow({
  link,
  stat,
  busy,
  message,
  confirming,
  qrOpen,
  qrSvg,
  onCopy,
  onToggle,
  onAskDelete,
  onCancelDelete,
  onDelete,
  onQr,
  onSaveSvg,
  onSavePng,
}: {
  link: LinkCampaign;
  stat?: StatsLink;
  busy: boolean;
  message: RowMessage | null;
  confirming: boolean;
  qrOpen: boolean;
  qrSvg?: string;
  onCopy: () => void;
  onToggle: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  onQr: () => void;
  onSaveSvg: () => void;
  onSavePng: () => void;
}) {
  const status = statusOf(link);
  const url = linkUrl(link.code);
  const destination = DESTINATIONS.find((d) => d.value === link.destination);

  return (
    <li className="border-b border-ink/8 px-5 py-5 last:border-b-0">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="m-0 font-sans text-[0.95rem] font-semibold leading-tight text-ink">
              {link.label || link.code}
            </h3>
            <Pill tone={status.tone}>{status.label}</Pill>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="break-all font-sans text-[0.78rem] text-stone">{url}</span>
            <Btn variant="ghost" size="sm" onClick={onCopy} title="Copy the address">
              Copy
            </Btn>
          </div>

          <p className="mt-2 font-sans text-[0.72rem] leading-relaxed text-stone">
            Goes to {destination ? destination.label : link.destination}
            {link.utm_source ? `, tagged ${link.utm_source}` : ''}
            {link.expires_at ? `, credited until ${fmtDate(link.expires_at)}` : ''}
            {`, made ${fmtDate(link.created_at)}`}
          </p>
        </div>

        <div className="flex shrink-0 items-start gap-8 md:gap-10">
          <div>
            <Caps>Clicks</Caps>
            <p className="mt-1.5 font-sans text-[1.3rem] font-medium leading-none tabular-nums text-ink">
              {fmtNumber(stat?.clicks ?? 0)}
            </p>
          </div>
          <div>
            <Caps>Requests</Caps>
            <p className="mt-1.5 font-sans text-[1.3rem] font-medium leading-none tabular-nums text-gold-deep">
              {fmtNumber(stat?.leads ?? 0)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Btn variant="ghost" size="sm" onClick={onQr}>
          {qrOpen ? 'Hide QR' : 'QR'}
        </Btn>
        <Btn variant="ghost" size="sm" onClick={onToggle} disabled={busy}>
          {link.active ? 'Pause' : 'Resume'}
        </Btn>
        {!confirming && (
          <Btn variant="ghost" size="sm" onClick={onAskDelete} disabled={busy}>
            Delete
          </Btn>
        )}
      </div>

      {confirming && (
        <div className="mt-3 border border-ink/12 bg-porcelain/70 p-4">
          <p className="m-0 text-[0.8rem] leading-relaxed text-ink">
            Delete this link for good? Its recorded clicks go with it, and anyone who scans an
            already printed QR will land on the homepage.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn variant="danger" size="sm" onClick={onDelete} disabled={busy}>
              {busy ? 'Deleting' : 'Yes, delete it'}
            </Btn>
            <Btn variant="ghost" size="sm" onClick={onCancelDelete} disabled={busy}>
              Keep it
            </Btn>
          </div>
        </div>
      )}

      {qrOpen && (
        <div className="mt-3 border border-ink/12 bg-porcelain/70 p-4">
          {qrSvg ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div
                className="w-[16rem] max-w-full bg-ivory p-3 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              <div>
                <p className="m-0 max-w-xs text-[0.78rem] leading-relaxed text-ink">
                  Scan it to test it, or download it for a flyer. SVG stays sharp at any size,
                  PNG is what most print shops ask for.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Btn variant="ghost" size="sm" onClick={onSaveSvg}>
                    Download SVG
                  </Btn>
                  <Btn variant="ghost" size="sm" onClick={onSavePng}>
                    Download PNG
                  </Btn>
                </div>
              </div>
            </div>
          ) : (
            <Spinner label="Drawing the QR code" />
          )}
        </div>
      )}

      {message && (
        <div className="mt-3">
          <Notice kind={message.kind}>{message.text}</Notice>
        </div>
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------
   The form
   ------------------------------------------------------------------------- */

function NewLinkForm({
  existing,
  onCreated,
}: {
  existing: LinkCampaign[];
  onCreated: () => void;
}) {
  const [label, setLabel] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [destination, setDestination] = useState('/');
  const [sourceKey, setSourceKey] = useState('facebook');
  const [otherSource, setOtherSource] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [mediumInput, setMediumInput] = useState('');
  const [mediumTouched, setMediumTouched] = useState(false);
  const [campaignInput, setCampaignInput] = useState('');
  const [campaignTouched, setCampaignTouched] = useState(false);
  const [note, setNote] = useState('');
  const [expires, setExpires] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const source = SOURCES.find((s) => s.value === sourceKey) || SOURCES[0];
  const utmSource = sourceKey === 'other' ? slugify(otherSource) : sourceKey;
  const medium = mediumTouched ? mediumInput : source.medium;
  const campaign = campaignTouched ? campaignInput : code;
  const taken = existing.some((row) => row.code.toLowerCase() === code.toLowerCase());

  const onLabel = (value: string) => {
    setLabel(value);
    if (!codeTouched) setCode(codeSlug(value));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanCode = codeSlug(code);
    if (!label.trim()) {
      setError('Give the link a name, for example Facebook, October offer.');
      return;
    }
    if (!cleanCode) {
      setError('The short code cannot be empty. Letters, numbers and dashes only.');
      return;
    }
    if (!CODE_RE.test(cleanCode)) {
      setError(
        'The short code needs 2 to 60 characters, letters, numbers and dashes only. Shorten the name or write a shorter code by hand.',
      );
      return;
    }
    if (existing.some((row) => row.code.toLowerCase() === cleanCode)) {
      setError(`That short code is already used. Try ${cleanCode}-2 or another word.`);
      return;
    }
    if (sourceKey === 'other' && !utmSource) {
      setError('Write where this link is going out, or pick one of the sources above.');
      return;
    }
    if (!supabase) {
      setError('The cabinet has no database connection, so nothing can be saved.');
      return;
    }

    setSaving(true);
    setError('');
    const { error: saveError } = await supabase.from('link_campaigns').insert({
      code: cleanCode,
      label: label.trim(),
      destination,
      utm_source: utmSource,
      utm_medium: slugify(medium),
      utm_campaign: slugify(campaign) || cleanCode,
      note: note.trim(),
      expires_at: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
      active: true,
    });
    setSaving(false);

    if (saveError) {
      const duplicate =
        saveError.code === '23505' || /duplicate key/i.test(saveError.message || '');
      // 23514 is the check on the code column: lower case, letters, numbers and
      // dashes, 2 to 60 characters. Say which rule was broken, not just 'failed'.
      const badCode = saveError.code === '23514';
      setError(
        duplicate
          ? `That short code is already used. Try ${cleanCode}-2 or another word.`
          : badCode
            ? 'The short code was refused. It takes 2 to 60 characters, letters, numbers and dashes only.'
            : 'The link was not saved. Check the fields and try again.',
      );
      return;
    }
    onCreated();
  };

  return (
    <form onSubmit={submit} className="grid gap-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Field label="Name" hint="Only you see this. It is how you will recognise the link later.">
          <input
            className={inputClass}
            value={label}
            onChange={(event) => onLabel(event.target.value)}
            placeholder="Facebook, October offer"
            required
          />
        </Field>

        <Field
          label="Short code"
          hint={
            <span className="break-all">
              {linkUrl(code || 'your-code')}
              {taken ? '. That code is already used.' : ''}
              {!taken && code.length === 1 ? '. Two characters at least.' : ''}
            </span>
          }
        >
          <input
            className={inputClass}
            value={code}
            onChange={(event) => {
              setCodeTouched(true);
              setCode(codeSlug(event.target.value));
            }}
            placeholder="facebook-oct"
            maxLength={CODE_MAX}
            required
          />
        </Field>

        <Field label="Where it goes">
          <select
            className={inputClass}
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
          >
            {DESTINATIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.value})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Source" hint="Where you are handing this link out.">
          <select
            className={inputClass}
            value={sourceKey}
            onChange={(event) => setSourceKey(event.target.value)}
          >
            {SOURCES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        {sourceKey === 'other' && (
          <Field label="Which source" hint="A short word, saved in lower case.">
            <input
              className={inputClass}
              value={otherSource}
              onChange={(event) => setOtherSource(event.target.value)}
              placeholder="Shop window"
              required
            />
          </Field>
        )}

        <Field
          label="Expires on"
          hint="Optional. After this date the link keeps working, but it lands on the homepage instead of the page above and stops being credited to this campaign."
        >
          <input
            className={inputClass}
            type="date"
            value={expires}
            onChange={(event) => setExpires(event.target.value)}
          />
        </Field>
      </div>

      <div className="border-t border-ink/10 pt-4">
        <Toggle checked={advanced} onChange={setAdvanced} label="Advanced" />
        {advanced && (
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <Field label="Medium" hint="How it reaches people: social, print, message.">
              <input
                className={inputClass}
                value={medium}
                onChange={(event) => {
                  setMediumTouched(true);
                  setMediumInput(event.target.value);
                }}
              />
            </Field>
            <Field label="Campaign" hint="The name the tags carry. The short code by default.">
              <input
                className={inputClass}
                value={campaign}
                onChange={(event) => {
                  setCampaignTouched(true);
                  setCampaignInput(event.target.value);
                }}
              />
            </Field>
            <Field label="Note" className="md:col-span-2" hint="Optional, for your own memory.">
              <textarea
                className={areaClass}
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="500 flyers, Rathmines"
              />
            </Field>
          </div>
        )}
      </div>

      {error && <Notice kind="error">{error}</Notice>}

      <div>
        <Btn type="submit" disabled={saving}>
          {saving ? 'Saving' : 'Save link'}
        </Btn>
      </div>
    </form>
  );
}
