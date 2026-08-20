/**
 * Structured data for the static pages.
 *
 * Everything here is a small pure function that returns a plain object. Nothing
 * renders, nothing touches the DOM, and nothing is stringified here: the pages
 * pass the result to the `jsonLd` prop on Base.astro, which writes the single
 * <script type="application/ld+json"> in the head.
 *
 * THE ONE RULE: every value below is read from src/data. There is no literal in
 * this file that states a fact about the company. If a schema.org property needs
 * a fact the repo does not hold, the property is left out rather than guessed.
 * That is why there is no aggregateRating, no reviewCount, no foundingDate, no
 * geo coordinates, no streetAddress and no sameAs. Inventing any of them is the
 * fastest way to get structured data ignored or penalised.
 *
 * Node identity: the business is one entity across the whole site, so it always
 * carries the same @id, https://bpecleaning.ie/#business. Pages that describe
 * something else (a Service, an FAQ, a trail) point at that @id instead of
 * restating the business.
 */

import { SITE, SERVICES } from '../data/site';
import { COUNTIES } from '../data/areas';
import { HOURLY, FIXED, END_OF_TENANCY } from '../data/pricing';

/** A JSON-LD node. Loose on purpose: schema.org is open ended. */
export type JsonLdNode = Record<string, unknown>;

/** The service page slugs, straight off SERVICES, so a typo cannot compile. */
export type ServiceSlug = (typeof SERVICES)[number]['slug'];

export type Faq = { q: string; a: string };
export type Crumb = { name: string; path: string };

/**
 * Mirrors `site` in astro.config.mjs. It exists only so these helpers are total
 * functions: Astro.site is typed `URL | undefined` even though the config sets
 * it, and a schema block with relative URLs in it is worse than useless.
 */
const PRODUCTION_ORIGIN = 'https://bpecleaning.ie';

/**
 * Canonical paths, with the trailing slash, exactly as sitemap.xml.ts publishes
 * them and as the header and footer link to them. Service paths are not here:
 * they live in SERVICES as slugs.
 */
export const PATHS = {
  home: '/',
  services: '/services/',
  prices: '/prices/',
  quote: '/quote/',
  about: '/about/',
  contact: '/contact/',
  privacy: '/privacy/',
} as const;

function abs(path: string, site?: URL): string {
  return new URL(path, site ?? PRODUCTION_ORIGIN).href;
}

/**
 * E.164, derived from the tel: href rather than from the display string, so the
 * spacing a human reads on screen can change without breaking the machine form.
 */
const PHONE_E164 = SITE.phoneHref.replace(/^tel:/, '');

/**
 * dayOfWeek expects the DayOfWeek enumeration, not a word. A bare "Monday" is a
 * string literal as far as the vocabulary is concerned, so the full enumeration
 * IRI is what goes in.
 */
const DAY_NAMES = [
  'https://schema.org/Monday',
  'https://schema.org/Tuesday',
  'https://schema.org/Wednesday',
  'https://schema.org/Thursday',
  'https://schema.org/Friday',
  'https://schema.org/Saturday',
  'https://schema.org/Sunday',
] as const;

const DAY_INDEX: Record<string, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

/**
 * SITE.hours is prose, "Mon to Sun, 8:00 to 20:00", because that is how it is
 * shown on the page. It is parsed here rather than retyped, so the opening hours
 * in the search result and the opening hours on the page can never disagree.
 *
 * If the client ever changes the shape of that sentence, the parse fails and the
 * property is dropped. Publishing no hours is recoverable; publishing hours we
 * never read is a business turning up to a locked door.
 */
function openingHoursSpecification(): JsonLdNode[] {
  const days = /\b([a-z]{3})[a-z]*\s+to\s+([a-z]{3})[a-z]*\b/i.exec(SITE.hours);
  const times = /\b(\d{1,2}):(\d{2})\s+to\s+(\d{1,2}):(\d{2})\b/.exec(SITE.hours);
  if (!days || !times) return [];

  const start = DAY_INDEX[days[1].toLowerCase()];
  const end = DAY_INDEX[days[2].toLowerCase()];
  if (start === undefined || end === undefined) return [];

  const dayOfWeek: string[] = [];
  for (let i = start; ; i = (i + 1) % 7) {
    dayOfWeek.push(DAY_NAMES[i]);
    if (i === end || dayOfWeek.length === 7) break;
  }

  const clock = (h: string, m: string) => `${h.padStart(2, '0')}:${m}`;

  return [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek,
      opens: clock(times[1], times[2]),
      closes: clock(times[3], times[4]),
    },
  ];
}

/**
 * The eight counties from areas.ts, in the client's own order. AdministrativeArea
 * is the Place subtype for a named administrative region, which is what an Irish
 * county is. This is what puts "serving County Dublin and seven more" into the
 * hands of anything reading the page.
 */
function areaServed(): JsonLdNode[] {
  return COUNTIES.map((county) => ({
    '@type': 'AdministrativeArea',
    name: county.name,
  }));
}

/**
 * priceRange is free text and both ends of it are read as the cost of a job, so
 * both ends here are whole job figures. The low end is the cheapest booking a
 * customer can actually make, the lowest hourly rate multiplied by the shortest
 * booking we accept at it, which is the minimum the house cleaning page states on
 * screen. Putting the bare hourly figure there would advertise a clean for the
 * price of one hour of one. The high end is the dearest published fixed price.
 *
 * Nothing is rounded, nothing is assumed, and a price correction from the client
 * moves this string with it.
 */
function priceRange(): string {
  const fixedFigures = Object.values(FIXED).flatMap((tier) => Object.values(tier));
  const cheapestBooking = HOURLY.regular.from * HOURLY.regular.minHours;
  return `€${cheapestBooking} to €${Math.max(...fixedFigures)}`;
}

type Rate = {
  /** Hourly work carries the hour unit; fixed prices are per property. */
  kind: 'hourly' | 'fixed';
  /** The published "from" figure. */
  from: number;
  /** Only where the client publishes an upper figure as well, as offices do. */
  to?: number;
  /** Shortest booking we accept, where one applies. */
  minHours?: number;
};

/**
 * Every rate a service page publishes, in the order the page presents them.
 * Every figure is read from pricing.ts and none is typed by hand.
 *
 * A page that sells the same clean two ways gets one rate per way, because one
 * number cannot be the floor of both. Deep and after builders cleans are sold as
 * a fixed price per property size and also by the hour, and both are on screen.
 * Office cleaning is sold at a regular rate and a heavier deep rate, both ranges
 * on screen and both repeated in that page's FAQ, so the regular range alone
 * would publish a ceiling the page itself refutes.
 *
 * End of tenancy carries the deep cleaning hourly rate because pricing.ts prices
 * the two identically, confirmed by the client on 5 Aug 2026, and the page says
 * so in words where it offers the hourly alternative.
 *
 * No upper bound is published unless the client publishes one. Fixed price cleans
 * run from a 1 bedroom upwards and larger properties are priced individually, so
 * quoting a maximum on those would advertise a ceiling that does not exist.
 */
const SERVICE_RATES: Record<ServiceSlug, readonly Rate[]> = {
  '/house-cleaning-dublin/': [
    { kind: 'hourly', from: HOURLY.regular.from, minHours: HOURLY.regular.minHours },
  ],
  '/deep-cleaning-dublin/': [
    { kind: 'fixed', from: FIXED.deep['1bed'] },
    { kind: 'hourly', from: HOURLY.deep.from },
  ],
  '/end-of-tenancy-cleaning-dublin/': [
    { kind: 'fixed', from: END_OF_TENANCY['1bed'] },
    { kind: 'hourly', from: HOURLY.deep.from },
  ],
  '/after-builders-cleaning-dublin/': [
    { kind: 'fixed', from: FIXED.afterBuilders['1bed'] },
    { kind: 'hourly', from: HOURLY.afterBuilders.from },
  ],
  '/office-cleaning-dublin/': [
    { kind: 'hourly', from: HOURLY.officeRegular.from, to: HOURLY.officeRegular.to },
    { kind: 'hourly', from: HOURLY.officeDeep.from, to: HOURLY.officeDeep.to },
  ],
  '/airbnb-cleaning-dublin/': [{ kind: 'fixed', from: FIXED.airbnbTurnover['1bed'] }],
};

/**
 * One Offer per published rate. "from EUR 20 per hour" is a minimum price, not a
 * price, so it is modelled as a PriceSpecification with minPrice rather than as a
 * flat `price`. Quoting it as a price would tell a search engine the job costs
 * exactly that, and folding two rates into one minPrice would tell it the cheaper
 * one is the floor of both.
 *
 * An hourly rate is a UnitPriceSpecification carrying the hour unit, so nothing
 * reads a per hour figure as the price of the whole job. A fixed price per
 * property has no unit and is left as a plain PriceSpecification.
 *
 * valueAddedTaxIncluded is false because pricing.ts says so: the client is not
 * VAT registered on these figures and every price table on the site carries that
 * line.
 *
 * The offers deliberately carry no areaServed of their own. The eight counties
 * are already on the business node and on the Service node, and repeating them
 * once per offer added about three kilobytes to the homepage for nothing.
 */
function offersFor(slug: ServiceSlug, site?: URL): JsonLdNode[] {
  return SERVICE_RATES[slug].map((rate) => {
    const priceSpecification: JsonLdNode =
      rate.kind === 'hourly'
        ? {
            '@type': 'UnitPriceSpecification',
            priceCurrency: 'EUR',
            minPrice: rate.from,
            ...(rate.to === undefined ? {} : { maxPrice: rate.to }),
            // UN/CEFACT Common Code for the hour.
            unitCode: 'HUR',
            unitText: 'hour',
            valueAddedTaxIncluded: false,
          }
        : {
            '@type': 'PriceSpecification',
            priceCurrency: 'EUR',
            minPrice: rate.from,
            valueAddedTaxIncluded: false,
          };

    return {
      '@type': 'Offer',
      url: abs(slug, site),
      priceCurrency: 'EUR',
      priceSpecification,
      ...(rate.minHours === undefined
        ? {}
        : {
            eligibleQuantity: {
              '@type': 'QuantitativeValue',
              minValue: rate.minHours,
              unitCode: 'HUR',
              unitText: 'hour',
            },
          }),
    };
  });
}

function serviceEntry(slug: ServiceSlug) {
  const entry = SERVICES.find((service) => service.slug === slug);
  if (!entry) throw new Error(`No service in data/site.ts for ${slug}`);
  return entry;
}

/**
 * The business itself, and the reason this file exists. A local service business
 * lives or dies on whether the phone number, the hours and the service area are
 * legible to a machine.
 *
 * TYPE CHOICE. schema.org has no cleaning type. Checked against the published
 * vocabulary: the only cleaning adjacent class is DryCleaningOrLaundry, which is
 * garment dry cleaning and laundry, and the client removed ironing and laundry
 * from the price list on 5 Aug 2026, so claiming it would be a false statement
 * about what we sell. ProfessionalService was deprecated by schema.org itself for
 * being confused with Service. HomeAndConstructionBusiness is defined as "a
 * LocalBusiness that provides services around homes and buildings", which is
 * exactly a company cleaning homes, offices, rentals and post construction sites,
 * and it inherits every LocalBusiness property used below. It is the most
 * specific class that is still true.
 */
export function localBusiness(site?: URL): JsonLdNode {
  return {
    '@type': 'HomeAndConstructionBusiness',
    '@id': abs('/#business', site),
    name: SITE.name,
    slogan: SITE.tagline,
    url: abs(PATHS.home, site),
    telephone: PHONE_E164,
    email: SITE.email,
    image: abs('/og-image.jpg', site),
    logo: {
      '@type': 'ImageObject',
      url: abs('/icon-512.png', site),
    },
    /**
     * The repo holds exactly one location fact, SITE.area, "Dublin, Ireland", so
     * that is all this carries. No street, no Eircode, no coordinates: BPE is a
     * service area business and nobody in the repo has written down a trading
     * address. Google reports streetAddress as a missing recommended field until
     * the client supplies one, which is the honest state of affairs. Do not fill
     * it in with a plausible looking Dublin address.
     */
    address: {
      '@type': 'PostalAddress',
      addressLocality: SITE.area.split(',')[0].trim(),
      addressCountry: 'IE',
    },
    areaServed: areaServed(),
    openingHoursSpecification: openingHoursSpecification(),
    priceRange: priceRange(),
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Cleaning services',
      /**
       * One entry per published rate, so a service sold two ways appears at both
       * of its rates. The Service itself is written out once and referenced by
       * @id after that, so the second entry is still the same node rather than a
       * duplicate of it, and the catalogue does not carry the blurb twice.
       */
      itemListElement: SERVICES.flatMap((service) =>
        offersFor(service.slug, site).map((offer, i) => ({
          ...offer,
          itemOffered:
            i === 0
              ? {
                  '@type': 'Service',
                  '@id': abs(`${service.slug}#service`, site),
                  name: service.name,
                  description: service.blurb,
                  url: abs(service.slug, site),
                }
              : {
                  '@type': 'Service',
                  '@id': abs(`${service.slug}#service`, site),
                },
        }))
      ),
    },
  };
}

/**
 * A stub of the business, for pages that describe something else and only need to
 * say who is behind it: the provider of a Service, the publisher of an article.
 * Same @id as the full node above, so anything that reads both knows it is one
 * entity rather than two companies with the same name, and enough on its own to
 * be useful to anything that reads only the page it appears on.
 */
export function businessRef(site?: URL): JsonLdNode {
  return {
    '@type': 'HomeAndConstructionBusiness',
    '@id': abs('/#business', site),
    name: SITE.name,
    url: abs(PATHS.home, site),
    telephone: PHONE_E164,
    logo: {
      '@type': 'ImageObject',
      url: abs('/icon-512.png', site),
    },
  };
}

/** One of the six service pages. Name and blurb are the visible ones. */
export function serviceSchema(slug: ServiceSlug, site?: URL): JsonLdNode {
  const entry = serviceEntry(slug);
  const offers = offersFor(slug, site);
  return {
    '@type': 'Service',
    '@id': abs(`${slug}#service`, site),
    name: entry.name,
    serviceType: entry.name,
    description: entry.blurb,
    url: abs(slug, site),
    provider: businessRef(site),
    areaServed: areaServed(),
    // A single rate stays a single Offer. Where the page publishes two, both go
    // in, because either one alone misstates what the other costs.
    offers: offers.length === 1 ? offers[0] : offers,
  };
}

/**
 * The FAQ block a page already shows, marked up.
 *
 * The `faqs` array passed in here is the SAME array the page renders. It is never
 * copied, retyped or summarised, because structured data that does not match the
 * visible page is a policy violation, and a paraphrase is a mismatch.
 *
 * The @id is the page address itself, with no fragment. FAQPage is a subtype of
 * WebPage, and the last crumb of the breadcrumb below mints a WebPage at exactly
 * that address, so a fragment here would split one page into two entities that
 * never meet. Sharing the @id merges them: one node, typed FAQPage, carrying the
 * name and url the trail gives it.
 */
export function faqPage(faqs: readonly Faq[], path: string, site?: URL): JsonLdNode | null {
  if (!faqs.length) return null;
  return {
    '@type': 'FAQPage',
    '@id': abs(path, site),
    url: abs(path, site),
    mainEntity: faqs.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };
}

/**
 * The trail to the current page. Home is prepended here so no page has to
 * remember it, and the last crumb is the page itself.
 */
export function breadcrumbs(trail: readonly Crumb[], site?: URL): JsonLdNode | null {
  if (!trail.length) return null;
  const full: Crumb[] = [{ name: 'Home', path: PATHS.home }, ...trail];
  return {
    '@type': 'BreadcrumbList',
    '@id': abs(`${trail[trail.length - 1].path}#breadcrumb`, site),
    itemListElement: full.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      /**
       * `item` takes a Thing, so it gets a WebPage node rather than a bare URL
       * string. A string there is a literal, not a reference, which is the one
       * thing a breadcrumb must never be.
       *
       * The @id is the page address with no fragment, which is also the @id the
       * FAQPage above uses, so on a page carrying both they are one node.
       */
      item: {
        '@type': 'WebPage',
        '@id': abs(crumb.path, site),
        name: crumb.name,
        url: abs(crumb.path, site),
      },
    })),
  };
}

/**
 * Wraps the nodes for one page in a single @context. Nulls are dropped, so a page
 * can pass a builder that decided it had nothing to say.
 */
export function graph(...nodes: (JsonLdNode | null | undefined)[]): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@graph': nodes.filter((node): node is JsonLdNode => Boolean(node)),
  };
}

/**
 * The whole block for a service page: what we sell, the questions the page
 * answers, and where the page sits. All six pages call this, so all six carry
 * identical markup and only the data differs.
 */
export function serviceGraph(slug: ServiceSlug, faqs: readonly Faq[], site?: URL): JsonLdNode {
  const entry = serviceEntry(slug);
  return graph(
    serviceSchema(slug, site),
    faqPage(faqs, slug, site),
    breadcrumbs(
      [
        { name: 'Services', path: PATHS.services },
        { name: entry.name, path: slug },
      ],
      site
    )
  );
}
