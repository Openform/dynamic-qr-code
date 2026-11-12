/**
 * A code's schedules: while one is live, scans go to its URL instead of the
 * code's main destination (see lib/schedules.js).
 *
 * GET  /api/qrcodes/[id]/schedules — the schedules panel's data
 * POST /api/qrcodes/[id]/schedules — add a schedule to the end of the list.
 *      A date range: { label, destinationUrl, timeZone, startsAt, endsAt }
 *      with the times as ISO strings with an offset. A weekly schedule:
 *      { kind: 'weekly', label, destinationUrl, timeZone, days, startTime,
 *      endTime } with days as bits (1 = Monday … 64 = Sunday) and the times
 *      as "HH:MM" in timeZone. See lib/scheduleInput.js.
 * PUT  /api/qrcodes/[id]/schedules — reorder. Body: { order: [ids] } listing
 *      every schedule once, highest priority first.
 *
 * Adding and reordering need a package with schedules (Business and up).
 * Every response is the panel's data: { schedules, liveScheduleId, canEdit,
 * limit, qrcode }.
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { getSession } from '@/lib/auth';
import { PRIVATE_HEADERS } from '@/lib/clientQRCode';
import { parseScheduleInput, MAX_SCHEDULES_PER_CODE } from '@/lib/scheduleInput';
import {
  loadSchedulesPanel,
  userCanUseSchedules,
  idParam,
  SCHEDULES_PACKAGE_ERROR,
  SCHEDULES_TYPE_ERROR,
} from '@/lib/qrcodeApi';
const { createSchedule, reorderSchedules } = require('@/lib/db');

const notFound = () => Response.json({ error: 'QR code not found' }, { status: 404 });
const unauthenticated = () => Response.json({ error: 'Authentication required' }, { status: 401 });
const unsupported = () =>
  Response.json({ error: SCHEDULES_TYPE_ERROR, code: 'CONTENT_TYPE_UNSUPPORTED' }, { status: 400 });
const packageRefused = () =>
  Response.json({ error: SCHEDULES_PACKAGE_ERROR, code: 'PACKAGE_FEATURE' }, { status: 403 });

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return unauthenticated();
    const codeId = idParam((await params).id);
    if (!codeId) return notFound();

    const canEdit = await userCanUseSchedules(session.userId);
    const panel = await loadSchedulesPanel(codeId, session.userId, canEdit);
    return panel ? Response.json(panel, { headers: PRIVATE_HEADERS }) : notFound();
  } catch (error) {
    console.error('GET /api/qrcodes/[id]/schedules error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return unauthenticated();
    const codeId = idParam((await params).id);
    if (!codeId) return notFound();
    if (!(await userCanUseSchedules(session.userId))) return packageRefused();

    const body = await request.json().catch(() => null);
    const input = parseScheduleInput(body);
    if (input.error) return Response.json({ error: input.error }, { status: 400 });

    const result = await createSchedule(codeId, session.userId, input.fields, MAX_SCHEDULES_PER_CODE);
    if (!result.ok) {
      if (result.reason === 'not_found') return notFound();
      if (result.reason === 'unsupported') return unsupported();
      return Response.json(
        {
          error: `A code can have at most ${MAX_SCHEDULES_PER_CODE} schedules that haven’t ended. Delete one first.`,
          code: 'SCHEDULE_LIMIT',
        },
        { status: 409 }
      );
    }

    return Response.json(await loadSchedulesPanel(codeId, session.userId, true), { status: 201 });
  } catch (error) {
    console.error('POST /api/qrcodes/[id]/schedules error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return unauthenticated();
    const codeId = idParam((await params).id);
    if (!codeId) return notFound();
    if (!(await userCanUseSchedules(session.userId))) return packageRefused();

    const body = await request.json().catch(() => null);
    const order = body?.order;
    if (!Array.isArray(order) || !order.every((id) => Number.isInteger(id))) {
      return Response.json({ error: 'Send the order as a list of schedule ids.' }, { status: 400 });
    }

    const outcome = await reorderSchedules(codeId, session.userId, order);
    if (outcome === 'not_found') return notFound();
    if (outcome === 'mismatch') {
      return Response.json(
        { error: 'The order must list every one of the code’s schedules once. Reload and try again.' },
        { status: 400 }
      );
    }

    return Response.json(await loadSchedulesPanel(codeId, session.userId, true));
  } catch (error) {
    console.error('PUT /api/qrcodes/[id]/schedules error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
