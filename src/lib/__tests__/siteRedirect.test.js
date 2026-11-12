import { describe, it, expect } from 'vitest';
import { isSitePath, redirectToSitePath } from '../siteRedirect';

describe('redirectToSitePath', () => {
  it('sends just the path, so the browser stays on the address it used', () => {
    const response = redirectToSitePath('/r/abc123/open');
    expect(response.status).toBe(302);
    // Never an absolute URL: behind Hostinger's proxy, one built from
    // request.url would be http://0.0.0.0:3000/…
    expect(response.headers.get('location')).toBe('/r/abc123/open');
  });

  it('keeps the query and takes another status', () => {
    const response = redirectToSitePath('/code-unavailable?reason=not-found', 303);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/code-unavailable?reason=not-found');
  });

  it('refuses anything that could leave the site', () => {
    for (const bad of ['//evil.example/x', '/\\evil.example', 'https://evil.example', 'r/abc', '', null]) {
      expect(isSitePath(bad), String(bad)).toBe(false);
      expect(() => redirectToSitePath(bad)).toThrow();
    }
  });
});
