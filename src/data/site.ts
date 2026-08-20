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
} as const;

// Prices live in ./pricing.ts and areas in ./areas.ts. Both were revised by the
// client on 5 Aug 2026 and override the original flyer. Never hardcode a price
// or a county in a component.
export { HOURLY, FIXED, EXTRAS, VAT_NOTE } from './pricing';
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
