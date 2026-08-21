import { SITE } from '../data/site';

/**
 * The notification that reaches the owner when somebody asks for a price.
 *
 * WHY IT EXISTS. The quote form hands the visitor to WhatsApp, which is where
 * the work is actually scheduled, and /api/lead writes the same request into
 * Supabase so the cabinet can show it later. Neither of those makes a phone
 * buzz. A request that arrives while she is on a job and is only discovered
 * that evening is a request a faster competitor already answered, so the mail
 * below exists for one job: to put the name and the phone number on her lock
 * screen the moment the form is submitted.
 *
 * WHY RESEND AND NOT HER OWN GMAIL. Sending from her address to her address
 * is the obvious idea and the wrong one: Gmail files mail you sent yourself
 * without raising a notification on most phones, which loses the only thing
 * this feature is for. Mail from an outside sender always announces itself.
 * It also arrives with SPF and DKIM signed for bpecleaning.ie, so it reads as
 * the business writing to itself rather than as something to distrust.
 *
 * NOTHING HERE MAY EVER BREAK A BOOKING. Every failure is swallowed and
 * reported as a status string. The caller answers 200 either way, and the
 * visitor has already been handed to WhatsApp by the time this runs.
 */

const env = (key: string): string | undefined =>
  (typeof process !== 'undefined' ? process.env?.[key] : undefined) ||
  // Optional chained, unlike the copy in db.ts, because this module is also
  // rendered outside Astro by scripts/preview-email.ts, where import.meta
  // carries no env at all and a plain index would throw.
  (import.meta as { env?: Record<string, string | undefined> }).env?.[key];

/**
 * Vercel kills a function the moment it answers, so this cannot be left to
 * finish in the background: it is awaited inside the request. Five seconds is
 * the ceiling on how long a slow mail API is allowed to hold up a response
 * that the browser is no longer waiting on anyway.
 */
const TIMEOUT_MS = 5000;

/** The palette, straight out of global.css. Email gets hex, not variables. */
const NIGHT = '#14110D';
const INK = '#191512';
const CREAM = '#EFEAE0';
const PORCELAIN = '#F5F2EC';
const GOLD = '#A8875A';
const STONE = '#857D70';

export interface LeadMail {
  name: string;
  phone: string;
  service: string | null;
  size: string | null;
  date: string | null;
  area: string | null;
  notes: string | null;
  /** Where the visitor came from, for the quiet line at the foot. */
  source: string | null;
  campaign: string | null;
  linkCode: string | null;
  landing: string | null;
}

/** Everything below is pasted into HTML, and all of it is typed by a stranger. */
function esc(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Digits only, so the tel: link works whatever the visitor typed. */
function telHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (!digits) return '';
  // A local Irish number is stored as the visitor typed it, 08x..., and has to
  // become +3538x... before a phone will dial it from the mail app.
  if (digits.startsWith('+')) return `tel:${digits}`;
  if (digits.startsWith('00')) return `tel:+${digits.slice(2)}`;
  if (digits.startsWith('0')) return `tel:+353${digits.slice(1)}`;
  return `tel:${digits}`;
}

function waHref(phone: string): string {
  const t = telHref(phone).replace('tel:+', '');
  return t ? `https://wa.me/${t}` : SITE.whatsappHref;
}

/** Dublin time, always, whatever region the function happened to run in. */
function stamp(): string {
  try {
    return new Intl.DateTimeFormat('en-IE', {
      timeZone: 'Europe/Dublin',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 16).replace('T', ' ');
  }
}

/**
 * The one line Gmail shows under the subject in the notification and in the
 * inbox list. It carries what she needs to decide whether to call now, so the
 * mail does not have to be opened at all to be useful.
 */
function preheader(lead: LeadMail): string {
  return [lead.service, lead.size, lead.area, lead.date].filter(Boolean).join(' · ') || 'New request from the website';
}

/**
 * The subject is the notification. Name and number go in it on purpose: a
 * glance at a locked screen should be enough to ring somebody back.
 */
function subject(lead: LeadMail): string {
  const who = lead.name?.trim() || 'Someone';
  return lead.phone?.trim() ? `New request · ${who} · ${lead.phone.trim()}` : `New request · ${who}`;
}

/**
 * Where the request came from, in one readable line.
 *
 * Deduplicated on purpose: /go/[code] writes the campaign and the link code
 * from the same short code, so a flyer scan arrives with "flyer-oct" twice
 * and would print "flyer-oct · flyer-oct" for the rest of the campaign's
 * life. Matching is case insensitive because utm tags are typed by hand.
 */
function originOf(lead: LeadMail): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const part of [lead.source, lead.campaign, lead.linkCode]) {
    const value = part?.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(value);
  }
  return parts.join(' · ');
}

/** One row of the detail table. Skipped entirely when the visitor left it blank. */
function row(label: string, value: string | null, last = false): string {
  if (!value || !value.trim()) return '';
  const border = last ? '' : `border-bottom:1px solid rgba(133,125,112,0.22);`;
  return `<tr>
    <td style="${border}padding:14px 0 14px 0;width:104px;vertical-align:top;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:${STONE};">${esc(label)}</td>
    <td style="${border}padding:14px 0 14px 0;vertical-align:top;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:${INK};">${esc(value)}</td>
  </tr>`;
}

/** A button that is a padded table cell, because that is what survives Gmail. */
function button(href: string, label: string, bg: string, fg: string, border: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block;margin:0 8px 8px 0;">
    <tr><td style="background:${bg};border:1px solid ${border};border-radius:2px;">
      <a href="${esc(href)}" style="display:block;padding:15px 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;letter-spacing:0.02em;color:${fg};text-decoration:none;">${esc(label)}</a>
    </td></tr>
  </table>`;
}

function html(lead: LeadMail): string {
  const tel = telHref(lead.phone || '');
  const wa = waHref(lead.phone || '');
  const origin = originOf(lead);

  const rows =
    row('Service', lead.service) +
    row('Property', lead.size) +
    row('Area', lead.area) +
    row('Preferred date', lead.date) +
    row('Notes', lead.notes, true);

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(subject(lead))}</title>
</head>
<body style="margin:0;padding:0;background:${PORCELAIN};">
<!-- The notification snippet. Hidden in the body, read by the inbox list. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader(lead))}</div>
<div style="display:none;max-height:0;overflow:hidden;">&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PORCELAIN};">
<tr><td align="center" style="padding:24px 12px 40px 12px;">

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid rgba(133,125,112,0.2);">

    <!-- Header band. Dark on purpose: it is the one part Gmail's dark theme
         leaves alone, so the mail is recognisable in either mode. -->
    <tr><td style="background:${NIGHT};padding:22px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
        <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${GOLD};">BPE Cleaning Services</td>
        <td align="right" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.1em;color:rgba(239,234,224,0.6);">${esc(stamp())}</td>
      </tr></table>
    </td></tr>

    <!-- The two things worth waking up for: who, and what number to ring. -->
    <tr><td style="padding:34px 28px 8px 28px;">
      <p style="margin:0 0 10px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${GOLD};">New request</p>
      <p style="margin:0 0 4px 0;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.2;color:${INK};">${esc(lead.name || 'No name given')}</p>
      ${
        lead.phone
          ? `<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;line-height:1.4;letter-spacing:0.02em;"><a href="${esc(tel)}" style="color:${INK};text-decoration:none;">${esc(lead.phone)}</a></p>`
          : `<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:${STONE};">No phone number given</p>`
      }
    </td></tr>

    <!-- Ringing back is the whole job, so it is one tap and it is first. -->
    ${
      lead.phone
        ? `<tr><td style="padding:22px 28px 6px 28px;">
             ${button(tel, 'Call now', NIGHT, CREAM, NIGHT)}
             ${button(wa, 'WhatsApp', '#FFFFFF', INK, 'rgba(133,125,112,0.45)')}
           </td></tr>`
        : ''
    }

    ${
      rows
        ? `<tr><td style="padding:14px 28px 8px 28px;">
             <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid rgba(133,125,112,0.22);">${rows}</table>
           </td></tr>`
        : ''
    }

    <!-- Which channel produced this. Quiet, because it matters at the end of
         the month, not at the moment the phone buzzes. -->
    <tr><td style="padding:18px 28px 28px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PORCELAIN};">
        <tr><td style="padding:14px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:${STONE};">
          Came from <strong style="color:${INK};font-weight:600;">${esc(origin || 'Direct')}</strong>${lead.landing ? ` &nbsp;·&nbsp; landed on ${esc(lead.landing)}` : ''}<br>
          <a href="https://bpecleaning.ie/admin" style="color:${GOLD};text-decoration:underline;">Open the cabinet</a> to change the status or add a note.
        </td></tr>
      </table>
    </td></tr>

  </table>

  <p style="margin:18px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${STONE};">
    Sent automatically by bpecleaning.ie when the quote form is submitted.
  </p>

</td></tr>
</table>
</body></html>`;
}

/** Plain text twin. Some phones show it, and every spam filter reads it. */
function text(lead: LeadMail): string {
  const lines = [
    'NEW REQUEST — BPE Cleaning Services',
    stamp(),
    '',
    `Name:  ${lead.name || 'not given'}`,
    `Phone: ${lead.phone || 'not given'}`,
  ];
  if (lead.service) lines.push(`Service: ${lead.service}`);
  if (lead.size) lines.push(`Property: ${lead.size}`);
  if (lead.area) lines.push(`Area: ${lead.area}`);
  if (lead.date) lines.push(`Preferred date: ${lead.date}`);
  if (lead.notes) lines.push('', `Notes: ${lead.notes}`);
  lines.push(
    '',
    `Came from: ${originOf(lead) || 'Direct'}`,
    '',
    'Cabinet: https://bpecleaning.ie/admin'
  );
  return lines.join('\n');
}

/**
 * The finished message, without sending it. Exported so the template can be
 * looked at in a browser before it is ever put in front of a customer's
 * request: an email that renders wrong is only ever discovered by the person
 * it was written for, which is too late.
 */
export function renderLeadEmail(lead: LeadMail): { subject: string; html: string; text: string } {
  return { subject: subject(lead), html: html(lead), text: text(lead) };
}

export type MailResult = 'sent' | 'not-configured' | 'failed';

/**
 * Hands the request to Resend over plain fetch. No SDK: the whole call is one
 * POST, and a dependency that ships into a serverless bundle has to earn its
 * place. Returns a status and never throws.
 */
export async function sendLeadEmail(lead: LeadMail): Promise<MailResult> {
  const key = env('RESEND_API_KEY');
  if (!key) return 'not-configured';

  const to = env('LEAD_EMAIL_TO') || SITE.email;
  // The display name is what shows on the lock screen next to the subject, so
  // it says where the request came from rather than repeating the company.
  const from = env('LEAD_EMAIL_FROM') || 'BPE website <requests@bpecleaning.ie>';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject: subject(lead),
        html: html(lead),
        text: text(lead),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}
