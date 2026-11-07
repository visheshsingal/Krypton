import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, enforceTenant } from '@/lib/auth';
import { calculateAiSafetyMetrics } from '@/lib/ai-safety';
import { connectDB } from '@/lib/db';
import { Membership } from '@/models/Membership';
import { SecurityEvent } from '@/models/SecurityEvent';

export const dynamic = 'force-dynamic';

const EVENT_READ_LIMIT = 50_000;

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
    const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const memberships = await Membership.find({
      companyId,
      role: 'employee',
      status: 'active',
      hasSeat: true,
    }).populate('userId', 'name email role isActive hasLicenseSeat department').lean();

    const employees = memberships.flatMap((membership) => {
      const user = membership.userId as unknown as {
        _id: mongoose.Types.ObjectId;
        name: string;
        email: string;
        role: string;
        isActive: boolean;
        hasLicenseSeat: boolean;
        department?: string;
      } | null;
      if (!user || !user.isActive || !user.hasLicenseSeat || user.role !== 'employee') return [];
      return [{
        userId: user._id.toString(),
        name: user.name,
        email: user.email,
        department: user.department?.trim() || 'Unassigned',
      }];
    });

    const employeeIds = employees.map((employee) => new mongoose.Types.ObjectId(employee.userId));
    const events = employeeIds.length
      ? await SecurityEvent.find({
          companyId,
          userId: { $in: employeeIds },
          eventType: 'prompt_submission',
          timestamp: { $gte: periodStart },
        })
          .select('userId timestamp deviceId riskLevel category actionTaken warningResponse')
          .sort({ timestamp: -1 })
          .limit(EVENT_READ_LIMIT + 1)
          .lean()
      : [];
    const coverageLimited = events.length > EVENT_READ_LIMIT;
    const scoredEvents = events.slice(0, EVENT_READ_LIMIT);
    const eventsByUser = new Map<string, typeof scoredEvents>();
    for (const event of scoredEvents) {
      const userId = event.userId.toString();
      const userEvents = eventsByUser.get(userId) || [];
      userEvents.push(event);
      eventsByUser.set(userId, userEvents);
    }

    const scoredEmployees = employees.map((employee) => ({
      ...employee,
      ...calculateAiSafetyMetrics(
        (eventsByUser.get(employee.userId) || []).map((event) => ({
          timestamp: event.timestamp,
          deviceId: event.deviceId,
          riskLevel: event.riskLevel,
          category: event.category,
          actionTaken: event.actionTaken,
          warningResponse: event.warningResponse,
        })),
      ),
      rank: null as number | null,
    }));

    const rankedEmployees = scoredEmployees
      .filter((employee) => employee.score !== null)
      .sort((left, right) =>
        (right.score || 0) - (left.score || 0) ||
        right.safeInteractions - left.safeInteractions ||
        left.name.localeCompare(right.name),
      );
    rankedEmployees.forEach((employee, index) => {
      employee.rank = index + 1;
    });

    const teams = new Map<string, typeof scoredEmployees>();
    for (const employee of scoredEmployees) {
      if (employee.score === null) continue;
      const team = teams.get(employee.department) || [];
      team.push(employee);
      teams.set(employee.department, team);
    }
    const rankedTeams = Array.from(teams.entries())
      .map(([name, members]) => ({
        name,
        score: Math.round(members.reduce((sum, member) => sum + (member.score || 0), 0) / members.length),
        members: members.length,
        safeInteractions: members.reduce((sum, member) => sum + member.safeInteractions, 0),
        warningRecoveries: members.reduce((sum, member) => sum + member.warningRecoveries, 0),
      }))
      .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
      .map((team, index) => ({ ...team, rank: index + 1 }));

    return NextResponse.json({
      periodStart,
      periodEnd: new Date(),
      coverageLimited,
      employees: scoredEmployees,
      teams: rankedTeams,
      summary: {
        ratedEmployees: rankedEmployees.length,
        averageScore: rankedEmployees.length
          ? Math.round(rankedEmployees.reduce((sum, employee) => sum + (employee.score || 0), 0) / rankedEmployees.length)
          : null,
        safeInteractions: scoredEmployees.reduce((sum, employee) => sum + employee.safeInteractions, 0),
        warningRecoveries: scoredEmployees.reduce((sum, employee) => sum + employee.warningRecoveries, 0),
      },
    });
  } catch (error) {
    console.error('[AiSafety] Could not calculate company AI safety scores:', error);
    return NextResponse.json({ error: 'Could not load AI safety scores.' }, { status: 500 });
  }
}
