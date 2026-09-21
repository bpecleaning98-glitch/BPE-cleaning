/**
 * Counties served, confirmed by the client on 5 August 2026 in answer to
 * "In ce zone oferiti serviciile?". She listed eight counties, in this order.
 *
 * SEO note: Dublin stays the primary target. It carries the search volume, the
 * page slugs are already Dublin-scoped, and Google Business Profile will be set
 * up as a Dublin service-area business. The other seven counties are published
 * as a coverage list, not as separate landing pages. Building a thin page per
 * county before the core pages rank would dilute the site, not help it.
 */

export type County = {
  name: string;
  /** Primary market gets more prominence in the UI. */
  primary: boolean;
};

export const COUNTIES: County[] = [
  { name: 'County Dublin', primary: true },
  { name: 'County Kildare', primary: false },
  { name: 'County Wicklow', primary: false },
  { name: 'County Louth', primary: false },
  { name: 'County Westmeath', primary: false },
  { name: 'County Offaly', primary: false },
  { name: 'County Carlow', primary: false },
  { name: 'County Meath', primary: false },
];

/** For schema.org areaServed and for meta descriptions. */
export const COUNTY_NAMES = COUNTIES.map((c) => c.name);

/** Short prose version, for body copy and the footer. */
export const AREAS_SENTENCE =
  'We cover County Dublin and travel across Kildare, Wicklow, Louth, Westmeath, Offaly, Carlow and Meath.';

/**
 * Searchers use town and suburb names, not county boundaries. These are
 * useful locality examples inside the eight confirmed counties, published on
 * one substantial coverage page rather than as near-identical doorway pages.
 * The page always asks for an Eircode before promising availability.
 */
export const LOCALITIES: Record<(typeof COUNTIES)[number]['name'], readonly string[]> = {
  'County Dublin': [
    'Dublin City Centre',
    'Swords',
    'Malahide',
    'Howth',
    'Blanchardstown',
    'Lucan',
    'Clondalkin',
    'Tallaght',
    'Rathfarnham',
    'Sandyford',
    'Blackrock',
    'Dún Laoghaire',
  ],
  'County Kildare': ['Naas', 'Newbridge', 'Maynooth', 'Leixlip', 'Celbridge', 'Kildare Town', 'Athy'],
  'County Wicklow': ['Bray', 'Greystones', 'Wicklow Town', 'Arklow', 'Blessington', 'Enniskerry'],
  'County Louth': ['Drogheda', 'Dundalk', 'Ardee'],
  'County Westmeath': ['Athlone', 'Mullingar', 'Moate'],
  'County Offaly': ['Tullamore', 'Birr', 'Edenderry'],
  'County Carlow': ['Carlow Town', 'Tullow', 'Bagenalstown'],
  'County Meath': ['Ashbourne', 'Ratoath', 'Dunboyne', 'Navan', 'Trim', 'Kells'],
};
