/**
 * Renders the "new request" notification to a file so it can be opened in a
 * browser, and prints the subject line so the wording that lands on a locked
 * phone can be read before anybody relies on it.
 *
 *   npm run email:preview
 *   npm run email:preview -- sparse
 *
 * It goes through esbuild rather than straight through node, because the
 * source imports are extensionless the way Vite wants them and node's ESM
 * resolver refuses those. esbuild is already here as a dependency of Vite, so
 * this costs nothing. Nothing in this file ships: it is a developer tool.
 */
import { writeFileSync } from 'node:fs';
import { renderLeadEmail, type LeadMail } from '../src/lib/email';

const FULL: LeadMail = {
  name: 'Aoife Ní Bhraonáin',
  phone: '087 412 9930',
  service: 'End of Tenancy Cleaning',
  size: '3 bedrooms',
  date: 'Friday 5 September',
  area: 'Rathmines, Dublin 6',
  notes:
    'Two bathrooms, one with heavy limescale. Landlord inspection is on the Monday, so it has to be finished by Friday evening. Oven included please.',
  source: 'Facebook',
  campaign: 'flyer-oct',
  linkCode: 'flyer-oct',
  landing: '/end-of-tenancy-cleaning-dublin/',
};

// The other half of the job: most people fill in almost nothing. Every empty
// field has to disappear rather than leave a labelled blank.
const SPARSE: LeadMail = {
  name: 'John',
  phone: '0899605606',
  service: null,
  size: null,
  date: null,
  area: null,
  notes: null,
  source: null,
  campaign: null,
  linkCode: null,
  landing: null,
};

const which = process.argv[2] === 'sparse' ? SPARSE : FULL;
const out = process.argv[3] || `/tmp/bpe-email-${process.argv[2] === 'sparse' ? 'sparse' : 'full'}.html`;
const mail = renderLeadEmail(which);

writeFileSync(out, mail.html, 'utf8');
console.log('Subject:', mail.subject);
console.log('Written:', out);
console.log('---- plain text ----');
console.log(mail.text);
