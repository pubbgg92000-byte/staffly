/**
 * verify-demo.ts — read-only assertions over the seeded `staffly-demo` org.
 *
 * Run after `db:seed:demo` to certify demo-data quality:
 *   - no attendance "present"/"half_day" on an approved-leave day
 *   - no "on_leave" attendance without a matching approved leave request
 *   - check-in times sit in a realistic local-morning window per timezone
 *   - today's attendance (org-tz) is populated
 *   - leave balances reconcile with approved/pending request units
 *   - every document version's storageKey exists in object storage (MinIO/R2)
 *
 * Exits non-zero if any assertion fails, so it can gate the demo reset.
 */
import { PrismaClient } from "@prisma/client";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  localDateInTimezone,
  localMinutesInTimezone,
} from "../src/attendance/local-date";
import { loadEnv } from "../src/infra/config/env";

const prisma = new PrismaClient();
const ORG_SLUG = "staffly-demo";
const ORG_TZ = "America/New_York";

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}
const checks: Check[] = [];
function record(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
}

async function main(): Promise<void> {
  const org = await prisma.organization.findFirstOrThrow({
    where: { slug: ORG_SLUG },
  });
  const orgId = org.id;

  // 1. No present/half_day attendance on an approved-leave day.
  const presentDuringLeave = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*)::bigint AS count
    FROM attendance_records a
    JOIN leave_requests lr ON lr.employee_id = a.employee_id
    WHERE a.organization_id = ${orgId}::uuid
      AND lr.status = 'approved'
      AND a.attendance_date BETWEEN lr.start_date AND lr.end_date
      AND a.status IN ('present','half_day')`;
  const contradictions = Number(presentDuringLeave[0]?.count ?? 0);
  record(
    "no present/half_day during approved leave",
    contradictions === 0,
    `${contradictions} contradictions`,
  );

  // 2. No on_leave attendance without a matching approved leave request.
  const onLeaveNoReq = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*)::bigint AS count
    FROM attendance_records a
    WHERE a.organization_id = ${orgId}::uuid
      AND a.status = 'on_leave'
      AND NOT EXISTS (
        SELECT 1 FROM leave_requests lr
        WHERE lr.employee_id = a.employee_id
          AND lr.status = 'approved'
          AND a.attendance_date BETWEEN lr.start_date AND lr.end_date)`;
  const orphanLeave = Number(onLeaveNoReq[0]?.count ?? 0);
  record(
    "no on_leave attendance without approved request",
    orphanLeave === 0,
    `${orphanLeave} orphan on_leave rows`,
  );

  // 3. Check-in local times in a realistic morning window [07:30, 11:00].
  const records = await prisma.attendanceRecord.findMany({
    where: { organizationId: orgId, checkInAt: { not: null } },
    select: {
      checkInAt: true,
      employee: { select: { location: { select: { timezone: true } } } },
    },
  });
  let outOfWindow = 0;
  for (const r of records) {
    const tz = r.employee.location?.timezone ?? ORG_TZ;
    const mins = localMinutesInTimezone(r.checkInAt!, tz);
    if (mins < 7 * 60 + 30 || mins > 11 * 60) outOfWindow++;
  }
  record(
    "check-in local times in [07:30,11:00]",
    outOfWindow === 0,
    `${outOfWindow}/${records.length} outside window`,
  );

  // 4. Today's attendance (org-tz) is populated.
  const todayStr = localDateInTimezone(new Date(), ORG_TZ);
  const todayCount = await prisma.attendanceRecord.count({
    where: {
      organizationId: orgId,
      attendanceDate: new Date(`${todayStr}T00:00:00.000Z`),
    },
  });
  record(
    "today's attendance populated (org-tz)",
    todayCount > 0,
    `${todayCount} records on ${todayStr}`,
  );

  // 5. Leave balances reconcile: used == sum(approved units), pending == sum(pending units).
  const mismatches = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*)::bigint AS count FROM (
      SELECT b.id,
             b.used,
             b.pending,
             COALESCE(ap.u, 0) AS approved_units,
             COALESCE(pe.u, 0) AS pending_units
      FROM leave_balances b
      LEFT JOIN (
        SELECT employee_id, leave_type_id, SUM(units) u
        FROM leave_requests WHERE status='approved' GROUP BY 1,2
      ) ap ON ap.employee_id=b.employee_id AND ap.leave_type_id=b.leave_type_id
      LEFT JOIN (
        SELECT employee_id, leave_type_id, SUM(units) u
        FROM leave_requests WHERE status='pending' GROUP BY 1,2
      ) pe ON pe.employee_id=b.employee_id AND pe.leave_type_id=b.leave_type_id
      WHERE b.organization_id = ${orgId}::uuid
    ) t
    WHERE t.used <> t.approved_units OR t.pending <> t.pending_units`;
  const balMismatch = Number(mismatches[0]?.count ?? 0);
  record(
    "leave balances reconcile with requests",
    balMismatch === 0,
    `${balMismatch} mismatched balance rows`,
  );

  // 6. Every current document version's storageKey exists in object storage.
  const env = loadEnv();
  const versions = await prisma.documentVersion.findMany({
    where: { document: { organizationId: orgId } },
    select: { storageKey: true },
  });
  if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    record(
      "document binaries present in storage",
      false,
      "storage not configured (S3_* unset) — cannot verify",
    );
  } else {
    const s3 = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
    let missing = 0;
    for (const v of versions) {
      try {
        await s3.send(
          new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: v.storageKey }),
        );
      } catch {
        missing++;
      }
    }
    record(
      "document binaries present in storage",
      missing === 0,
      `${missing}/${versions.length} storageKeys missing in bucket ${env.S3_BUCKET}`,
    );
  }

  // Report.
  // eslint-disable-next-line no-console
  console.log(`\nverify-demo — ${ORG_SLUG} (${orgId})\n`);
  let failed = 0;
  for (const c of checks) {
    const mark = c.ok ? "✓" : "✗";
    if (!c.ok) failed++;
    // eslint-disable-next-line no-console
    console.log(`  ${mark} ${c.name} — ${c.detail}`);
  }
  // eslint-disable-next-line no-console
  console.log(
    `\n${checks.length - failed}/${checks.length} checks passed${failed ? ` — ${failed} FAILED` : ""}\n`,
  );
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
