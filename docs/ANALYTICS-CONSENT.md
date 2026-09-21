# Analytics and cookie consent — 14 September 2026

Artiom accepted Google's terms himself on 14 September. Account 407951331, property 554083321, web stream 15775408148, measurement ID G-HN2411LNWT. Enhanced measurement off; Google signals and user-provided data off; granular location/device collection off. User and event retention both 2 months; reset on new activity off.

Local preview: http://127.0.0.1:4380/

## Implementation

- Basic consent mode: Google script loads only with valid opt-in, a real `PUBLIC_GA_MEASUREMENT_ID` and the production hostname. Preview visits never reach Google.
- Equal accept/refuse controls, persistent settings button, 180-day choice lifetime, withdrawal and cross-tab refresh, fail closed if storage is blocked, honour Global Privacy Control.
- Ad consent stays denied; Google signals and ad personalisation disabled in the tag. Page URLs exclude query strings and fragments; referrers contain only origins.
- Embedded Google Maps, YouTube and Vimeo use data-external-src and require a separate informed click on each page.
- Existing first-party server statistics remain separate and are explained in the privacy policy.
- Privacy/cookie copy and the public CSP updated.

## Deployment record

Published 14 September 2026: commit c8aac0b, Vercel success, https://bpecleaning.ie/. The release uses origin/main as its base and excludes local MFA/QR changes. Production browser checks confirm zero Google tag scripts before consent/refusal, correct G-HN2411LNWT script after acceptance, and no map iframe src before an explicit click. Realtime report delivery is being checked separately; script presence alone is not proof of receipt.

The icon at src/assets/cookie-consent.png was created with the built-in image generator, replacing the rejected realistic version. Final prompt: flat graphic cookie icon for an editorial site; bronze #846439 outline, pale cream #E6DCC8 fill, four simple oval dots, clean bite, transparent background; no photographic texture, 3D, shadows, text or sparkles. Astro produces small WebP variants for display.

## Configuration checklist (completed unless noted)

1. Accept Google Terms and GDPR processing terms with explicit authority from Artiom/client. Account BPE Cleaning; property BPE Cleaning — Website; Ireland time; EUR; extra data sharing disabled.
2. Create web stream for https://bpecleaning.ie. Disable enhanced measurement (especially form interactions, outbound links and site search); keep only deliberate page-view collection. Leave Google signals, user-provided data and advertising links off.
3. Set event/user retention to 2 months without reset on activity, and disclose verified retention in privacy policy. Verify processing/transfer settings in the actual account.
4. Set PUBLIC_GA_MEASUREMENT_ID for the production build, then run build and consent tests.
5. The consent release was deployed first. The later MFA, QR, blog and local SEO work was built and checked before being merged into the same production branch on 21 September 2026.
6. Confirm production network: zero Google Analytics requests before choice/refusal; collection only after acceptance; withdrawal clears accessible _ga cookies and prevents future events. Confirm an event in GA4 Realtime. Development unit tests stub the Google loader and do not prove real delivery.

Company registered name, CRO/registered address and VAT/insurance particulars are still unconfirmed. These technical changes are not a certification of overall legal compliance.

Checks: astro check and production build pass; node scripts/test-consent.mjs covers consent branches. Desktop/mobile UI, accept/refuse/reopen flow and missing iframe src verified in browser.

Sources: https://www.dataprotection.ie/en/dpc-guidance/guidance-cookies-and-other-tracking-technologies and https://developers.google.com/tag-platform/security/guides/consent
