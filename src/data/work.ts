/**
 * Real BPE job photos, the only images allowed to be presented as "our work".
 *
 * PROVENANCE. 51 photos arrived over WhatsApp on 5 Aug 2026, in five batches the
 * client labelled herself: post construction before/after, end of tenancy
 * before/after, and Airbnb. Every file below is one of those, processed by us:
 *   - the burned-in white "Before"/"After" phone-app pill was cropped off
 *   - the tungsten cast was neutralised (most were shot at night)
 *   - dead ceiling and cluttered edges were cropped out
 * No retouching beyond that. We do not paint out dirt: a cleaning result that has
 * been edited clean is a lie, and the whole point of these is that they are real.
 *
 * WHAT WAS REJECTED, so nobody quietly reinstates it later:
 *   - anything with a person or a reflection of a person: several bathroom shots
 *     had the cleaner visible in the mirror
 *   - an Airbnb bedroom where the bed is visibly not made, which contradicts the
 *     exact service the page sells
 *   - frames with belongings, litter or cleaning gear left in shot
 *   - every "before" except one, because they do not pair with any "after"
 *
 * ONLY ONE GENUINE BEFORE/AFTER PAIR EXISTS in all 51 photos: the hallway below.
 * The client's team shot "befores" as close-ups of dirt and "afters" as wide room
 * views, so no other two frames share a camera position. Faking a pair from two
 * different rooms is obvious to visitors and is not an option. The fix goes at
 * the shoot, not here: for a true pair, photograph the SAME framing twice,
 * once before the clean and once after, from the same spot.
 */
import type { GalleryItem } from '../components/Gallery.astro';

import airbnb01 from '../assets/work/airbnb-01.jpg';
import airbnb02 from '../assets/work/airbnb-02.jpg';
import airbnb04 from '../assets/work/airbnb-04.jpg';
import airbnb07 from '../assets/work/airbnb-07.jpg';
import eotCupboard from '../assets/work/eot-after-03.jpg';
import eotSteelSink from '../assets/work/eot-after-04.jpg';
import eotBedroom from '../assets/work/eot-after-11.jpg';
import eotWorktop from '../assets/work/eot-after-14.jpg';
import eotShower from '../assets/work/eot-after-16.jpg';
import eotOven from '../assets/work/eot-after-22.jpg';
import eotKitchen from '../assets/work/eot-after-23.jpg';
import eotLiving from '../assets/work/eot-after-24.jpg';
import eotFridge from '../assets/work/eot-after-26.jpg';
import eotHallway from '../assets/work/eot-after-30.jpg';
import buildersBefore from '../assets/work/builders-hall-before.jpg';
import buildersAfter from '../assets/work/builders-hall-after.jpg';

/**
 * Captions are deliberately plain. These photos are evidence, not advertising,
 * and a phone snapshot under the word "sparkling" reads as a stretch. Describing
 * exactly what was done is what makes them persuasive.
 */

/** End of tenancy: whole rooms. The deposit-back argument. */
export const END_OF_TENANCY_ROOMS: GalleryItem[] = [
  { src: eotLiving, alt: 'Living and dining room cleaned at the end of a tenancy', caption: 'Living and dining room after a full end of tenancy clean.' },
  { src: eotKitchen, alt: 'Kitchen cleaned and cleared at handover', caption: 'Kitchen at handover: worktops cleared, oven and hob cleaned, floor tiles washed.' },
  { src: eotBedroom, alt: 'Bedroom stripped and cleaned ready for handover', caption: 'Bedroom ready for handover, mattress and bed base wiped, floor cleaned.' },
  { src: eotHallway, alt: 'Hallway and fitted wardrobes after cleaning', caption: 'Hallway and fitted wardrobes, floor washed up to the skirting.' },
];

/**
 * The appliance interiors. These are the least attractive photos we have and the
 * most persuasive: inside the oven, inside the fridge and inside the cupboards is
 * exactly what a letting agent opens first at an inspection. Keep them together as
 * one block so they read as a single claim rather than as filler.
 */
export const END_OF_TENANCY_PROOF: GalleryItem[] = [
  { src: eotOven, alt: 'Oven interior and shelves after cleaning', caption: 'Inside the oven: enamel and racks degreased.' },
  { src: eotFridge, alt: 'Fridge interior after cleaning, shelves and drawers empty', caption: 'Inside the fridge: shelves and drawers wiped and emptied.' },
  { src: eotCupboard, alt: 'Inside a kitchen cupboard, cleared and wiped', caption: 'Inside the cupboards: cleared, wiped and left dry.' },
  { src: eotShower, alt: 'Shower enclosure, tiling and chrome after cleaning', caption: 'Shower enclosure: grout, glass and chrome descaled.' },
];

/** Deep cleaning: detail-level evidence, the bits people check with a finger. */
export const DEEP_CLEAN: GalleryItem[] = [
  { src: eotWorktop, alt: 'Kitchen worktop, sink and hob after a deep clean', caption: 'Worktop, sink and hob after a deep clean.' },
  { src: eotOven, alt: 'Oven interior and shelves after cleaning', caption: 'Oven interior, degreased inside and out.' },
  { src: airbnb04, alt: 'Shower enclosure and tray after a deep clean', caption: 'Shower tray, glass and tiling, limescale removed.' },
  { src: eotShower, alt: 'Shower enclosure, tiling and chrome after cleaning', caption: 'Grout and chrome, descaled and dried.' },
];

/** Airbnb: the only photos shot in daylight, so the only ones that look inviting. */
export const AIRBNB: GalleryItem[] = [
  { src: airbnb07, alt: 'Double bedroom made up with fresh towels after a turnover clean', caption: 'Bedroom made up with fresh towels, ready for the next guest.' },
  { src: airbnb01, alt: 'Living area with window seat, cleaned and reset between guests', caption: 'Living area cleaned and reset between guests.' },
  { src: airbnb02, alt: 'Kitchen worktop, hob and sink after a turnover clean', caption: 'Kitchen worktop, hob and sink after a turnover.' },
  { src: airbnb04, alt: 'Shower enclosure, tray and tiling after cleaning', caption: 'Shower enclosure and tray, guest ready.' },
];

/** Office and commercial. One frame only, so it sits beside copy, not in a grid. */
export const COMMERCIAL: GalleryItem[] = [
  { src: eotSteelSink, alt: 'Stainless steel sink and worktop in a workplace kitchen after cleaning', caption: 'Workplace kitchen, stainless steel polished and worktop cleared.' },
];

/**
 * The one true before/after in the whole set. Both frames are cropped with an
 * IDENTICAL box so a slider wipe registers.
 *
 * Two things were deliberately handled here:
 *   1. The uncropped "after" showed the entrance door handle smeared with white
 *      filler and a wad of tissue stuck under the lever. On an after builders page
 *      that single detail would cost bookings, so the crop removes the whole left
 *      third of both frames rather than retouching it out.
 *   2. The camera moved slightly between shots, so the wall heater sits about 5%
 *      higher in the after. At a 50% rest position the wipe seam lands straight on
 *      it and the heater visibly splits, so the slider starts at 35% instead.
 */
export const BUILDERS_PAIR = {
  before: buildersBefore,
  after: buildersAfter,
  beforeAlt: 'Apartment hallway covered in builders dust, tape and offcuts before cleaning',
  afterAlt: 'The same hallway after an after builders clean, floor washed and debris cleared',
  // The pale band across the middle of the after is a floor that is still drying.
  // Saying so is better than hoping nobody notices.
  caption: 'Apartment hallway, after builders clean. Photographed while the floor was still drying.',
  start: 35,
};
