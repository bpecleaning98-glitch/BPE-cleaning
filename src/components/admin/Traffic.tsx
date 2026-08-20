import { useEffect, useState, type ReactNode } from 'react';
import { supabase, fmtDuration, fmtNumber, flag } from './client';
import { Caps, Empty, Notice, Panel, Row, Spinner } from './ui';
import { RankBars } from './charts';
import type { StatsDevice, StatsPage, StatsPlace, StatsSource } from '../../lib/types';

/**
 * Traffic, the detail screen behind the overview.
 *
 * The overview answers "how are we doing". This screen answers "who came,
 * from where, on what, and what did they read". Four panels, one measure per
 * panel, every figure in sans with tabular numbers so columns line up.
 *
 * All four load in one pass on the selected range, so the screen either shows
 * a spinner or shows real numbers, never a half filled grid.
 */

type Range = { days: number; from: string; to: string };

/**
 * Column tracks, written out so the header and the rows cannot drift apart.
 * The last page track is 7rem because "Average time" is the widest header in
 * the tracked uppercase style and it has to sit on one line.
 */
const SOURCE_COLS = 'md:grid md:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_5.5rem] md:items-center md:gap-4';
const PAGE_COLS = 'md:grid md:grid-cols-[minmax(0,1fr)_4.5rem_7rem] md:items-center md:gap-4';

/** The three values the tracker records, in the client's words. */
const DEVICE_LABELS: Record<string, string> = {
  mobile: 'Phone',
  tablet: 'Tablet',
  desktop: 'Computer',
};

/** stats_places returns the busiest rows only, capped at this many in supabase/schema.sql. */
const PLACES_LIMIT = 30;

export default function Traffic({ range }: { range: Range }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sources, setSources] = useState<StatsSource[]>([]);
  const [devices, setDevices] = useState<StatsDevice[]>([]);
  const [places, setPlaces] = useState<StatsPlace[]>([]);
  const [pages, setPages] = useState<StatsPage[]>([]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setError('The cabinet is not connected to the database yet.');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');

    const args = { p_from: range.from, p_to: range.to };

    Promise.all([
      supabase.rpc('stats_sources', args),
      supabase.rpc('stats_devices', args),
      supabase.rpc('stats_places', args),
      supabase.rpc('stats_pages', args),
    ])
      .then(([sourceRes, deviceRes, placeRes, pageRes]) => {
        if (cancelled) return;
        const failed = [sourceRes, deviceRes, placeRes, pageRes].find((r) => r.error);
        setError(failed?.error ? failed.error.message : '');
        setSources(sortByVisits(rows<StatsSource>(sourceRes)));
        setDevices(rows<StatsDevice>(deviceRes));
        setPlaces(rows<StatsPlace>(placeRes));
        setPages(rows<StatsPage>(pageRes));
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : 'The traffic figures could not be loaded.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [range.from, range.to]);

  const failed = Boolean(error);
  const deviceTotal = devices.reduce((sum, d) => sum + Number(d.sessions || 0), 0);
  const placesCapped = places.length >= PLACES_LIMIT;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {error && (
        <div className="lg:col-span-2">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      <Panel title="Sources, in full">
        <p className="mb-4 text-[0.78rem] leading-relaxed text-stone">
          Sources are read from the link the visitor arrived through, so a campaign link is always
          attributed exactly.
        </p>

        <Body loading={loading} failed={failed} count={sources.length}>
          <div className={`hidden border-b border-ink/12 pb-2 ${SOURCE_COLS}`}>
            <Caps>Source</Caps>
            <Caps className="text-right">Visits</Caps>
            <Caps className="text-right">Pages</Caps>
            <Caps className="text-right">Requests</Caps>
          </div>
          <ul className="m-0 list-none p-0">
            {sources.map((source) => (
              <li
                key={source.source}
                className={`border-b border-ink/8 py-3 last:border-b-0 ${SOURCE_COLS}`}
              >
                <span className="block truncate font-sans text-[0.85rem] text-ink" title={source.source}>
                  {source.source || 'Direct'}
                </span>
                <span className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1 md:contents">
                  <Figure label="Visits" value={source.sessions} />
                  <Figure label="Pages" value={source.views} />
                  <Figure label="Requests" value={source.leads} tone="gold" />
                </span>
              </li>
            ))}
          </ul>
        </Body>
      </Panel>

      <Panel title="Devices">
        <Body loading={loading} failed={failed} count={devices.length}>
          <RankBars
            rows={devices.map((device) => ({
              key: device.device || 'unknown',
              label: deviceLabel(device.device),
              value: Number(device.sessions || 0),
            }))}
            renderRight={(row) => (
              <span className="tabular-nums">
                {fmtNumber(row.value)}
                <span className="ml-2 text-[0.72rem] font-normal text-stone">
                  {share(row.value, deviceTotal)}
                </span>
              </span>
            )}
          />
        </Body>
      </Panel>

      <Panel title="Countries and cities">
        <Body loading={loading} failed={failed} count={places.length}>
          <div>
            {places.map((place) => (
              <Row key={`${place.country}-${place.city}`}>
                <span className="flex min-w-0 items-center gap-3">
                  <span aria-hidden="true" className="text-[1rem] leading-none">
                    {flag(place.country)}
                  </span>
                  <span className="truncate font-sans text-[0.85rem] text-ink">
                    {placeName(place)}
                  </span>
                  {place.city && place.country !== '??' && (
                    <span className="shrink-0 font-sans text-[0.7rem] uppercase tracking-[0.14em] text-stone">
                      {place.country}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-sans text-[0.85rem] tabular-nums text-ink">
                  {fmtNumber(place.sessions)}
                </span>
              </Row>
            ))}
          </div>
          {placesCapped && (
            <p className="mt-3 text-[0.72rem] text-stone">
              Only the {PLACES_LIMIT} busiest places are listed.
            </p>
          )}
        </Body>
      </Panel>

      <Panel title="Most visited pages">
        <Body loading={loading} failed={failed} count={pages.length}>
          <div className={`hidden border-b border-ink/12 pb-2 ${PAGE_COLS}`}>
            <Caps>Path</Caps>
            <Caps className="text-right">Views</Caps>
            <Caps className="text-right">Average time</Caps>
          </div>
          <ul className="m-0 list-none p-0">
            {pages.map((page) => (
              <li key={page.path} className={`border-b border-ink/8 py-3 last:border-b-0 ${PAGE_COLS}`}>
                <a
                  href={page.path}
                  target="_blank"
                  rel="noopener"
                  title={`Open ${page.path} on the website`}
                  className="block truncate font-sans text-[0.85rem] text-ink decoration-ink/30 underline-offset-4 hover:underline"
                >
                  {page.path}
                </a>
                <span className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1 md:contents">
                  <Figure label="Views" value={page.views} />
                  <Figure label="Average time" value={fmtDuration(page.avg_seconds)} />
                </span>
              </li>
            ))}
          </ul>
        </Body>
      </Panel>
    </div>
  );
}

/**
 * One figure in a row. On a phone it carries its own small label, because the
 * column header is far away, or gone. From md it drops the label and lines up
 * under the header instead.
 */
function Figure({
  label,
  value,
  tone = 'ink',
}: {
  label: string;
  value: number | string;
  tone?: 'ink' | 'gold';
}) {
  return (
    <span className="flex items-baseline gap-1.5 md:block md:text-right">
      <Caps className="md:hidden">{label}</Caps>
      <span
        className={`font-sans text-[0.85rem] tabular-nums ${
          tone === 'gold' ? 'text-gold-deep' : 'text-ink'
        }`}
      >
        {typeof value === 'number' ? fmtNumber(value) : value}
      </span>
    </span>
  );
}

/** The three states every panel owes the reader: loading, nothing, something. */
function Body({
  loading,
  failed,
  count,
  children,
  emptyLabel = 'Nothing recorded in this period yet.',
}: {
  loading: boolean;
  failed: boolean;
  count: number;
  children: ReactNode;
  emptyLabel?: string;
}) {
  if (loading) return <Spinner />;
  if (!count) {
    return <Empty>{failed ? 'This panel has nothing to show, see the message above.' : emptyLabel}</Empty>;
  }
  return <>{children}</>;
}

/** Supabase returns rows or an error, never both, and never a typed row here. */
function rows<T>(result: { data: unknown }): T[] {
  return Array.isArray(result.data) ? (result.data as T[]) : [];
}

function sortByVisits(list: StatsSource[]): StatsSource[] {
  return [...list].sort((a, b) => Number(b.sessions || 0) - Number(a.sessions || 0));
}

function deviceLabel(device: string | null): string {
  const key = (device || 'unknown').toLowerCase();
  return DEVICE_LABELS[key] || 'Not known';
}

function share(value: number, total: number): string {
  if (!total) return '0%';
  const pct = (value / total) * 100;
  if (pct > 0 && pct < 1) return 'under 1%';
  return `${Math.round(pct)}%`;
}

function placeName(place: StatsPlace): string {
  if (place.city) return place.city;
  if (place.country && place.country !== '??') return place.country;
  return 'Not known';
}
