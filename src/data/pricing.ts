/**
 * Single source of truth for every price shown on the site and used by the quiz.
 *
 * Nothing here is invented. Two sources only:
 *   1. The price flyer the client sent on 25 July 2026.
 *   2. The client's WhatsApp corrections of 5 August 2026, which OVERRIDE the flyer.
 *
 * Client corrections of 5 Aug 2026, verbatim:
 *   - "La rata pentru regular cleaning as vrea sa pun start from 20 EUR/h"
 *   - "La rata pentru deep cleaning as vrea sa pun start from 25 EUR/h,
 *      post construction cleaning sa pun start from 30 EUR/h"
 *   - "As vrea sa scot Ironing si laundry services."
 *   - "Preturile nu includ TVA"
 *   - "Pentru end of tenancy si deep cleaning preturile la fel"
 *
 * STILL UNCONFIRMED, do not guess in the UI:
 *   - studio rate (we assume the 1 bedroom rate, marked below)
 *   - office rates: the client lowered house/deep/after-builders hourly rates but
 *     said nothing about office, so office stays at the flyer figures
 */

/** Hourly rates. Advertised as "from", per the client's 5 Aug wording. */
export const HOURLY = {
  regular: { from: 20, label: 'from €20/h', minHours: 3 },
  deep: { from: 25, label: 'from €25/h' },
  afterBuilders: { from: 30, label: 'from €30/h' },
  // Not revised by the client on 5 Aug. Flyer figures retained.
  officeRegular: { from: 25, to: 30, label: '€25 to €30/h' },
  officeDeep: { from: 35, to: 45, label: '€35 to €45/h' },
} as const;

export type SizeKey = 'studio' | '1bed' | '2bed' | '3bed' | '4bed';

export const SIZE_LABELS: Record<SizeKey, string> = {
  studio: 'Studio',
  '1bed': '1 Bedroom',
  '2bed': '2 Bedrooms',
  '3bed': '3 Bedrooms',
  '4bed': '4 Bedrooms',
};

/**
 * Fixed prices per property size, from the flyer.
 * `studio` mirrors the 1 bedroom rate. NOT yet confirmed by the client,
 * see UNCONFIRMED note at the top of this file.
 */
export const FIXED: Record<'deep' | 'afterBuilders' | 'airbnbTurnover' | 'airbnbDeep', Record<SizeKey, number>> = {
  deep: { studio: 220, '1bed': 220, '2bed': 320, '3bed': 450, '4bed': 600 },
  afterBuilders: { studio: 300, '1bed': 300, '2bed': 450, '3bed': 650, '4bed': 850 },
  airbnbTurnover: { studio: 100, '1bed': 100, '2bed': 150, '3bed': 220, '4bed': 300 },
  airbnbDeep: { studio: 220, '1bed': 220, '2bed': 320, '3bed': 450, '4bed': 600 },
};

/** End of tenancy is priced exactly as deep cleaning. Confirmed 5 Aug 2026. */
export const END_OF_TENANCY = FIXED.deep;

/**
 * Add-ons. Ironing (€25/h) and laundry (from €20/load) were on the flyer and
 * were REMOVED at the client's request on 5 Aug 2026. Do not reinstate them
 * without her saying so.
 */
export const EXTRAS = [
  { key: 'oven', name: 'Oven cleaning', price: 60, label: '€60', from: false },
  { key: 'fridge', name: 'Fridge cleaning', price: 40, label: '€40', from: false },
  { key: 'windows', name: 'Interior windows', price: 10, label: 'from €10 per window', from: true },
  { key: 'carpet', name: 'Carpet cleaning', price: 4, label: 'from €4 per m²', from: true },
] as const;

/** Recurring discounts, from the flyer. Applied to the recurring clean only. */
export const DISCOUNTS = {
  weekly: { pct: 10, label: 'Save 10%' },
  biweekly: { pct: 5, label: 'Save 5%' },
  monthly: { pct: 0, label: 'Contract, priced on request' },
} as const;

/**
 * The client is not VAT registered on these figures: "Preturile nu includ TVA"
 * (5 Aug 2026). Every price table must carry this line so no customer is
 * surprised at invoicing.
 */
export const VAT_NOTE = 'All prices are exclusive of VAT.';

/** Shown wherever an estimate appears, so no on-screen figure is binding. */
export const ESTIMATE_NOTE = 'Your final price is confirmed before we book you in.';
