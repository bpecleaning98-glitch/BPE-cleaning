import { useEffect, useMemo, useState } from 'react';
import type { StatsDaily, StatsOverview, StatsPage, StatsSource } from '../../lib/types';
import { supabase, fmtDuration, fmtNumber } from './client';
import { BarStrip, RankBars, TimeSeries, type Point } from './charts';
import { Btn, Caps, Empty, Notice, Panel, Spinner, Stat } from './ui';

/**
 * The first screen of the cabinet.
 *
 * It answers four questions in one look: how many people came, how long they
 * stayed, where they came from, and how many of them asked for a price.
 * Everything else in the cabinet is a deeper cut of one of those four.
 *
 * Visits and requests are drawn as two charts sharing one x axis, never as
 * two lines on two scales: a request and a visit are different things and a
 * shared scale would make the smaller one look like noise.
 */

type Range = { days: number; from: string; to: string };

const SOURCE_LIMIT = 10;
const PAGE_LIMIT = 8;

/** Past this many points a bar is thinner than the gap beside it. */
const DAY_LIMIT = 60;
/** Past this many weekly points the strip goes to calendar months. */
const WEEK_LIMIT = 26;

type Bucket = 'day' | 'week' | 'month';
type Slot = { day: string; sessions: number; leads: number };

const BUCKET_WORD: Record<Bucket, string> = { day: 'day', week: 'week', month: 'month' };

/** PostgREST can hand a numeric back as a string, so every figure passes here. */
function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** "2026-08-14" to "14 Aug", parsed as a local date so the day never slips. */
function dayLabel(day: string): string {
  const parts = String(day).slice(0, 10).split('-');
  if (parts.length !== 3) return String(day);
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(date.getTime())) return String(day);
  return date.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
}

/**
 * How much time one point covers. A year drawn a day at a time is 366 bars
 * with 730px of fixed gaps between them, which is wider than a phone and
 * leaves the bars themselves at nothing. So past roughly two months the days
 * are added up into weeks, and past roughly half a year of those into
 * calendar months.
 */
function pickBucket(count: number): Bucket {
  if (count <= DAY_LIMIT) return 'day';
  if (Math.ceil(count / 7) <= WEEK_LIMIT) return 'week';
  return 'month';
}

/**
 * The daily rows added up into slots, each one labelled by its first day.
 * Both charts read from the same slots, which is what makes the single x
 * axis under them true rather than approximately true.
 */
function bucketDaily(rows: StatsDaily[], bucket: Bucket): Slot[] {
  if (bucket === 'day') {
    return rows.map((row) => ({ day: row.day, sessions: row.sessions, leads: row.leads }));
  }

  // stats_daily comes back ordered by day, so weeks can simply run in sevens
  // from the start of the range. Months follow the calendar instead.
  const slots: Slot[] = [];
  let key = '';
  rows.forEach((row, i) => {
    const next = bucket === 'week' ? String(Math.floor(i / 7)) : String(row.day).slice(0, 7);
    if (next !== key) {
      key = next;
      slots.push({ day: row.day, sessions: 0, leads: 0 });
    }
    const slot = slots[slots.length - 1];
    slot.sessions += row.sessions;
    slot.leads += row.leads;
  });
  return slots;
}

export default function Dashboard({ range }: { range: Range }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [daily, setDaily] = useState<StatsDaily[]>([]);
  const [sources, setSources] = useState<StatsSource[]>([]);
  const [pages, setPages] = useState<StatsPage[]>([]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setError('The cabinet has no database to read from yet.');
      return;
    }

    let cancelled = false;
    const client = supabase;
    const args = { p_from: range.from, p_to: range.to };

    setLoading(true);
    setError('');

    Promise.all([
      client.rpc('stats_overview', args),
      client.rpc('stats_daily', args),
      client.rpc('stats_sources', args),
      client.rpc('stats_pages', args),
    ])
      .then(([o, d, s, p]) => {
        if (cancelled) return;

        const failed = [o, d, s, p].find((result) => result.error);
        if (failed?.error) {
          setError(failed.error.message || 'The numbers could not be read.');
          setLoading(false);
          return;
        }

        const overviewRow = ((o.data ?? []) as StatsOverview[])[0] ?? null;
        setOverview(
          overviewRow
            ? {
                visitors: num(overviewRow.visitors),
                sessions: num(overviewRow.sessions),
                views: num(overviewRow.views),
                avg_seconds: num(overviewRow.avg_seconds),
                leads: num(overviewRow.leads),
                link_clicks: num(overviewRow.link_clicks),
              }
            : null,
        );

        setDaily(
          ((d.data ?? []) as StatsDaily[]).map((row) => ({
            day: String(row.day),
            visitors: num(row.visitors),
            sessions: num(row.sessions),
            views: num(row.views),
            leads: num(row.leads),
          })),
        );

        setSources(
          ((s.data ?? []) as StatsSource[]).map((row) => ({
            source: row.source || 'Direct',
            sessions: num(row.sessions),
            views: num(row.views),
            leads: num(row.leads),
          })),
        );

        setPages(
          ((p.data ?? []) as StatsPage[]).map((row) => ({
            path: row.path || '/',
            views: num(row.views),
            avg_seconds: num(row.avg_seconds),
          })),
        );

        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : 'The numbers could not be read.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Keyed on the window itself, so a re-render never triggers a second read.
  }, [range.from, range.to, attempt]);

  const bucket = useMemo(() => pickBucket(daily.length), [daily.length]);
  const slots = useMemo(() => bucketDaily(daily, bucket), [daily, bucket]);
  const per = BUCKET_WORD[bucket];

  const visitPoints = useMemo<Point[]>(
    () => slots.map((slot) => ({ label: dayLabel(slot.day), value: slot.sessions })),
    [slots],
  );
  const leadPoints = useMemo<Point[]>(
    () => slots.map((slot) => ({ label: dayLabel(slot.day), value: slot.leads })),
    [slots],
  );

  const sessions = overview?.sessions ?? 0;
  const leads = overview?.leads ?? 0;
  // Two separate questions. Requests are written by the form whether or not
  // the visit was ever counted, so they cannot hang off the traffic check.
  const hasTraffic = daily.some((row) => row.views > 0 || row.sessions > 0);
  const hasRequests = leads > 0 || daily.some((row) => row.leads > 0);
  const conversion = sessions > 0 ? (leads / sessions) * 100 : null;
  const conversionText =
    conversion === null
      ? 'no visits to compare against yet'
      : `${(conversion >= 10 ? Math.round(conversion) : Math.round(conversion * 10) / 10).toLocaleString('en-IE')}% of all visits`;

  if (error) {
    return (
      <div className="grid gap-5">
        <Notice kind="error">{error}</Notice>
        <p className="text-sm leading-relaxed text-stone">
          Nothing is broken on the website itself. This screen only reads the numbers.
        </p>
        <div>
          <Btn variant="ghost" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Btn>
        </div>
      </div>
    );
  }

  const topSources = sources.slice(0, SOURCE_LIMIT);
  const restSources = sources.length - topSources.length;
  const topPages = pages.slice(0, PAGE_LIMIT);

  return (
    <div className="grid gap-6">
      {/* 1. The numbers, in the order the client reads them out loud. */}
      {loading ? (
        <Spinner label="Reading the numbers" />
      ) : (
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-3 xl:grid-cols-6">
          <Stat
            label="Visitors"
            value={fmtNumber(overview?.visitors)}
            hint="different people, counted once a day"
          />
          <Stat
            label="Visits"
            value={fmtNumber(sessions)}
            hint="one stay on the site, however many pages it covered"
          />
          <Stat
            label="Pages viewed"
            value={fmtNumber(overview?.views)}
            hint="every page opened, added up"
          />
          <Stat
            label="Average time"
            value={fmtDuration(overview?.avg_seconds)}
            hint="how long a visit lasts, on average"
          />
          <Stat
            label="Requests"
            value={fmtNumber(leads)}
            tone="gold"
            hint={`people who asked for a price, ${conversionText}`}
          />
          <Stat
            label="Campaign clicks"
            value={fmtNumber(overview?.link_clicks)}
            hint="clicks on your own links: posts, flyers, QR codes"
          />
        </div>
      )}

      {/* 2. The two measures over time, one x axis, two separate charts. */}
      <Panel title={`Visits per ${per}`}>
        {loading ? (
          <Spinner label="Drawing the days" />
        ) : !hasTraffic && !hasRequests ? (
          <Empty>Nothing recorded in this period yet.</Empty>
        ) : (
          <>
            {/* The line's own end labels stay hidden: the axis under the pair
                is the shared one, and two date rows read as two scales. */}
            {hasTraffic ? (
              <div className="[&_figcaption]:hidden">
                <TimeSeries points={visitPoints} height={200} />
              </div>
            ) : (
              <Empty>No visits recorded in this period yet.</Empty>
            )}

            <div className="mt-7 flex items-baseline justify-between gap-4 border-t border-ink/10 pt-4">
              <Caps>Requests per {per}</Caps>
              <span className="font-sans text-[0.7rem] tabular-nums text-stone">
                {fmtNumber(leads)} in this period
              </span>
            </div>
            <div className="mt-3">
              <BarStrip
                points={leadPoints}
                unit={bucket === 'day' ? 'requests on' : 'requests from'}
              />
            </div>

            <AxisTicks points={leadPoints} />

            {bucket !== 'day' && (
              <p className="mt-3 text-[0.72rem] leading-relaxed text-stone">
                Each point covers a {per}, dated by its first day.
              </p>
            )}

            {leads === 0 && (
              <p className="mt-3 text-[0.74rem] leading-relaxed text-stone">
                No one has asked for a price in this period.
              </p>
            )}
          </>
        )}
      </Panel>

      {/* 3. Where they came from, and what they actually read. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Where the visits come from">
          {loading ? (
            <Spinner label="Sorting the sources" />
          ) : (
            <>
              <RankBars
                rows={topSources.map((row) => ({
                  key: row.source,
                  label: row.source,
                  value: row.sessions,
                  note:
                    row.leads > 0
                      ? `${fmtNumber(row.leads)} ${row.leads === 1 ? 'request' : 'requests'}`
                      : undefined,
                }))}
                renderRight={(row) => fmtNumber(row.value)}
                emptyLabel="No visits recorded in this period yet."
              />
              {restSources > 0 && (
                <p className="mt-3 text-[0.72rem] leading-relaxed text-stone">
                  and {fmtNumber(restSources)} smaller sources with fewer visits each
                </p>
              )}
              {topSources.length > 0 && (
                <p className="mt-3 text-[0.72rem] leading-relaxed text-stone">
                  A source with requests next to it is a source that brought you work.
                </p>
              )}
            </>
          )}
        </Panel>

        <Panel title="Most visited pages">
          {loading ? (
            <Spinner label="Counting the pages" />
          ) : (
            <>
              <RankBars
                rows={topPages.map((row) => ({
                  key: row.path,
                  label: row.path,
                  value: row.views,
                  note: row.avg_seconds > 0 ? fmtDuration(row.avg_seconds) : undefined,
                }))}
                renderRight={(row) => fmtNumber(row.value)}
                emptyLabel="No pages opened in this period yet."
              />
              {topPages.length > 0 && (
                <p className="mt-3 text-[0.72rem] leading-relaxed text-stone">
                  The number is how many times the page was opened, the time beside it is how
                  long people stayed on it.
                </p>
              )}
            </>
          )}
        </Panel>
      </div>

      {/* 4. The quiet footnote that keeps the numbers honest. */}
      <Panel title="How this is measured">
        <div className="grid gap-2 text-sm leading-relaxed text-ink md:max-w-3xl">
          <p>The website counts its own visits, on your own database.</p>
          <p>The counting uses no cookies, and sends nothing to Google or Facebook.</p>
          <p>
            The same person is counted once a day, so someone who comes back in the evening does
            not appear twice.
          </p>
          <p>Time on a page is only counted while that page is actually on screen.</p>
        </div>
      </Panel>
    </div>
  );
}

/**
 * The one x axis under the pair of charts, and the only date row printed for
 * them. The points arrive already grouped to fit the panel, so all that
 * happens here is the thinning of the written dates down to four, which is
 * what keeps them from colliding on a phone.
 */
function AxisTicks({ points }: { points: Point[] }) {
  if (points.length < 2) return null;

  const last = points.length - 1;
  const count = Math.min(4, points.length);
  const seen = new Set<number>();
  const ticks: number[] = [];
  for (let k = 0; k < count; k += 1) {
    const index = Math.round((k * last) / (count - 1));
    if (!seen.has(index)) {
      seen.add(index);
      ticks.push(index);
    }
  }

  return (
    <div className="relative mt-2 h-4" aria-hidden="true">
      {ticks.map((index) => {
        const pct = (index / last) * 100;
        const shift = pct === 0 ? 'none' : pct === 100 ? 'translateX(-100%)' : 'translateX(-50%)';
        return (
          <span
            key={index}
            className="absolute top-0 whitespace-nowrap font-sans text-[0.62rem] tabular-nums text-stone"
            style={{ left: `${pct}%`, transform: shift }}
          >
            {points[index].label}
          </span>
        );
      })}
    </div>
  );
}
