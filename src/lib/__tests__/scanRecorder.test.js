import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The daily housekeeping job calls into the database; replace it (and the GeoIP
// lookup, which reads a file) so the job's own logic can be tested on its own.
vi.mock('../db', () => ({
  recordScan: vi.fn(),
  pruneScanEvents: vi.fn(),
  purgeExpiredTrash: vi.fn(),
}));
vi.mock('../geo', () => ({ lookupLocation: vi.fn() }));

import { pruneScanEvents, purgeExpiredTrash } from '../db';
import { pruneIfDue } from '../scanRecorder';
import { TRASH_RETENTION_DAYS } from '../trash';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// pruneIfDue remembers when it last ran, for the life of the module. Each test
// starts on a "new day", three days after the last one (more than the day, plus
// the 25 hours one test advances by), so an earlier test never throttles it.
let now = Date.UTC(2026, 0, 1);
const startNewDay = () => (now += 3 * DAY);

beforeEach(() => {
  vi.clearAllMocks();
  pruneScanEvents.mockResolvedValue(0);
  purgeExpiredTrash.mockResolvedValue(0);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('pruneIfDue (daily housekeeping)', () => {
  it('prunes old scan rows and deletes codes past their time in Trash', async () => {
    vi.stubEnv('ANALYTICS_RETENTION_MONTHS', '24');
    await pruneIfDue(startNewDay());

    expect(pruneScanEvents).toHaveBeenCalledTimes(1);
    expect(pruneScanEvents.mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(purgeExpiredTrash).toHaveBeenCalledTimes(1);
    expect(purgeExpiredTrash).toHaveBeenCalledWith({ retentionDays: TRASH_RETENTION_DAYS });
  });

  it('still purges Trash when scan retention is switched off (keep everything)', async () => {
    // Regression: the scan job used to `return` early here, which skipped the
    // Trash purge for every deployment that keeps its scan history forever.
    vi.stubEnv('ANALYTICS_RETENTION_MONTHS', '0');
    await pruneIfDue(startNewDay());

    expect(pruneScanEvents).not.toHaveBeenCalled();
    expect(purgeExpiredTrash).toHaveBeenCalledWith({ retentionDays: TRASH_RETENTION_DAYS });
  });

  it('runs at most once a day', async () => {
    const start = startNewDay();
    await pruneIfDue(start);
    await pruneIfDue(start + HOUR);
    await pruneIfDue(start + 23 * HOUR);
    expect(purgeExpiredTrash).toHaveBeenCalledTimes(1);

    await pruneIfDue(start + 25 * HOUR);
    expect(purgeExpiredTrash).toHaveBeenCalledTimes(2);
  });

  it('a failing scan prune does not stop the Trash purge', async () => {
    pruneScanEvents.mockRejectedValue(new Error('scan table locked'));
    await expect(pruneIfDue(startNewDay())).resolves.toBeUndefined();

    expect(purgeExpiredTrash).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith('Scan retention error:', expect.any(Error));
  });

  it('a failing Trash purge does not stop the scan prune, and never throws', async () => {
    purgeExpiredTrash.mockRejectedValue(new Error('database away'));
    await expect(pruneIfDue(startNewDay())).resolves.toBeUndefined();

    expect(pruneScanEvents).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith('Trash purge error:', expect.any(Error));
  });

  it('says so in the log when it deleted something', async () => {
    pruneScanEvents.mockResolvedValue(12);
    purgeExpiredTrash.mockResolvedValue(3);
    await pruneIfDue(startNewDay());

    const logged = console.log.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged).toMatch(/deleted 12 scan rows/);
    expect(logged).toMatch(/permanently deleted 3 codes/);
  });
});
