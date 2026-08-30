/**
 * Everything about the site that is a name, an address or a licence.
 *
 * Kept in one file because these are the strings most likely to be corrected by someone
 * who is not reading the code, and because a template that hard-codes a URL is a template
 * that will one day publish the wrong one.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

export interface SiteConfig {
  /** The public name of the site. The club's own name (PRD §7.4). */
  readonly name: string;
  /** Origin, no trailing slash. Canonical URLs are built from it (R-5.4). */
  readonly origin: string;
  /** The organisation that publishes the data, for the `Organization` node (R-6.4). */
  readonly publisher: string;
  readonly publisherUrl: string;
  /** Where a visitor reports a mistake (R-2.7, R-9.1). */
  readonly correctionFormUrl: string;
  /** An alternative to the form, for anyone who would rather write than fill in fields. */
  readonly correctionEmail: string;
  readonly privacyPolicyUrl: string;
  /** Licence of the published data — not of the photographs, not of the code (§7.6). */
  readonly dataLicence: string;
  readonly dataLicenceUrl: string;
  /** The breed the catalogue covers, for the first line of body text (R-6.8). */
  readonly breed: string;
  /**
   * Which families of hub page exist yet.
   *
   * A dog page wants to link outward in four directions (R-2.6) and a breadcrumb wants a
   * kennel above the dog (R-2.1), but a link to a page that is not built yet is a 404 —
   * and 62,467 pages each carrying four of them is a lot of 404s to hand a crawler. So
   * each family is a flag: off, and the fact still shows, as text rather than a link.
   * Turn one on in the same change that builds it.
   */
  readonly hubs: {
    readonly kennel: boolean;
    readonly year: boolean;
    readonly country: boolean;
    readonly dna: boolean;
  };
}

export const SITE: SiteConfig = {
  name: 'Japanese Spitz Foundation pedigree database',
  origin: 'https://pedigree.japanesespitz.org',
  publisher: 'Japanese Spitz Foundation',
  publisherUrl: 'https://japanesespitz.org',
  // The Foundation's own add-or-correct-a-dog form. Owner-supplied 2026-08-29; replaced
  // the same day with the form that actually collects dog records rather than general
  // enquiries.
  correctionFormUrl: 'https://forms.gle/NexYrTUd41AThNzo9',
  correctionEmail: 'pedigree@japanesespitz.org',
  privacyPolicyUrl: 'https://japanesespitz.org/privacy-policy/',
  dataLicence: 'CC BY-NC-SA 4.0',
  dataLicenceUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  breed: 'Japanese Spitz',
  // None built yet (2026-08-28). Each flips to true with the change that builds it.
  hubs: { kennel: false, year: false, country: false, dna: false },
};

/** The canonical URL of a dog page. */
export function dogUrl(site: SiteConfig, slug: string): string {
  return `${site.origin}/dog/${slug}`;
}

/** The JSON representation of a dog (R-6.6). */
export function dogJsonUrl(site: SiteConfig, slug: string): string {
  return `${site.origin}/api/dog/${slug}.json`;
}
