import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
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
      return NextResponse.json({ error: tenant.error }, { status: tenant.status || 403 });
    }

    await connectDB();
    const companyId = new mongoose.Types.ObjectId(tenant.companyId);

    const [riskStats, actionStats, categoryStats, recentIncidents] = await Promise.all([
      SecurityEvent.aggregate([
        { $match: { companyId } },
        { $group: { _id: '$riskLevel', count: { $sum: 1 } } },
      ]),
      SecurityEvent.aggregate([
        { $match: { companyId } },
        { $group: { _id: '$actionTaken', count: { $sum: 1 } } },
      ]),
      SecurityEvent.aggregate([
        { $match: { companyId } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
      SecurityEvent.find({ companyId }).sort({ timestamp: -1 }).limit(5),
    ]);

    const riskCounts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    for (const r of riskStats) {
      if (r._id in riskCounts) (riskCounts as any)[r._id] = r.count;
    }

    const actionCounts = { allow: 0, warn: 0, block: 0 };
    for (const a of actionStats) {
      if (a._id in actionCounts) (actionCounts as any)[a._id] = a.count;
    }

    return NextResponse.json({
      riskCounts,
      actionCounts,
      categoryBreakdown: categoryStats.map((c) => ({ category: c._id, count: c.count })),
      recentIncidents,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
