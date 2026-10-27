import { NextRequest, NextResponse } from 'next/server';
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
    const companyId = tenant.companyId;

    const { searchParams } = req.nextUrl;
    const riskLevel = searchParams.get('riskLevel');
    const actionTaken = searchParams.get('actionTaken');
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const limitParam = searchParams.get('limit');
    const pageParam = searchParams.get('page');

    const filter: any = { companyId };
    if (riskLevel) filter.riskLevel = riskLevel;
    if (actionTaken) filter.actionTaken = actionTaken;
    if (category) filter.category = category;

    if (search) {
      const s = search.trim();
      filter.$or = [
        { userEmail: { $regex: s, $options: 'i' } },
        { userName: { $regex: s, $options: 'i' } },
        { ruleName: { $regex: s, $options: 'i' } },
        { ruleCode: { $regex: s, $options: 'i' } },
        { deviceName: { $regex: s, $options: 'i' } },
        { targetApp: { $regex: s, $options: 'i' } },
      ];
    }

    const limit = Math.min(Math.max(parseInt(limitParam || '50', 10) || 50, 1), 200);
    const page = Math.max(parseInt(pageParam || '1', 10) || 1, 1);
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      SecurityEvent.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit),
      SecurityEvent.countDocuments(filter),
    ]);

    return NextResponse.json({
      events: events.map((e) => ({
        id: e._id,
        userId: e.userId,
        userEmail: e.userEmail,
        userName: e.userName,
        deviceId: e.deviceId,
        deviceName: e.deviceName,
        targetApp: e.targetApp,
        riskLevel: e.riskLevel,
        ruleCode: e.ruleCode,
        ruleName: e.ruleName,
        category: e.category,
        actionTaken: e.actionTaken,
        redactedPreview: e.redactedPreview,
        explanation: e.explanation,
        timestamp: e.timestamp,
      })),
      pagination: {
        total,
        page,
        totalPages: Math.ceil(total / limit),
        limit,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
