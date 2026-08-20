/**
 * Client testimonials for BPE Cleaning Services.
 *
 * SOURCE: all four were supplied by the client over WhatsApp on 5 August 2026,
 * in answer to the request for reviews. Nothing here is written by us. The only
 * editing applied is trimming long letters down to a pull quote, which never
 * changes the meaning of a sentence.
 *
 * RULES
 * - Never add an invented, sample or placeholder review, in any form.
 * - Never publish a contact detail from a recommendation letter. The letter from
 *   EEM Building Solutions carried a work email and mobile number; both are
 *   deliberately absent from this file.
 * - `quote` is what renders. `sourceNote` is for us, it never renders.
 *
 * TWO THINGS TO CLEAR WITH THE CLIENT BEFORE LAUNCH, see openQuestions below.
 */

export type Testimonial = {
  quote: string;
  /** Person's name as they signed it, or the company if the review is unsigned. */
  author: string;
  /** Role and company, or the area. Renders after the name. */
  area: string;
  /** Which service this evidences. Lets service pages pull the relevant ones. */
  tags: Array<'residential' | 'airbnb' | 'commercial' | 'deep' | 'endOfTenancy'>;
  /** Internal provenance, never rendered. */
  sourceNote: string;
};

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      'We have been working with BPE Cleaning Services for over 2 years, and they have consistently delivered outstanding service. During this time, they have provided cleaning services for more than 80 City Stays properties, including both short-term and long-term rental properties. Their team is reliable, professional, and always maintains a high standard of cleanliness.',
    author: 'City Stays',
    area: 'Short and long term rentals, Dublin',
    tags: ['airbnb', 'commercial'],
    sourceNote:
      'WhatsApp 5 Aug 2026. Unsigned, sent as a company reference. Trimmed from a longer paragraph; the omitted part covers flexibility and communication. The "80+ properties" figure is the single strongest proof point on the site for the Airbnb page.',
  },
  {
    quote:
      'I would highly recommend BPE Cleaning Services. Over the last 5 years she has provided cleaning services for us and I have found her team to be hardworking, always on time, trustworthy and professional.',
    author: 'Gareth Robinson',
    area: 'Construction Manager, Hoffman Construction Company',
    tags: ['commercial'],
    sourceNote:
      'WhatsApp 5 Aug 2026. Signed "Gareth Robinson BSc. PMP, Process Waste Project Construction Manager, Hoffman Construction Company". Job title shortened for the card; full title kept here.',
  },
  {
    quote:
      'BPE Cleaning Services has been responsible for the deep cleaning of multiple apartment units on-site, and their attention to detail is unmatched. Appointments are always kept, deadlines are met, and the quality of work never falters. I confidently recommend them to anyone in need of professional, dependable and detail-oriented cleaning services.',
    author: 'Ivan Spanjic',
    area: 'Director, EEM Building Solutions Ltd',
    tags: ['deep', 'commercial', 'endOfTenancy'],
    sourceNote:
      'WhatsApp 5 Aug 2026, a "To Whom It May Concern" letter of recommendation. TWO EDITS MADE. (1) The letter opens "I am writing to highly recommend E&J Spotless Services" while every other line names BPE Cleaning Services. That opening line is excluded rather than corrected, see openQuestions. (2) The signature block carried a work email and a mobile number; both removed and never to be published, this note included.',
  },
  {
    quote:
      'I am so happy with the place! Delighted and super happy I found you. I will definitely be getting you to come back.',
    author: 'Becky',
    area: 'Residential client',
    tags: ['residential', 'deep'],
    sourceNote:
      'WhatsApp 5 Aug 2026. Original opens "Elena!!!" and reads "super happy I find you", tidied to "I found you" for readability only. No area was given, so the card says "Residential client" rather than inventing a Dublin postcode.',
  },
];

/**
 * Blockers to resolve with the client before these go live. Both are quick
 * WhatsApp questions, but publishing without the answers is a real risk.
 */
export const openQuestions = [
  'The EEM Building Solutions letter names a different company, "E&J Spotless Services", in its first line. Ask the client whether that letter was written for BPE or reused from another business. If it was reused, the whole testimonial has to come off the site.',
  'Three of these name real companies and two name real individuals. They arrived as references, which implies they are meant to be shown, but confirm the client is happy for the names to appear on a public website.',
] as const;

/**
 * Company facts these reviews establish, useful for the About page. All are the
 * clients own words, not our claims:
 *   - Hoffman Construction: working with BPE "over the last 5 years"
 *   - EEM Building Solutions: "over seven years of experience"
 *   - City Stays: "over 2 years", "more than 80 City Stays properties"
 */
