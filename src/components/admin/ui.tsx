import type { CSSProperties, ReactNode } from 'react';

/**
 * The cabinet's building blocks, in the site's own language: porcelain and
 * ivory surfaces, hairline borders, sharp corners, tracked uppercase labels,
 * serif reserved for voice and sans reserved for data. Nothing here invents
 * a second design system for the back office.
 */

export function Caps({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`font-sans text-[0.6rem] font-semibold uppercase tracking-[0.26em] text-stone ${className}`}
    >
      {children}
    </span>
  );
}

export function Panel({
  title,
  action,
  children,
  className = '',
  pad = true,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section className={`border border-ink/12 bg-ivory ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-4 border-b border-ink/10 px-5 py-4">
          <h2 className="font-sans text-[0.62rem] font-semibold uppercase tracking-[0.26em] text-gold-deep">
            {title}
          </h2>
          {action}
        </header>
      )}
      <div className={pad ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

/**
 * A headline number. Sans, not serif: on this site serif carries voice and
 * sans carries data, and a big serif figure reads as decoration.
 */
export function Stat({
  label,
  value,
  hint,
  tone = 'ink',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'ink' | 'gold';
}) {
  return (
    <div className="border-t border-ink/12 pt-4">
      <Caps>{label}</Caps>
      <p
        className={`mt-2 font-sans text-[2rem] font-medium leading-none tracking-[-0.02em] tabular-nums md:text-[2.4rem] ${
          tone === 'gold' ? 'text-gold-deep' : 'text-ink'
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-2 text-[0.72rem] leading-relaxed text-stone">{hint}</p>}
    </div>
  );
}

type BtnProps = {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
  title?: string;
};

export function Btn({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
  title,
}: BtnProps) {
  const base =
    'inline-flex items-center justify-center gap-2 border font-sans font-semibold uppercase tracking-[0.2em] transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold';
  // sm buttons are the client's primary phone actions (Copy, Edit, Delete,
  // Export). py-3 on phones lifts them to ~40px; md restores the desktop size.
  const sizes = size === 'sm' ? 'px-4 py-3 text-[0.6rem] md:py-2' : 'px-6 py-3 text-[0.66rem]';
  const tones = {
    primary: 'border-ink bg-ink text-cream hover:bg-transparent hover:text-ink',
    ghost: 'border-ink/25 text-ink hover:border-ink',
    danger: 'border-red-800/40 text-red-800 hover:border-red-800 hover:bg-red-800 hover:text-cream',
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${sizes} ${tones} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
  className = '',
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <Caps>{label}</Caps>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1.5 text-[0.7rem] leading-relaxed text-stone">{hint}</p>}
    </label>
  );
}

/* text-base on phones is not styling, it is an iOS rule: Safari zooms the
 * whole page when a field under 16px gets focus, and leaves it zoomed. */
export const inputClass =
  'w-full border-b border-ink/25 bg-transparent py-2.5 font-sans text-base text-ink placeholder:text-ink/30 transition-colors focus:border-gold-deep focus:outline-none md:text-sm';

export const areaClass =
  'w-full border border-ink/20 bg-porcelain/60 p-3 font-sans text-base leading-relaxed text-ink transition-colors focus:border-gold-deep focus:outline-none md:text-sm';

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-3 py-2.5 -my-2.5"
    >
      <span
        className={`relative h-4 w-9 border transition-colors ${
          checked ? 'border-gold-deep bg-gold-deep' : 'border-ink/30 bg-transparent'
        }`}
      >
        <span
          className={`absolute top-[1px] h-[12px] w-[12px] transition-all ${
            checked ? 'left-[22px] bg-cream' : 'left-[1px] bg-ink/40'
          }`}
        />
      </span>
      <Caps className="!text-ink">{label}</Caps>
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="border border-dashed border-ink/15 px-5 py-10 text-center text-sm text-stone">
      {children}
    </p>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <p className="flex items-center gap-3 py-8 text-sm text-stone">
      <span className="inline-block h-3 w-3 animate-pulse bg-gold-deep" />
      {label}…
    </p>
  );
}

/** Inline result line for a save, a copy, an error. Never a browser alert. */
export function Notice({ kind, children }: { kind: 'ok' | 'error' | 'info'; children: ReactNode }) {
  const tone = {
    ok: 'border-gold-deep/40 text-gold-deep',
    error: 'border-red-800/40 text-red-800',
    info: 'border-ink/20 text-stone',
  }[kind];
  return (
    <p className={`border-l-2 py-1 pl-3 text-[0.78rem] leading-relaxed ${tone}`}>{children}</p>
  );
}

/** Segmented control, used for the date range and for status filters. */
export function Segments<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap border border-ink/15">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          onClick={() => onChange(option.value)}
          className={`min-h-10 grow px-3 py-2.5 font-sans text-[0.6rem] font-semibold uppercase tracking-[0.2em] transition-colors md:min-h-0 md:grow-0 md:py-2 ${
            option.value === value
              ? 'bg-ink text-cream'
              : 'text-stone hover:text-ink'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Row({
  children,
  className = '',
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 border-b border-ink/8 py-2.5 last:border-b-0 ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'gold' | 'muted' }) {
  const tones = {
    neutral: 'border-ink/25 text-ink',
    gold: 'border-gold-deep/50 text-gold-deep',
    muted: 'border-ink/12 text-stone',
  }[tone];
  return (
    <span
      className={`inline-flex items-center border px-2 py-[3px] font-sans text-[0.58rem] font-semibold uppercase tracking-[0.18em] ${tones}`}
    >
      {children}
    </span>
  );
}
