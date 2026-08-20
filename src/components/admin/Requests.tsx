import { useEffect, useMemo, useState } from 'react';
import type { Lead, LeadStatus } from '../../lib/types';
import { supabase, fmtDate, fmtDateTime } from './client';
import { Btn, Caps, Empty, Notice, Panel, Pill, Segments, Spinner, areaClass } from './ui';

/**
 * The requests screen.
 *
 * This is the only tab where the numbers turn into money, so it is built for
 * the way it is actually used: standing in a hallway, on a phone, working
 * down the list. Every request is one card, every card carries the two
 * actions that matter (call, WhatsApp) at thumb height, and the status can be
 * changed without opening anything.
 *
 * Each request also carries the campaign that produced it, which is the whole
 * reason the leads table stores utm and link_code at all. Traffic tells the
 * client which channel brings visits. This screen tells her which channel
 * brings people who ask for a price.
 */

type Filter = 'all' | LeadStatus;

/** The newest requests are the ones that get worked, so the list stops here. */
const LIMIT = 500;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'booked', label: 'Booked' },
  { value: 'closed', label: 'Closed' },
];

const STATUSES: { value: LeadStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'booked', label: 'Booked' },
  { value: 'closed', label: 'Closed' },
];

export default function Requests() {
  const [rows, setRows] = useState<Lead[]>([]);
  // How many requests exist in the database, which is not the same as how many
  // are on screen once the list hits its cap.
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!supabase) {
        setLoading(false);
        setError('The cabinet has no database connection, so requests cannot be loaded.');
        return;
      }
      setLoading(true);
      // The exact count rides along with the same request, so the numbers on
      // screen can say how many requests there are and not how many loaded.
      const { data, error: loadError, count } = await supabase
        .from('leads')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(LIMIT);
      if (cancelled) return;
      if (loadError) {
        setError('The requests could not be loaded. Reload the page and try again.');
        setRows([]);
        setTotal(0);
      } else {
        setError('');
        const list = (data || []) as Lead[];
        setRows(list);
        setTotal(count ?? list.length);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(
    () => (filter === 'all' ? rows : rows.filter((row) => row.status === filter)),
    [rows, filter],
  );

  /**
   * The three writes below all answer the same way: null when the row is
   * saved, a sentence when it is not. The screen updates first and rolls the
   * single affected row back if the database refuses, so a failed save never
   * leaves the list showing something that is not there.
   *
   * Each write asks the touched row back with a select. A write that changed
   * nothing comes back without an error, which is exactly what a session the
   * database no longer trusts looks like, so an empty answer counts as a
   * refusal and not as a save.
   */

  async function changeStatus(id: string, status: LeadStatus): Promise<string | null> {
    if (!supabase) return 'No database connection, the status was not saved.';
    const previous = rows.find((row) => row.id === id)?.status;
    setRows((current) => current.map((row) => (row.id === id ? { ...row, status } : row)));
    const { data, error: writeError } = await supabase
      .from('leads')
      .update({ status })
      .eq('id', id)
      .select('id');
    if (writeError || !data?.length) {
      if (previous) {
        setRows((current) =>
          current.map((row) => (row.id === id ? { ...row, status: previous } : row)),
        );
      }
      return 'The status could not be saved, nothing was changed.';
    }
    return null;
  }

  async function saveNote(id: string, note: string): Promise<string | null> {
    if (!supabase) return 'No database connection, the note was not saved.';
    const previous = rows.find((row) => row.id === id)?.admin_note ?? '';
    setRows((current) => current.map((row) => (row.id === id ? { ...row, admin_note: note } : row)));
    const { data, error: writeError } = await supabase
      .from('leads')
      .update({ admin_note: note })
      .eq('id', id)
      .select('id');
    if (writeError || !data?.length) {
      setRows((current) =>
        current.map((row) => (row.id === id ? { ...row, admin_note: previous } : row)),
      );
      return 'The note could not be saved.';
    }
    return null;
  }

  async function removeLead(id: string): Promise<string | null> {
    if (!supabase) return 'No database connection, the request was not deleted.';
    const index = rows.findIndex((row) => row.id === id);
    const lead = rows[index];
    if (!lead) return null;
    setRows((current) => current.filter((row) => row.id !== id));
    const { data, error: writeError } = await supabase
      .from('leads')
      .delete()
      .eq('id', id)
      .select('id');
    if (writeError || !data?.length) {
      setRows((current) => {
        const next = current.slice();
        next.splice(Math.min(index, next.length), 0, lead);
        return next;
      });
      return 'The request could not be deleted, it is still in the list.';
    }
    setTotal((current) => Math.max(0, current - 1));
    return null;
  }

  function exportCsv() {
    if (!filtered.length) return;
    const header = [
      'Received',
      'Name',
      'Phone',
      'Email',
      'Service',
      'Property size',
      'Preferred date',
      'Area',
      'Notes',
      'Status',
      'Your note',
      'Source',
      'Campaign',
      'Link code',
      'Referrer',
      'Landing page',
    ];
    const lines = [header.map(cell).join(',')];
    for (const lead of filtered) {
      lines.push(
        [
          stampDateTime(lead.created_at),
          lead.name,
          lead.phone,
          lead.email,
          lead.service,
          lead.size,
          lead.preferred_date,
          lead.area,
          lead.notes,
          lead.status,
          lead.admin_note,
          sourceOf(lead).text,
          lead.utm_campaign,
          lead.link_code,
          lead.referrer_host,
          lead.landing_path,
        ]
          .map(cell)
          .join(','),
      );
    }
    // The BOM is there so Excel opens the file as UTF-8 and Irish addresses
    // with fadas do not arrive as mojibake.
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `bpe-requests-${stampDate(new Date())}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(href), 0);
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-[1.7rem] font-[380] leading-tight text-ink md:text-[2rem]">
              Quote requests
            </h1>
            <span className="font-sans text-[0.9rem] font-medium tabular-nums text-stone">
              {filtered.length}
            </span>
          </div>
          <p className="mt-1 text-[0.8rem] text-stone">
            {total > rows.length
              ? `The newest ${rows.length} of ${total} requests from the website form.`
              : 'Everyone who filled in the form on the website, newest first.'}
          </p>
        </div>
        <Btn
          variant="ghost"
          size="sm"
          onClick={exportCsv}
          disabled={!filtered.length}
          title="Download the list you are looking at as a spreadsheet file"
        >
          Export CSV
        </Btn>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Segments options={FILTERS} value={filter} onChange={(next) => setFilter(next)} />
        {filter !== 'all' && total > 0 && (
          <span className="font-sans text-[0.72rem] tabular-nums text-stone">
            of {total} in total
          </span>
        )}
      </div>

      {error && <Notice kind="error">{error}</Notice>}

      <Panel pad={loading || !filtered.length}>
        {loading ? (
          <Spinner label="Loading requests" />
        ) : !filtered.length ? (
          <Empty>
            {error
              ? 'The list could not be loaded, so nothing is shown here.'
              : rows.length
                ? 'No requests with this status yet.'
                : 'No requests yet. The first one from the website form lands here.'}
          </Empty>
        ) : (
          <ul className="m-0 list-none p-0">
            {filtered.map((lead) => (
              <li key={lead.id} className="border-b border-ink/10 last:border-b-0">
                <RequestRow
                  lead={lead}
                  onStatus={changeStatus}
                  onNote={saveNote}
                  onDelete={removeLead}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/**
 * One request. It keeps its own draft note, its own confirm state and its own
 * inline messages, so typing in one card never re-renders the other 499.
 */
function RequestRow({
  lead,
  onStatus,
  onNote,
  onDelete,
}: {
  lead: Lead;
  onStatus: (id: string, status: LeadStatus) => Promise<string | null>;
  onNote: (id: string, note: string) => Promise<string | null>;
  onDelete: (id: string) => Promise<string | null>;
}) {
  const [note, setNote] = useState(lead.admin_note || '');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rowError, setRowError] = useState('');

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [saved]);

  const source = sourceOf(lead);
  const wa = whatsappDigits(lead.phone);
  const dial = (lead.phone || '').replace(/[^\d+]/g, '');
  const details: { label: string; value: string }[] = [];
  if (lead.service) details.push({ label: 'Service', value: lead.service });
  if (lead.size) details.push({ label: 'Property size', value: lead.size });
  if (lead.preferred_date)
    details.push({ label: 'Preferred date', value: prettyDate(lead.preferred_date) });
  if (lead.area) details.push({ label: 'Area', value: lead.area });

  async function pickStatus(next: LeadStatus) {
    if (next === lead.status || busy) return;
    setBusy(true);
    setRowError('');
    const message = await onStatus(lead.id, next);
    setBusy(false);
    if (message) setRowError(message);
  }

  async function blurNote() {
    const trimmed = note.trim();
    if (trimmed === (lead.admin_note || '').trim()) return;
    setRowError('');
    const message = await onNote(lead.id, trimmed);
    if (message) {
      setRowError(message);
      return;
    }
    setNote(trimmed);
    setSaved(true);
  }

  async function confirmDelete() {
    setBusy(true);
    const message = await onDelete(lead.id);
    setBusy(false);
    setConfirming(false);
    if (message) setRowError(message);
  }

  return (
    <article className="px-5 py-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="break-words font-sans text-[1rem] font-semibold text-ink">
          {lead.name || 'No name given'}
        </h3>
        <span className="font-sans text-[0.72rem] tabular-nums text-stone">
          {fmtDateTime(lead.created_at)}
        </span>
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        {lead.phone ? (
          <>
            <a
              href={`tel:${dial}`}
              className="inline-flex items-center py-2 font-sans text-[0.95rem] font-medium tabular-nums text-ink underline-offset-4 hover:text-gold-deep hover:underline"
            >
              {lead.phone}
            </a>
            {wa && (
              <a
                href={`https://wa.me/${wa}`}
                target="_blank"
                rel="noopener"
                className="inline-flex min-h-10 items-center py-2 font-sans text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-gold-deep underline-offset-4 hover:underline"
              >
                WhatsApp
              </a>
            )}
          </>
        ) : (
          <span className="font-sans text-[0.85rem] text-stone">No phone number given</span>
        )}
        {lead.email && (
          <a
            href={`mailto:${lead.email}`}
            className="break-all font-sans text-[0.82rem] text-stone underline-offset-4 hover:text-ink hover:underline"
          >
            {lead.email}
          </a>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Pill tone={source.tone}>{source.text}</Pill>
        {lead.landing_path && (
          <span className="font-sans text-[0.72rem] text-stone">landed on {lead.landing_path}</span>
        )}
      </div>

      {details.length > 0 && (
        <dl className="mt-5 grid gap-x-8 gap-y-3 border-t border-ink/8 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          {details.map((item) => (
            <div key={item.label}>
              <dt>
                <Caps>{item.label}</Caps>
              </dt>
              <dd className="mt-1 font-sans text-[0.85rem] text-ink">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {lead.notes && (
        <div className="mt-4">
          <Caps>From the form</Caps>
          {/* notes are typed by strangers on the public form: a pasted URL
              with no spaces would otherwise drag the page wider than a phone */}
          <p className="mt-1 max-w-3xl break-words font-sans text-[0.85rem] leading-relaxed text-ink [overflow-wrap:anywhere]">
            {lead.notes}
          </p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <Segments options={STATUSES} value={lead.status} onChange={pickStatus} />
        {confirming ? (
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-sans text-[0.75rem] text-stone">Delete this request?</span>
            <Btn variant="danger" size="sm" onClick={confirmDelete} disabled={busy}>
              Yes, delete
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
              Keep it
            </Btn>
          </span>
        ) : (
          <Btn
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(true)}
            disabled={busy}
            title="Remove this request from the cabinet for good"
          >
            Delete
          </Btn>
        )}
      </div>

      <div className="mt-4">
        <label className="block">
          <Caps>Your note</Caps>
          <textarea
            className={`${areaClass} mt-1.5`}
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onBlur={blurNote}
            placeholder="Quoted on the phone, calling back Tuesday. Saves when you tap away."
          />
        </label>
        {saved && (
          <div className="mt-2">
            <Notice kind="ok">Note saved.</Notice>
          </div>
        )}
      </div>

      {rowError && (
        <div className="mt-3">
          <Notice kind="error">{rowError}</Notice>
        </div>
      )}
    </article>
  );
}

/**
 * Where the request came from. A campaign link or a utm tag is the answer the
 * client is paying attention to, so it gets the gold pill; a plain referrer or
 * a direct visit is context, so it stays quiet.
 */
function sourceOf(lead: Lead): { text: string; tone: 'gold' | 'muted' } {
  const code = (lead.link_code || '').trim();
  const utm = (lead.utm_source || '').trim();
  const campaign = (lead.utm_campaign || '').trim();
  if (code || utm) {
    const parts = [code || utm];
    if (campaign && campaign.toLowerCase() !== parts[0].toLowerCase()) parts.push(campaign);
    return { text: parts.join(' / '), tone: 'gold' };
  }
  const host = (lead.referrer_host || '').trim().replace(/^www\./, '');
  if (host) return { text: host, tone: 'muted' };
  return { text: 'Direct', tone: 'muted' };
}

/**
 * A phone number as WhatsApp wants it: digits only, country code included.
 * Irish numbers are typed as 08x xxx xxxx far more often than as +353, so a
 * leading zero becomes 353 and a bare local number gets the same treatment.
 * Anything already written with a plus is left exactly as it is.
 */
function whatsappDigits(phone: string | null | undefined): string | null {
  const raw = (phone || '').replace(/[^\d+]/g, '');
  if (!raw) return null;
  const international = raw.startsWith('+');
  let digits = raw.replace(/\D/g, '');
  if (!international) {
    if (digits.startsWith('00')) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = `353${digits.slice(1)}`;
    else if (!digits.startsWith('353')) digits = `353${digits}`;
  }
  return digits.length >= 9 ? digits : null;
}

/** The form sends a date input value, so 2026-08-24 becomes 24 Aug 2026. */
function prettyDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? fmtDate(value) : value;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function stampDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Sortable in a spreadsheet, readable by a human, unambiguous about the year. */
function stampDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return `${stampDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Every field quoted, quotes doubled, one line per request whatever is typed.
 *
 * Names, areas and notes are typed by strangers on the public website, and a
 * spreadsheet treats a field opening with =, +, - or @ as a formula to run.
 * A single quote in front keeps such a field as the text it was meant to be.
 */
function cell(value: string | null | undefined): string {
  const text = (value ?? '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""');
  const safe = /^[=+\-@\t]/.test(text) ? `'${text}` : text;
  return `"${safe}"`;
}
