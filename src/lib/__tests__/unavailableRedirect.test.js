import { describe, it, expect } from 'vitest';
import { unavailableRedirect } from '../unavailableRedirect.js';

describe('unavailableRedirect', () => {
  it('is a 302 with no body', async () => {
    const res = unavailableRedirect('expired');
    expect(res.status).toBe(302);
    expect(await res.text()).toBe('');
  });

  it.each(['inactive', 'expired', 'not-found', 'error'])(
    'sends a %s scan to /code-unavailable with that reason',
    (reason) => {
      expect(unavailableRedirect(reason).headers.get('location')).toBe(
        `/code-unavailable?reason=${reason}`
      );
    }
  );

  // Regression: an absolute Location built from request.url pointed at the
  // server's own localhost (http://localhost:3000/...), so a phone scanning the
  // code got Chrome's "can't be reached" page instead of the unavailable page.
  // It must stay relative so the browser keeps the host it scanned on.
  it('uses a relative Location, never an absolute URL', () => {
    const location = unavailableRedirect('expired').headers.get('location');
    expect(location.startsWith('/')).toBe(true);
    expect(location).not.toMatch(/^[a-z][a-z0-9+.-]*:/i);
    expect(location).not.toContain('localhost');
  });

  it('resolves against the host the visitor scanned on', () => {
    const location = unavailableRedirect('expired').headers.get('location');
    expect(new URL(location, 'https://qrgo.example.com/r/abc123').href).toBe(
      'https://qrgo.example.com/code-unavailable?reason=expired'
    );
    expect(new URL(location, 'http://192.168.0.44:3000/r/abc123').href).toBe(
      'http://192.168.0.44:3000/code-unavailable?reason=expired'
    );
  });
});
