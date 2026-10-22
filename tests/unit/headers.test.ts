import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MATING_HEADERS, SECURITY_HEADERS, headersFile } from '../../src/render/headers.ts';

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

describe('the /mating policy (task 7.3)', () => {
  const directives = (csp: string) => csp.split(';').map((d) => d.trim());

  it('allows same-origin scripts, and keeps default-src closed with no connect-src', () => {
    const csp = MATING_HEADERS['content-security-policy'];
    expect(directives(csp)).toContain("script-src 'self'");
    expect(directives(csp)).toContain("default-src 'none'");
    expect(csp).not.toContain('connect-src');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it('differs from the site policy in script-src alone', () => {
    const site = directives(SECURITY_HEADERS['content-security-policy']);
    const mating = directives(MATING_HEADERS['content-security-policy']);
    expect(mating.filter((d) => !site.includes(d))).toEqual(["script-src 'self'"]);
    expect(site.filter((d) => !mating.includes(d))).toEqual(["script-src 'none'"]);
    const { 'content-security-policy': _a, ...restSite } = SECURITY_HEADERS;
    const { 'content-security-policy': _b, ...restMating } = MATING_HEADERS;
    expect(restMating).toEqual(restSite);
  });

  it('leaves every other route and the generated _headers at script-src none', () => {
    expect(SECURITY_HEADERS['content-security-policy']).toContain("script-src 'none'");
    expect(headersFile()).toContain("script-src 'none'");
    expect(headersFile()).not.toContain("script-src 'self'");
  });

  it('is used by functions/mating.ts alone; every other Function sends SECURITY_HEADERS', () => {
    const root = new URL('../../functions/', import.meta.url).pathname;
    const files = (readdirSync(root, { recursive: true }) as string[]).filter((f) => f.endsWith('.ts'));
    expect(files).toContain('mating.ts');
    for (const f of files) {
      const source = readFileSync(join(root, f), 'utf8');
      if (f === 'mating.ts') continue;
      expect(source, f).toContain('SECURITY_HEADERS');
      expect(source, f).not.toContain('MATING_HEADERS');
    }
    // The mating Function's headers come from the route module, which uses MATING_HEADERS.
    const route = readFileSync(new URL('../../src/render/matingRoute.ts', import.meta.url), 'utf8');
    expect(route).toContain('...MATING_HEADERS');
    expect(route).not.toContain('SECURITY_HEADERS');
  });
});
