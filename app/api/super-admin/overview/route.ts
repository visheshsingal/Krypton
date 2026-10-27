import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Company } from '@/models/Company';
import { License } from '@/models/License';
import { Device } from '@/models/Device';
import { SecurityEvent } from '@/models/SecurityEvent';
import { AuditLog } from '@/models/AuditLog';
import { authenticateRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.error || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    if (auth.user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Access denied. Super Admin role required.' }, { status: 403 });
    }

    await connectDB();

    const [
      totalCompanies,
      activeCompanies,
      licenses,
      totalDevices,
      totalEvents,
      recentCompanies,
      recentAuditLogs,
    ] = await Promise.all([
      Company.countDocuments(),
      Company.countDocuments({ status: 'active' }),
      License.find(),
      Device.countDocuments({ status: 'active' }),
      SecurityEvent.countDocuments(),
      Company.find().sort({ createdAt: -1 }).limit(5),
      AuditLog.find().sort({ timestamp: -1 }).limit(10),
    ]);

    let totalLicensedSeats = 0;
    let totalOccupiedSeats = 0;

    for (const lic of licenses) {
      totalLicensedSeats += lic.seatLimit || 0;
      totalOccupiedSeats += lic.occupiedSeats || 0;
    }

    return NextResponse.json({
      metrics: {
        totalCompanies,
        activeCompanies,
        totalLicensedSeats,
        totalOccupiedSeats,
        seatUtilizationPercent:
          totalLicensedSeats > 0 ? Math.round((totalOccupiedSeats / totalLicensedSeats) * 100) : 0,
        totalDevices,
        totalEvents,
      },
      recentCompanies,
      recentAuditLogs,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
