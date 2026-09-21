// Single source of truth for business facts. Everything visible on the site
// must come from here or from the client's flyer, never invented.
export const SITE = {
  name: 'BPE Cleaning Services',
  tagline: 'Where Clean Meets Perfection',
  phoneDisplay: '089 960 5606',
  phoneHref: 'tel:+353899605606',
  whatsappHref: 'https://wa.me/353899605606',
  email: 'bpecleaning98@gmail.com',
  area: 'Dublin, Ireland',
  hours: 'Mon to Sun, 8:00 to 20:00',
  /**
   * Google Business Profile, verified on the client's own Google account on
   * 2 September 2026. The CID is the decimal form of the place's feature id
   * (0x70ded41ebb73ac50), so the Maps link survives any renaming of the listing.
   * The review link is the one Google hands out in Business Profile > Ask for
   * reviews.
   */
  googleMapsUrl: 'https://maps.google.com/?cid=8133171205536722000',
  googleReviewUrl: 'https://g.page/r/CVCsc7se1N5wEBM/review',
} as const;

// Prices live in ./pricing.ts and areas in ./areas.ts. Both were revised by the
// client on 5 Aug 2026 and override the original flyer. Never hardcode a price
// or a county in a component.
export { HOURLY, FIXED, EXTRAS, VAT_NOTE, VAT_LABEL } from './pricing';
export { COUNTIES, AREAS_SENTENCE } from './areas';

export const SERVICES = [
  {
    slug: '/house-cleaning-dublin/',
    name: 'House Cleaning',
    from: 'from €20/h',
    blurb: 'Regular home cleaning on your schedule, weekly, bi-weekly or once-off. Minimum booking 3 hours.',
  },
  {
    slug: '/deep-cleaning-dublin/',
    name: 'Deep Cleaning',
    from: 'from €220',
    blurb: 'A top-to-bottom once-off clean, limescale removal, appliance exteriors, skirting boards and more.',
  },
  {
    slug: '/end-of-tenancy-cleaning-dublin/',
    name: 'End of Tenancy Cleaning',
    from: 'from €220',
    blurb: 'Move out with your deposit intact. A landlord-ready clean for apartments and houses.',
  },
  {
    slug: '/after-builders-cleaning-dublin/',
    name: 'After Builders Cleaning',
    from: 'from €300',
    blurb: 'Dust, paint spots and construction residue gone. Your new space ready to live in.',
  },
  {
    slug: '/office-cleaning-dublin/',
    name: 'Office Cleaning',
    from: 'from €25/h',
    blurb: 'Reliable cleaning for offices and commercial spaces, scheduled around your working hours.',
  },
  {
    slug: '/airbnb-cleaning-dublin/',
    name: 'Airbnb Cleaning',
    from: 'from €100',
    blurb: 'Fast, guest-ready turnovers with linen change and restocking. Fixed prices per property size.',
  },
] as const;

/**
 * The legal identity behind the trading name, read by the footer, the terms
 * and the privacy page. Irish law wants these in a prominent place on the
 * website itself: section 151(4) of the Companies Act 2014 for a company
 * (name and legal form, place and number of registration, registered office)
 * and Regulation 7 of the E-Commerce Regulations, S.I. 68 of 2003, for any
 * business trading online (name, geographic address, email, the register it
 * is in and its number there, and the VAT number where it is VAT registered).
 *
 * Every field is null until it has been read off the CRO certificate or
 * confirmed by the owner in writing. A null field is simply not rendered.
 * Nothing here is guessed: a wrong company number on a website is worse
 * than a missing one, and the missing ones are listed in docs/CABINET-RO.md
 * as things the owner has to supply.
 */
export const LEGAL: {
  /** Exactly as it appears on the CRO certificate, e.g. "BPE Cleaning Services Limited". */
  registeredName: string | null;
  /** "a private company limited by shares", or for a sole trader "a business name registered by <owner>". */
  legalForm: string | null;
  /** The CRO company number, or the business name registration number. */
  croNumber: string | null;
  /** The registered office, or the business address for a sole trader. */
  registeredOffice: string | null;
  /** Only if the business is registered for VAT. */
  vatNumber: string | null;
  /** When the four legal pages were last checked against the code and the law. */
  updated: string;
} = {
  registeredName: null,
  legalForm: null,
  croNumber: null,
  registeredOffice: null,
  vatNumber: null,
  updated: '14 September 2026',
};

/**
 * The particulars as one sentence, or null while none are known. The footer
 * and the legal pages all read this one function, so the wording cannot
 * drift between them.
 */
export function legalParticulars(): string | null {
  const parts: string[] = [];
  if (LEGAL.registeredName) {
    parts.push(
      `Registered in Ireland as ${LEGAL.registeredName}${LEGAL.legalForm ? `, ${LEGAL.legalForm}` : ''}`
    );
  }
  if (LEGAL.croNumber) parts.push(`${parts.length ? 'company' : 'Company'} number ${LEGAL.croNumber}`);
  if (LEGAL.registeredOffice) parts.push(`${parts.length ? 'registered' : 'Registered'} office ${LEGAL.registeredOffice}`);
  if (LEGAL.vatNumber) parts.push(`${parts.length ? 'VAT' : 'VAT'} number ${LEGAL.vatNumber}`);
  return parts.length ? `${parts.join(', ')}.` : null;
}
