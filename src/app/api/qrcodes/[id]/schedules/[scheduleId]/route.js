/**
 * One of a code's schedules.
 *
 * PATCH  /api/qrcodes/[id]/schedules/[scheduleId] — change any of label,
 *        destinationUrl, timeZone, enabled, and the timing fields of the
 *        schedule's kind (startsAt, endsAt for a date range; days,
 *        startTime, endTime for a weekly one). Needs a package with
 *        schedules, except switching one off.
 * DELETE /api/qrcodes/[id]/schedules/[scheduleId] — delete it (any package).
 *
 * Switching off and deleting work on every package, so an account that can
 * no longer edit schedules (e.g. after a downgrade) can still stop them.
 * Every response is the schedules panel's data (see ../route.js).
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { getSession } from '@/lib/auth';
import { parseScheduleInput, onlySwitchesOff } from '@/lib/scheduleInput';
import {
  loadSchedulesPanel,
  userCanUseSchedules,
  idParam,
  SCHEDULES_PACKAGE_ERROR,
} from '@/lib/qrcodeApi';
const { getSchedule, updateSchedule, deleteSchedule } = require('@/lib/db');

const notFound = () => Response.json({ error: 'Schedule not found' }, { status: 404 });
const unauthenticated = () => Response.json({ error: 'Authentication required' }, { status: 401 });

export async function PATCH(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return unauthenticated();
    const { id, scheduleId } = await params;
    const codeId = idParam(id);
    const schedId = idParam(scheduleId);
    if (!codeId || !schedId) return notFound();

    const existing = await getSchedule(codeId, session.userId, schedId);
    if (!existing) return notFound();

    const body = await request.json().catch(() => null);
    const input = parseScheduleInput(body, { existing });
    if (input.error) return Response.json({ error: input.error }, { status: 400 });

    const canEdit = await userCanUseSchedules(session.userId);
    if (!canEdit && !onlySwitchesOff(input.fields)) {
      return Response.json({ error: SCHEDULES_PACKAGE_ERROR, code: 'PACKAGE_FEATURE' }, { status: 403 });
    }

    if (!(await updateSchedule(codeId, session.userId, schedId, input.fields))) return notFound();
    return Response.json(await loadSchedulesPanel(codeId, session.userId, canEdit));
  } catch (error) {
    console.error('PATCH /api/qrcodes/[id]/schedules/[scheduleId] error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return unauthenticated();
    const { id, scheduleId } = await params;
    const codeId = idParam(id);
    const schedId = idParam(scheduleId);
    if (!codeId || !schedId) return notFound();

    if (!(await deleteSchedule(codeId, session.userId, schedId))) return notFound();
    const canEdit = await userCanUseSchedules(session.userId);
    return Response.json(await loadSchedulesPanel(codeId, session.userId, canEdit));
  } catch (error) {
    console.error('DELETE /api/qrcodes/[id]/schedules/[scheduleId] error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
