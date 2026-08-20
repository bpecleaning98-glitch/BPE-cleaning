/**
 * Signature motion, modelled on elicyon.com's actual implementation
 * (GSAP + ScrollTrigger + Lenis, verified in their production bundle).
 * Their recipe, translated to our vanilla setup:
 *   - Lenis smooth scrolling driven by the GSAP ticker
 *   - the intro lockup draws itself, rises into the header slot, and the
 *     page is uncovered by four night panels sliding apart
 *   - hero content drifts down ~12% on scroll (scrub)
 *   - a pinned manifesto where words illuminate one by one with scroll,
 *     while small images float past at different speeds
 *
 * Everything here is an ENHANCEMENT layer: the CSS reveal system in
 * global.css still runs on its own (Base.astro drives it with no help from
 * this file), and if this module never executes the page stays fully
 * readable, because every dim or hidden starting state is set from JS only.
 *
 * THE BUDGET. GSAP, ScrollTrigger and Lenis together are 138.5 KB, which is
 * more than the rest of the page put together and far more than a five year
 * old Android can afford. So none of them are imported at the top level any
 * more. This file ships as a small entry that:
 *   1. decides whether this device can afford the heavy layer at all
 *      (canAffordHeavyMotion below), and
 *   2. fetches only the libraries the elements on THIS page actually need.
 *
 * Which feature needs which library:
 *   intro overlay, hero text choreography, hero photo settle   gsap
 *   hero content scrub, manifesto morph and photo stream,      gsap
 *     quote brightening, orbit rotation, data-drift              + ScrollTrigger
 *   smooth scrolling and anchor jumps                          lenis
 *   custom cursor, intro skip marker, anchor interception      nothing, static
 *
 * A page with none of those elements (privacy, quote, blog articles, 404)
 * downloads no GSAP and no ScrollTrigger at all.
 */

// Type-only imports. These are erased at build time and pull in no code.
type Gsap = typeof import('gsap')['gsap'];
type ScrollTriggerStatic = typeof import('gsap/ScrollTrigger')['ScrollTrigger'];
type LenisInstance = InstanceType<typeof import('lenis')['default']>;

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
// innerWidth can read 0 in embedded webviews before first layout; clientWidth
// is reliable there. Take the larger of the two.
const viewportWidth = () => Math.max(window.innerWidth, document.documentElement.clientWidth || 0);
const desktop = () => viewportWidth() >= 768;

/** Fields the DOM lib does not type yet, all of them optional by nature. */
type CapabilityNavigator = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
};

/**
 * Is this device allowed to pay for smooth scrolling and scroll-scrubbed
 * animation? Every signal below is a real, published browser API, and each
 * one is only trusted when the browser actually reports it: a missing value
 * is never read as "slow", or Safari, which ships neither deviceMemory nor
 * connection, would lose the motion on a top of the range Mac.
 *
 * Answering no is not a downgrade of the page. It is the whole page, with
 * text visible from the first paint, native scrolling, the CSS reveals from
 * Base.astro, and not one byte of GSAP or Lenis downloaded.
 */
function canAffordHeavyMotion(): boolean {
  const nav = navigator as CapabilityNavigator;

  // 1. The visitor told their operating system that motion makes them
  //    uncomfortable. That is a stated preference, not a guess, so it wins
  //    over everything else.
  if (reduced) return false;

  // 2. Device memory in GB, rounded down to a power of two by the browser,
  //    so the reported values are 0.25, 0.5, 1, 2, 4, 8. Four or less is a
  //    budget or an ageing phone: ScrollTrigger pins and a Lenis rAF loop on
  //    top of that are what turn a scroll into a slideshow.
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) return false;

  // 3. Logical cores. Smooth scrolling costs a full frame of work per frame,
  //    on the same thread that paints. With four cores or fewer there is no
  //    spare core to absorb it.
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4) return false;

  // 4. The visitor is on a metered or slow connection. saveData is an
  //    explicit "send me less" from the browser settings; 2g and slow-2g are
  //    measured round trip classes. 138 KB of animation library is exactly
  //    the payload both of those are asking us not to send.
  const link = nav.connection;
  if (link?.saveData) return false;
  if (link?.effectiveType === '2g' || link?.effectiveType === 'slow-2g') return false;

  return true;
}

const capable = canAffordHeavyMotion();

/* Elements the heavy layer works on. Reading them here, once, is what lets
 * the entry decide which libraries are worth fetching. */
const heroSection = document.querySelector<HTMLElement>('[data-hero]');
const heroClip = document.querySelector<HTMLElement>('.hero-clip');
const heroImg = document.querySelector<HTMLElement>('.hero-clip img');
const heroContent = document.querySelector<HTMLElement>('.hero-content');
const intro = document.getElementById('bpe-intro');
const manifesto = document.querySelector<HTMLElement>('[data-manifesto]');
const quotes = document.querySelectorAll<HTMLElement>('[data-quote-scrub]');
const orbits = document.querySelectorAll<HTMLElement>('[data-orbit]');
const drifts = document.querySelectorAll<HTMLElement>('[data-drift]');
const headerLogo = document.querySelector<HTMLElement>('#site-header a[href="/"]');
const headerGroups = document.querySelectorAll<HTMLElement>(
  '#site-header nav, #site-header .justify-self-end, #site-header #menu-toggle'
);
const introLogo = intro?.querySelector<HTMLElement>('.intro-logo');

/**
 * When to play the intro: on a refresh, a direct visit or an external
 * arrival, YES. When the visitor is already on the site and navigates in
 * (logo click, menu, any internal link) or uses back/forward, NO.
 *
 * Every internal link click stamps a one-shot marker; the very next page
 * load consumes it. No marker = this load was a refresh or a fresh entry.
 */
/* Storage access throws outright in a cross-origin frame with third party
 * storage blocked. Without this guard the module would die here, before the
 * intro's own failsafe is registered, and the black overlay would never be
 * taken off the page. */
const readMarker = () => {
  try {
    const value = sessionStorage.getItem('bpeSkipIntro') === '1';
    sessionStorage.removeItem('bpeSkipIntro');
    return value;
  } catch {
    return false;
  }
};
const cameFromInside = readMarker();
const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
const skipIntro = cameFromInside || navEntry?.type === 'back_forward';

document.addEventListener('click', (e) => {
  const link = (e.target as HTMLElement).closest?.('a[href]');
  if (!(link instanceof HTMLAnchorElement)) return;
  if (link.origin !== location.origin) return;
  // Same-page anchors don't navigate (they are scrolled to), so no marker.
  if (link.pathname === location.pathname && link.hash) return;
  // Neither does a click that opens a new tab. Stamping the marker there
  // would swallow the intro on the NEXT refresh of this tab, which is the
  // one load the gate is meant to play it on.
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || link.target === '_blank') return;
  try {
    sessionStorage.setItem('bpeSkipIntro', '1');
  } catch {
    /* storage blocked: the intro simply plays again, which is harmless */
  }
});

/* The intro overlay is a solid black screen sitting at z-index 100 over the
 * whole page, and CSS only hides it for html:not(.js) and reduced motion.
 * Every other way it can end (a device that cannot afford the animation, an
 * internal navigation, a failed import, a thrown error) has to take it off
 * the page from here, so all of those routes are wired before anything is
 * fetched. */
const willPlayIntro = !!(intro && introLogo && heroClip && headerLogo && capable && !skipIntro);

/** Assigned by the heavy path once the intro has taken the page hostage:
 * restarts scrolling, hands the header back and re-measures. */
let releaseIntro: (() => void) | null = null;
/** Every timeline that starts something invisible, so the failsafe can stop
 * them writing before it makes those elements visible again. */
const introTimelines: Array<{ kill: () => void }> = [];

/** The normal, happy ending: the panels have finished, the overlay goes. */
const finishIntro = () => {
  document.getElementById('bpe-intro')?.remove();
  releaseIntro?.();
};

/**
 * The unhappy ending, and it must work with no libraries loaded at all:
 * kill whatever is still animating, take the overlay off, and clear every
 * inline style the animation may have left an element hidden by. Called by
 * the timer failsafe and by a rejected import.
 */
const HIDDEN_BY_JS =
  '#site-header a[href="/"], #site-header nav, #site-header .justify-self-end, ' +
  '#site-header #menu-toggle, .hw-l1, .hw-meets, .hw-perf, .hw-kicker, .hw-up';
const forceIntroDown = () => {
  for (const tl of introTimelines) {
    try {
      tl.kill();
    } catch {
      /* a killed timeline is not worth an exception */
    }
  }
  introTimelines.length = 0;
  finishIntro();
  // Belt and braces: releaseIntro is only assigned once the intro has taken
  // the page, so a throw a line before that would otherwise leave scrolling
  // held. Starting something that was never stopped does nothing.
  scrollControl.start();
  document.querySelectorAll<HTMLElement>(HIDDEN_BY_JS).forEach((el) => {
    el.style.opacity = '';
    el.style.transform = '';
    el.style.filter = '';
    // The handover wipe clips the header logo down to nothing before it
    // reveals it. A failsafe firing mid-wipe would otherwise leave the mark
    // permanently half cut off.
    el.style.clipPath = '';
  });
};

// Anything that is not going to be animated must not be on screen for a
// single frame. This is synchronous, before any import is even requested.
if (!willPlayIntro) intro?.remove();
// Failsafe, registered before the first fetch, so a network failure, a
// chunk that never answers or a throw inside the animation all land on it:
// nothing stays hidden for longer than 6 seconds. An intro that ended the
// way it was meant to has already taken itself off the page by then, and
// this does nothing.
else {
  setTimeout(() => {
    if (document.getElementById('bpe-intro')) forceIntroDown();
  }, 6000);
}

/* THE SCROLL CONTROL.
 *
 * Two things outside this block ask the page to hold still or to move:
 * Header.astro stops and starts scrolling around the mobile menu through
 * window.__lenis, and the anchor handler below jumps to a section. Both used
 * to talk to a Lenis instance directly, which was fine while Lenis was on
 * every page. It is not on every page any more, so window.__lenis is now a
 * small controller that is ALWAYS there and does the right thing either way:
 * it hands the work to Lenis when Lenis exists, and does it natively when it
 * does not. Header.astro needs no change, and it can never be caught with a
 * lock engaged on one implementation and released on the other.
 *
 * Holding the page still is done the way Lenis itself does it, by refusing
 * the wheel, touch and key events. NOT with overflow:hidden on the root:
 * that removes the vertical scrollbar, the viewport grows by its width, and
 * any ScrollTrigger that measures a pinned section in that window bakes the
 * wider number into the pin-spacer, leaving the whole site 15px too wide.
 */
const SCROLL_KEYS = new Set([' ', 'PageDown', 'PageUp', 'End', 'Home', 'ArrowDown', 'ArrowUp']);
const swallow = (event: Event) => {
  if (!event.cancelable) return;
  // The same escape hatch Lenis honours even while it is stopped: a panel
  // that scrolls itself, marked data-lenis-prevent, keeps its own gestures.
  const el = event.target as HTMLElement | null;
  if (el?.closest?.('[data-lenis-prevent]')) return;
  event.preventDefault();
};
const swallowScrollKeys = (event: KeyboardEvent) => {
  if (!SCROLL_KEYS.has(event.key)) return;
  // Space is a scroll key, a character, AND the way a focused button is
  // pressed. Anyone typing keeps it, and so does anyone operating a control:
  // swallowing it there would silently break the keyboard path through the
  // menu, where Close is a button.
  const el = event.target as HTMLElement | null;
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
  if (event.key === ' ' && el?.closest?.('a[href], button, summary, [role="button"], [tabindex]')) return;
  event.preventDefault();
};
let nativeLocked = false;
const nativeLock = (on: boolean) => {
  if (on === nativeLocked) return;
  nativeLocked = on;
  if (on) {
    addEventListener('wheel', swallow, { passive: false });
    addEventListener('touchmove', swallow, { passive: false });
    addEventListener('keydown', swallowScrollKeys, { passive: false });
  } else {
    removeEventListener('wheel', swallow);
    removeEventListener('touchmove', swallow);
    removeEventListener('keydown', swallowScrollKeys);
  }
};

const scrollControl = {
  /** The real Lenis once it is up, null on every device that skipped it.
   * Kept reachable for debugging: the Browser pane cannot import modules. */
  raw: null as LenisInstance | null,
  stop() {
    // Both, always, in this order: Lenis swallows wheel and touch but not
    // the scroll keys, and the native lock is what covers a page with no
    // Lenis at all. Doing both also means stop and start stay symmetrical
    // if Lenis happens to arrive while a lock is engaged.
    nativeLock(true);
    scrollControl.raw?.stop();
  },
  start() {
    nativeLock(false);
    scrollControl.raw?.start();
  },
  scrollTo(target: HTMLElement, options?: { offset?: number }) {
    const offset = options?.offset ?? 0;
    if (scrollControl.raw) {
      scrollControl.raw.scrollTo(target, { offset });
      return;
    }
    window.scrollTo({
      top: target.getBoundingClientRect().top + window.scrollY + offset,
      // html carries scroll-behavior: smooth, so "auto" would still glide.
      // Someone who asked for reduced motion gets the jump instead.
      behavior: reduced ? 'instant' : 'smooth',
    });
  },
};
(window as any).__lenis = scrollControl;

/* Anchor jumps. Lenis, when it is running, owns the scroll position, so a
 * native hash jump gets snapped straight back to Lenis's own position on the
 * next frame and has to be routed through it. Without Lenis the controller
 * does the same jump natively, keeping the 72px allowance for the fixed
 * header that a raw hash jump knows nothing about. */
document.addEventListener('click', (e) => {
  const link = (e.target as HTMLElement).closest?.('a[href*="#"]');
  if (!(link instanceof HTMLAnchorElement)) return;
  const url = new URL(link.href, location.href);
  if (url.pathname !== location.pathname || !url.hash) return;
  const target = document.querySelector<HTMLElement>(url.hash);
  if (!target) return;
  e.preventDefault();
  history.pushState(null, '', url.hash);
  scrollControl.scrollTo(target, { offset: -72 });
});

/* Custom cursor, taken 1:1 from Elicyon's production bundle: their default
 * pointer is a small GOLD ARROW (their exact SVG path and #907533 fill)
 * inside a fixed, mix-blend-mode: difference container, so it re-colours
 * against anything it crosses. It follows the mouse INSTANTLY, no lerp,
 * exactly as they position theirs. A gold text label rides 16px beside it
 * over elements with data-cursor-label, and elements with
 * data-cursor-arrow="left|right" swap it for their white chevron (55x36 in
 * spirit; we use their 19x32 gallery chevron). Fine pointers only.
 *
 * It stays in the static entry on purpose: it is pure DOM, about a
 * kilobyte, it needs no library, and a device with a mouse is by definition
 * not the phone this whole file is being budgeted for. */
if (matchMedia('(pointer: fine)').matches) {
  const cursor = document.createElement('div');
  cursor.className = 'bpe-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  cursor.innerHTML =
    // Their default arrow, verbatim path and fill.
    '<svg class="c-arrow" width="14" height="16" viewBox="0 0 14 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M7.04922 10.0199L2.88766 15.3407L0.408266 -0.000225568L13.5709 8.26022L7.04922 10.0199Z" fill="#907533"/></svg>' +
    // Their gallery chevron, verbatim, flipped via CSS for "left".
    '<svg class="c-chevron" width="19" height="32" viewBox="0 0 19 32" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M1 31L16 16L1 1" stroke="white" stroke-width="2"/></svg>' +
    '<span class="c-label"></span>';
  document.body.appendChild(cursor);
  document.documentElement.classList.add('has-cursor');
  const label = cursor.querySelector<HTMLElement>('.c-label')!;

  window.addEventListener('mousemove', (e) => {
    cursor.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
    cursor.classList.add('is-on');
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => cursor.classList.remove('is-on'));
  document.documentElement.addEventListener('mouseenter', () => cursor.classList.add('is-on'));

  document.addEventListener('mouseover', (e) => {
    const target = e.target as HTMLElement;
    const labelled = target.closest?.('[data-cursor-label]') as HTMLElement | null;
    const arrowed = target.closest?.('[data-cursor-arrow]') as HTMLElement | null;
    label.textContent = labelled ? labelled.dataset.cursorLabel || '' : '';
    cursor.classList.toggle('is-label', !!labelled);
    cursor.classList.toggle('is-chevron', !!arrowed);
    cursor.classList.toggle('is-chevron-left', arrowed?.dataset.cursorArrow === 'left');
  });
}

/* ------------------------------------------------------------------ *
 * From here down, nothing runs unless the device can afford it AND the
 * page holds elements that need it.
 * ------------------------------------------------------------------ */

// Anything scroll-scrubbed or pinned. ScrollTrigger is only worth its 40 KB
// when one of these is on the page.
const wantsScrollTrigger = !!(
  (heroSection && heroContent) ||
  manifesto ||
  quotes.length ||
  orbits.length ||
  drifts.length
);
// GSAP itself is also needed by the two timed pieces that never touch
// scroll: the intro and the hero copy arriving.
const wantsGsap = wantsScrollTrigger || !!heroSection || willPlayIntro;
// Smooth scrolling is a property of the site, not of a section, so Lenis is
// the one library that is wanted on every page. It is also the first thing
// the gate above drops, because it is the one that takes over the scroll
// thread and makes an old phone feel broken.
const wantsLenis = true;

async function boot() {
  const [lenisMod, gsapMod, scrollTriggerMod] = await Promise.all([
    wantsLenis ? import('lenis') : null,
    wantsGsap ? import('gsap') : null,
    wantsScrollTrigger ? import('gsap/ScrollTrigger') : null,
  ]);

  const gsap: Gsap | null = gsapMod ? gsapMod.gsap : null;
  const ScrollTrigger: ScrollTriggerStatic | null = scrollTriggerMod ? scrollTriggerMod.ScrollTrigger : null;
  if (gsap && ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  let lenis: LenisInstance | null = null;
  if (lenisMod) {
    lenis = new lenisMod.default({ lerp: 0.11 });
    if (ScrollTrigger) lenis.on('scroll', ScrollTrigger.update);
    if (gsap) {
      // One ticker for both, so scroll position and tweens are read from the
      // same frame. gsap hands out seconds, Lenis wants milliseconds.
      gsap.ticker.add((time: number) => lenis!.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      // A page with smooth scrolling and nothing to animate: Lenis drives
      // itself off a plain rAF, which already speaks milliseconds.
      const frame = (time: number) => {
        lenis!.raf(time);
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }
    // From here the controller hands everything to the real instance. If a
    // lock was engaged natively while this was still downloading, stop and
    // start both act on both sides, so it cannot be left half released.
    scrollControl.raw = lenis;
    // If the menu was opened while this chunk was still in flight, the lock
    // is currently held natively. Lenis never consults defaultPrevented, so
    // it would happily scroll under the open overlay unless it is told.
    if (nativeLocked) lenis.stop();
  }
  // Debug handles: the Browser pane cannot import modules, so stepping an
  // animation frame by frame needs a window reference.
  (window as any).__gsap = gsap;
  (window as any).__ScrollTrigger = ScrollTrigger;

  if (!gsap) return;

  /* Intro + hero opening: dark screen with the lockup dead centre, the
   * lockup draws itself and flies up into the header, the four night panels
   * slide apart to uncover the page, and the nav staggers in. */

  // No letterbox, no extra shapes: the hero is simply THERE under the mask,
  // with only a soft scale settle on the photograph.
  const openHero = (delay = 0.15) => {
    if (heroImg) {
      gsap.fromTo(heroImg, { scale: 1.16 }, { scale: 1, duration: 2.2, ease: 'power3.out', delay });
    }
  };

  /** The hero copy choreography: "Where clean" from the
   * left, "meets" through a blur, "perfection" from the right, the rest a
   * simple slide-up. Only the intro calls it: an internal navigation gets
   * the finished hero, with nothing moving at all. */
  const heroTextIn = (delay: number) => {
    if (!heroSection) return;
    const q = (sel: string) => heroSection.querySelector<HTMLElement>(sel);
    const ups = heroSection.querySelectorAll<HTMLElement>('.hw-up');
    const d = 0.95;
    const tl = gsap
      .timeline({ delay })
      .fromTo(q('.hw-l1'), { x: -70, opacity: 0 }, { x: 0, opacity: 1, duration: d, ease: 'power3.out' }, 0)
      .fromTo(q('.hw-perf'), { x: 70, opacity: 0 }, { x: 0, opacity: 1, duration: d, ease: 'power3.out' }, 0.12)
      .fromTo(
        q('.hw-meets'),
        { opacity: 0, filter: 'blur(10px)' },
        { opacity: 1, filter: 'blur(0px)', duration: d, ease: 'power2.out' },
        0.22
      )
      .fromTo(q('.hw-kicker'), { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: d * 0.7, ease: 'power2.out' }, 0.3)
      .fromTo(
        ups,
        { y: 26, opacity: 0 },
        { y: 0, opacity: 1, duration: d * 0.75, ease: 'power2.out', stagger: 0.1 },
        0.38
      );
    // The failsafe has to be able to stop this one too: it starts the copy
    // at opacity 0, so a timeline left running would keep re-hiding text
    // that the failsafe has just made visible.
    introTimelines.push(tl);
  };

  // isConnected, not just a truthy node: the 6 second failsafe detaches the
  // overlay when a chunk is slow, and without this check a dynamic import
  // that lands afterwards would replay the entire intro against a node that
  // is no longer in the document, hiding the header and the hero copy behind
  // an overlay nobody can see.
  if (willPlayIntro && intro?.isConnected && introLogo && headerLogo) {
    const headerEl = document.getElementById('site-header');
    const panel = (side: string) => intro.querySelector<HTMLElement>(`[data-panel="${side}"]`);

    /* Three rules make the handover invisible, each one earned the hard way:
     *
     * 1. The header rides ABOVE the overlay for the whole intro (z 120 over
     *    the overlay's 100). In the old version it sat underneath, so the
     *    real logo could only appear when a panel edge happened to sweep
     *    past it, right next to the still-visible twin: two logos, then one
     *    abruptly gone.
     * 2. The swap fires while the top panel still covers the header, over
     *    solid night, never over the photo.
     * 3. The twin is repainted in the colour the REAL logo shows there: the
     *    header renders under mix-blend-difference, so its gold-soft
     *    #E6DCC8 over night #14110D comes out |E6DCC8 - 14110D| = #D2CBBB.
     *    Same box, same pixels, a true zero-frame flip.
     */
    if (headerEl) {
      headerEl.style.zIndex = '120';
      // It sits above the overlay at opacity 0, and an invisible element is
      // still hit-testable: without this the top bar is a strip of live
      // controls over the black screen for the whole intro.
      headerEl.style.pointerEvents = 'none';
    }
    introLogo.style.color = '#D2CBBB';
    gsap.set(headerGroups, { opacity: 0, x: -14 });
    gsap.set(headerLogo, { opacity: 0 });

    /* The page must not scroll under the intro: a scroll would hide the
     * header (its scroll-direction logic) and move the landing target
     * mid-flight. The controller stops Lenis and holds the wheel, touch and
     * scroll keys, which the scrollbar still on screen would otherwise
     * answer.
     *
     * It must NOT be done with overflow:hidden on the root, for the reason
     * spelled out where the controller is defined. */
    scrollControl.stop();

    releaseIntro = () => {
      releaseIntro = null;
      scrollControl.start();
      if (headerEl) {
        headerEl.style.zIndex = '';
        headerEl.style.pointerEvents = '';
      }
      // Anything measured while the intro held the page still gets a second
      // look, now that the layout is final.
      ScrollTrigger?.refresh();
    };

    /* How large the lockup stands while it draws itself. Measured, not a
     * constant: the pen needs room to be legible, but a size that looks
     * right on a laptop runs off the edge of a phone. Aim for a bit under
     * half the viewport width, and never smaller than the header size it
     * will land at. This has to be settled BEFORE the pen is set up,
     * because the pen's width is derived from it. */
    const naturalWidth = introLogo.getBoundingClientRect().width;
    const introScale = Math.max(
      1.6,
      Math.min(Math.min(viewportWidth() * 0.44, 460) / Math.max(naturalWidth, 1), 4.2),
    );
    gsap.set(introLogo, { scale: introScale });

    /* The lockup draws itself, the way a trim path does in After Effects:
     * every shape in the artwork is a closed outline, so each one is stroked
     * with a dash the length of its own perimeter and that dash is walked
     * from fully offset to zero. The outline appears to be traced by a pen.
     * Once a shape has closed its loop, its fill rises inside it and the
     * stroke steps back, so the logo assembles rather than fades.
     *
     * Everything below stays in the artwork's own user units, and there is
     * deliberately NO vector-effect: non-scaling-stroke here. That property
     * moves stroke-dasharray into screen pixels while getTotalLength keeps
     * returning user units, and the horizontal lockup is 1484 units wide
     * inside a 100-odd pixel box. The dash would come out about fourteen
     * times longer than the path it is meant to hide, every shape would be
     * fully uncovered in the first tenth of its tween, and the pen would
     * pop rather than draw. The stroke width is converted the other way
     * instead: a hairline in pixels, expressed in units.
     */
    const svgEl = introLogo.querySelector<SVGSVGElement>('svg');
    const viewBoxWidth = Number(svgEl?.getAttribute('viewBox')?.split(/\s+/)[2]) || 1;
    const unitsPerPixel = viewBoxWidth / Math.max(naturalWidth * introScale, 1);

    // Only the painted shapes. A looser attribute match would also catch the
    // root svg, whose class starts with bpe-logo, and that has no length.
    // Sorted left to right by where each shape actually sits, because
    // document order is not reading order: the symbol's lower sweep is
    // written after the E, so an unsorted pen jumps back across the lockup.
    const shapes = [
      ...intro.querySelectorAll<SVGGeometryElement>('.intro-logo .bpe-ink, .intro-logo .bpe-gold'),
    ].sort((a, b) => {
      try {
        return a.getBBox().x - b.getBBox().x;
      } catch {
        return 0;
      }
    });

    const lengths = shapes.map((shape) => {
      // getTotalLength on a closed polygon or rect returns its perimeter,
      // which is exactly the dash we want.
      let len = 0;
      try {
        len = shape.getTotalLength();
      } catch {
        len = 0;
      }
      shape.style.stroke = shape.classList.contains('bpe-gold')
        ? 'var(--bpe-gold, #C59A4A)'
        : 'var(--bpe-ink, #222223)';
      shape.style.strokeWidth = `${1.1 * unitsPerPixel}`;
      shape.style.fillOpacity = '0';
      shape.style.strokeDasharray = `${len}`;
      shape.style.strokeDashoffset = `${len}`;
      return len;
    });

    // Small shapes need less time than the big diamond, or the counters of
    // the letters snap in while the frame is still crawling. Time is shared
    // out by the square root of the perimeter, which keeps the pen at a
    // roughly even speed without letting the longest path dominate.
    const maxLen = Math.max(1, ...lengths);
    const drawTime = (len: number) => 0.3 + 0.45 * Math.sqrt(len / maxLen);

    const DRAW_SPAN = 0.9; // how long the whole stagger takes to fan out
    const step = shapes.length > 1 ? DRAW_SPAN / (shapes.length - 1) : 0;

    const tl = gsap
      .timeline({ delay: 0.3 })
      // 1. the lockup breathes in, then draws itself shape by shape
      .fromTo(introLogo, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'power2.out' }, 0);
    introTimelines.push(tl);

    shapes.forEach((shape, i) => {
      const at = 0.12 + i * step;
      const d = drawTime(lengths[i]);
      tl.to(shape, { strokeDashoffset: 0, duration: d, ease: 'power1.inOut' }, at)
        // The fill arrives just before the pen closes the loop, so the shape
        // is never seen as an empty outline standing on its own.
        .to(shape, { fillOpacity: 1, duration: 0.34, ease: 'power2.out' }, at + d * 0.72)
        .to(shape, { strokeOpacity: 0, duration: 0.28, ease: 'power1.out' }, at + d * 0.86);
    });

    /* Centre-to-centre delta into the header slot, measured at take-off,
     * not at build time, so the landing is exact whatever the viewport did
     * in between. Memoised: the three function-based values below must not
     * disagree with each other, and a scrub must not re-measure. */
    let landCache: { x: number; y: number } | null = null;
    const land = () => {
      if (!landCache) {
        const from = introLogo.getBoundingClientRect();
        const to = headerLogo.getBoundingClientRect();
        landCache = {
          x: to.left + to.width / 2 - (from.left + from.width / 2),
          y: to.top + to.height / 2 - (from.top + from.height / 2),
        };
      }
      return landCache;
    };

    /* THE OPENING, one gesture.
     *
     * The rise and the window share a start, a duration AND an ease. Two of
     * those were already true; the third is what still read as two motions.
     * Different durations read as two animations however well they overlap,
     * so there is now a single number and a single curve for both.
     *
     * What that costs, and how it is paid: the handover from the flying twin
     * to the real header logo used to hide under the top panel, because the
     * header renders through mix-blend-difference and its gold-soft only
     * comes out the twin's flat #D2CBBB while the backdrop is night. Hiding
     * it there forced the lockup to land BEFORE the window finished, which
     * is exactly the queued feeling. So the handover moved to the last frame
     * of both, and the twin is repainted to whatever the real logo actually
     * shows in the header slot, measured live at that moment.
     *
     * Geometry worth writing down, because it rules out the obvious fixes:
     * the twin starts dead centre and the window opens from dead centre, so
     * from the first frame of the reveal part of the lockup is over the
     * photograph. Flying the REAL logo instead was built and thrown away for
     * that reason: it blends live, so the reveal edge cuts it into two
     * colours mid-flight and it reads as a rendering fault. A flat twin has
     * no seam. There is also no moment after the reveal starts where the
     * lockup sits wholly over night again, so no later hiding place exists.
     */
    const OPEN = 1.15;
    const EASE = 'power3.inOut';
    const WIPE = 0.42;

    tl
      .add('travel', '+=0.15')
      .to(
        introLogo,
        { x: () => land().x, y: () => land().y, scale: 1, duration: OPEN, ease: EASE },
        'travel'
      )
      // The window: four panels sliding apart, transforms only, so it never
      // touches layout and cannot stutter.
      .to(panel('t'), { yPercent: -101, duration: OPEN, ease: EASE }, 'travel')
      .to(panel('b'), { yPercent: 101, duration: OPEN, ease: EASE }, 'travel')
      .to(panel('l'), { xPercent: -101, duration: OPEN, ease: EASE }, 'travel')
      .to(panel('r'), { xPercent: 101, duration: OPEN, ease: EASE }, 'travel')
      .add(() => openHero(0), 'travel')
      // The copy arrives while the window is still opening, so the landing
      // is a settle, not a start.
      .add(() => heroTextIn(OPEN * 0.6), 'travel')
      // THE HANDOVER, on the one frame where the rise and the window both
      // stop, and no longer hidden by anything: it is WIPED.
      //
      // A hard cut here would show, because at rest the two do not render
      // the same colour: the twin is flat, the real logo is the difference
      // of gold-soft against the photograph behind the header. Nor does a
      // crossfade work, and the reason is compositing rather than taste. At
      // fifty percent each, the blended layer contributes a*|C-B| + (1-a)*B
      // and the flat one lands on top of that, so the mark dips about an
      // eighth darker halfway through and reads as a flicker.
      //
      // A wipe has no such term. The two lockups sit on identical pixels, so
      // clipping them complementarily means every column of the mark is
      // drawn by exactly one of them at full opacity. Whatever the colour
      // difference is, it resolves as a single edge travelling across the
      // mark, which is the same wipe the lockup was drawn with on the way
      // in. If the colours happen to agree, nothing is visible at all.
      //
      // Two clip tweens rather than one callback writing both: gsap
      // suppresses onUpdate when a timeline is seeked or scrubbed, so a
      // callback-driven wipe renders correctly while playing and not at all
      // under inspection. Sharing a duration and an ease keeps the two edges
      // in lockstep by construction.
      .set(headerLogo, { opacity: 1 }, `travel+=${OPEN}`)
      .fromTo(
        headerLogo,
        { clipPath: 'inset(0% 100% 0% 0%)' },
        { clipPath: 'inset(0% 0% 0% 0%)', duration: WIPE, ease: 'power2.inOut', immediateRender: false },
        `travel+=${OPEN}`
      )
      .fromTo(
        introLogo,
        { clipPath: 'inset(0% 0% 0% 0%)' },
        { clipPath: 'inset(0% 0% 0% 100%)', duration: WIPE, ease: 'power2.inOut', immediateRender: false },
        `travel+=${OPEN}`
      )
      .set(introLogo, { opacity: 0 }, `travel+=${OPEN + WIPE}`)
      .set(headerLogo, { clearProps: 'clipPath' }, `travel+=${OPEN + WIPE}`)
      .to(headerGroups, { opacity: 1, x: 0, duration: 0.6, ease: 'power2.out', stagger: 0.07 }, `travel+=${OPEN}`)
      .add(finishIntro);
    (window as any).__introTl = tl;
  }
  /* ARTIOM'S RULE: the opening is for people ARRIVING. Someone already on the
   * site who clicks the logo, or a menu link, lands on a hero that is simply
   * finished: no photo settle, no copy sliding in, no brisk replay of the
   * choreography. Nothing runs here on purpose. The hero copy and the photo
   * have no hidden starting state in the markup, they are only ever put into
   * one by the timelines above, so leaving them alone IS the static state. */

  if (ScrollTrigger && heroSection && heroContent) {
    gsap
      .timeline({
        scrollTrigger: { trigger: heroSection, start: 'top top', end: 'bottom top', scrub: true },
      })
      .to(heroContent, { yPercent: 12, ease: 'none' }, 0)
      .to(heroImg, { scale: 1.1, ease: 'none' }, 0);
  }

  /* Manifesto: the phrase morph. Phrase A stands fully visible. As the
   * pinned section scrubs: A's unique words dissolve, the SHARED words
   * (data-key pairs) travel to their phrase-B positions, and B's unique
   * words arrive. Positions are re-measured on every refresh with transforms
   * cleared. Phrase B and the frames carry opacity-0 in the markup, so on a
   * device that never gets here the section reads as phrase A alone, which
   * is a complete sentence on its own. */
  if (ScrollTrigger && manifesto) {
    const phraseB = manifesto.querySelector<HTMLElement>('.m-phrase-b');
    const aWords = manifesto.querySelectorAll<HTMLElement>('.m-phrase-a .m-word, .m-phrase-a .m-shared');
    const bWords = manifesto.querySelectorAll<HTMLElement>('.m-phrase-b .m-word, .m-phrase-b .m-shared');
    const frames = [...manifesto.querySelectorAll<HTMLElement>('.m-frame')];

    if (phraseB && aWords.length) {
      // Clean two-act crossfade, no overlapping glyphs: phrase A lifts out
      // word by word, then phrase B slides up into the cleared space.
      gsap.set(phraseB, { opacity: 1 });
      gsap.set(bWords, { opacity: 0, y: 36 });

      const tl = gsap
        .timeline({
          scrollTrigger: {
            trigger: manifesto,
            start: desktop() ? 'top top' : 'top 70%',
            end: () => `+=${manifesto.clientHeight * (desktop() ? 1.9 : 0.8)}`,
            scrub: desktop() ? true : 0.5,
            pin: desktop(),
            invalidateOnRefresh: true,
          },
        })
        .to(aWords, { opacity: 0, y: -30, ease: 'power1.in', duration: 0.34, stagger: 0.028 }, 0)
        .to(bWords, { opacity: 1, y: 0, ease: 'power2.out', duration: 0.34, stagger: 0.032 }, 0.52);

      // The photo STREAM on the same scrub, Elicyon's statement mechanic:
      // the pinned text morphs in place while the frames travel UPWARD in
      // the scroll direction. The brief for the feel was "chaotic, but
      // beautiful": one frame quick and constant, one slower, one
      // that arrives, STANDS, then takes off. A single linear tween per
      // frame cannot say that, so each lane is a small script: segments of
      // (where to, how much of the scrub, with what curve). The curves do
      // the acting. power2.out = arrives briskly and settles; a near-flat
      // 'none' segment = standing (a few px of creep, so it still feels
      // alive); power2.in = hangs, then accelerates away. Durations per lane
      // sum to 1, so every frame's script spans the same pin.
      //
      // Values are in viewport heights, as functions, so a resize
      // re-measures on refresh. Lanes stay in their own horizontal
      // corridors, which is what lets their vertical passes never collide.
      if (frames.length) {
        type Leg = { to: number; d: number; ease: string };
        const lanes: Record<string, { from: number; legs: Leg[] }> = {
          // the sprinter: constant and quick, the pace-setter the eye
          // measures the others against
          fast: { from: 0.85, legs: [{ to: -1.5, d: 1, ease: 'none' }] },
          // bursts in and then crawls: one long decelerating breath across
          // the whole pin, never parking. Parking it was tried first, and it
          // stopped exactly on top of the stats row.
          mid: { from: 1.1, legs: [{ to: -1.35, d: 1, ease: 'power2.out' }] },
          // the heavy one: barely moves at first, gathers speed late and
          // never quite makes it out
          slow: { from: 1.55, legs: [{ to: -0.7, d: 1, ease: 'power1.in' }] },
          // the lower-left frame, the one that STANDS: waits below the
          // fold, comes in, parks in the corner (a few px of creep so it
          // still breathes), then darts off. Parked at 0.31vh: low enough to
          // own the lower-left corner, below the stats row's bottom edge
          // (parking higher sliced the 80+ label in half), still mostly
          // above the fold. The opening wait is load-bearing, not styling:
          // this frame lives on the page's left edge, INSIDE the kitchen's
          // horizontal corridor, and the kitchen's own burst has cleared
          // that corridor by 0.27 of the pin. Arriving no earlier than 0.24
          // is what keeps the two frames from ever stacking.
          linger: {
            from: 1.3,
            legs: [
              { to: 1.28, d: 0.24, ease: 'none' },
              { to: 0.31, d: 0.3, ease: 'power2.out' },
              { to: 0.26, d: 0.24, ease: 'none' },
              { to: -1.15, d: 0.22, ease: 'power2.in' },
            ],
          },
        };
        gsap.set(frames, { opacity: 1 });
        frames.forEach((el) => {
          const lane = lanes[el.dataset.lane || 'mid'] || lanes.mid;
          let at = 0;
          lane.legs.forEach((leg, i) => {
            if (i === 0) {
              tl.fromTo(
                el,
                { y: () => window.innerHeight * lane.from },
                { y: () => window.innerHeight * leg.to, ease: leg.ease, duration: leg.d },
                0
              );
            } else {
              tl.to(
                el,
                { y: () => window.innerHeight * leg.to, ease: leg.ease, duration: leg.d },
                at
              );
            }
            at += leg.d;
          });
        });
      }
    }
  }

  /* Lead quote: the words brighten one after another as the section passes
   * through the viewport. No pin, just a scrub window. */
  if (ScrollTrigger) {
    quotes.forEach((quote) => {
      const words = quote.querySelectorAll<HTMLElement>('.q-word');
      if (!words.length) return;
      gsap.set(words, { opacity: 0.14 });
      gsap.to(words, {
        opacity: 1,
        ease: 'none',
        stagger: 0.05,
        scrollTrigger: { trigger: quote, start: 'top 82%', end: 'top 28%', scrub: true },
      });
    });

    /* Coverage chart orbits: a slow rotation tied to scroll. */
    orbits.forEach((orbit) => {
      gsap.to(orbit, {
        rotation: 40,
        ease: 'none',
        scrollTrigger: { trigger: orbit, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });

    /* Generic slow image drift for sections that opt in with data-drift. */
    drifts.forEach((el) => {
      gsap.fromTo(
        el,
        { yPercent: -6 },
        {
          yPercent: 6,
          ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true },
        }
      );
    });

    /* Positions are measured as the triggers are built, before images and
     * fonts settle. Re-measure once everything has loaded, and once more
     * shortly after for late layout shifts (webfont swap, decoded images).
     * The libraries are fetched asynchronously now, so this module can wake
     * up after load has already fired: check, do not only listen. */
    const remeasure = () => {
      ScrollTrigger.refresh();
      setTimeout(() => ScrollTrigger.refresh(), 600);
    };
    if (document.readyState === 'complete') remeasure();
    else addEventListener('load', remeasure, { once: true });
  }
}

/** requestIdleCallback where it exists, a short timer where it does not.
 * The timeout is deliberately short: a scrubbed trigger that is built while
 * the visitor is already looking at its section sets its starting state
 * first and its scrolled state one frame later, so the wait has to be a
 * gap in the work, not a real delay. */
const whenIdle = (fn: () => void) => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 900 });
  else setTimeout(fn, 300);
};

if (capable && (wantsGsap || wantsLenis)) {
  // A rejected import must never leave the page under a black overlay, and
  // must never leave copy that a timeline had set to opacity 0.
  const run = () => boot().catch(forceIntroDown);
  // The intro and the hero copy are the opening frame of the page, so they
  // are fetched at once. On every other page the scroll work can wait for a
  // gap in the main thread: scrubbed triggers read the current scroll
  // position when they are built, so arriving late costs nothing visible.
  if (willPlayIntro || heroSection) run();
  else whenIdle(run);
}
