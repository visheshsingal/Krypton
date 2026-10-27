import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Company } from '@/models/Company';
import { License } from '@/models/License';
import { Membership } from '@/models/Membership';
import { Device } from '@/models/Device';
import { SecurityEvent } from '@/models/SecurityEvent';
import { authenticateRequest, enforceTenant } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.error || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const explicitCompanyId = req.headers.get('x-company-id') || req.nextUrl.searchParams.get('companyId');
    const tenant = enforceTenant(auth.user, explicitCompanyId);
    if (tenant.error || !tenant.companyId) {
      return NextResponse.json({ error: tenant.error || 'Tenant required' }, { status: tenant.status || 403 });
    }

    await connectDB();
    const companyId = tenant.companyId;

    const [company, license, totalEmployees, activeDevices, totalIncidents] = await Promise.all([
      Company.findById(companyId),
      License.findOne({ companyId }),
      Membership.countDocuments({ companyId, status: 'active' }),
      Device.countDocuments({ companyId, status: 'active' }),
      SecurityEvent.countDocuments({ companyId }),
    ]);

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const seatLimit = license?.seatLimit || 0;
    const occupiedSeats = license?.occupiedSeats || 0;
    const availableSeats = Math.max(0, seatLimit - occupiedSeats);

    return NextResponse.json({
      company: {
        id: company._id,
        name: company.name,
        slug: company.slug,
        plan: company.plan,
        status: company.status,
        contactEmail: company.contactEmail,
        createdAt: company.createdAt,
      },
      license: license
        ? {
            id: license._id,
            licenseKey: license.licenseKey,
            plan: license.plan,
            seatLimit,
            occupiedSeats,
            availableSeats,
            status: license.status,
            maxDevicesPerUser: license.maxDevicesPerUser,
            offlineGraceHours: license.offlineGraceHours,
            expiresAt: license.expiresAt,
          }
        : null,
      stats: {
        totalEmployees,
        activeDevices,
        totalIncidents,
        seatsUtilizationPercent: seatLimit > 0 ? Math.round((occupiedSeats / seatLimit) * 100) : 0,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
