import { describe, expect, it } from 'vitest';
import { SECURITY_HEADERS, headersFile } from '../../src/render/headers.ts';

describe('security headers', () => {
  it('writes every header into the _headers file', () => {
    // The drift guard. `_headers` covers the static tier and the Functions set the same
    // headers in code; if the two ever disagree, 59,005 of 62,466 pages are the ones that
    // lose out, and a scanner testing the home page would not notice.
    const file = headersFile();
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(file).toContain(`  ${name}: ${value}`);
    }
  });

  it('applies to every path', () => {
    expect(headersFile()).toContain('\n/*\n');
  });

  it('keeps the two directives the site actually depends on', () => {
    const csp = SECURITY_HEADERS['content-security-policy'];
    // The bracket's geometry is inline style attributes, computed server-side so the
    // chart works with scripting off. Dropping this breaks every pedigree chart.
    expect(csp).toContain("style-src-attr 'unsafe-inline'");
    // The only <script> on any page is the JSON-LD data block, which script-src does not
    // govern — which is why a site this strict is possible at all.
    expect(csp).toContain("script-src 'none'");
  });

  it('does not let HSTS reach the club’s apex domain', () => {
    const hsts = SECURITY_HEADERS['strict-transport-security'];
    expect(hsts).not.toContain('includeSubDomains');
    expect(hsts).not.toContain('preload');
  });
});
