import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { connectDB } from '@/lib/db';
import { Company } from '@/models/Company';
import { License } from '@/models/License';
import { User } from '@/models/User';
import { Membership } from '@/models/Membership';
import { authenticateRequest, enforceTenant } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const rawList = Array.isArray(body.employees) ? body.employees : [];

    if (rawList.length === 0) {
      return NextResponse.json({ error: 'No employee records provided for import.' }, { status: 400 });
    }

    if (rawList.length > 500) {
      return NextResponse.json({ error: 'Maximum 500 employee records allowed per batch import.' }, { status: 400 });
    }

    const company = await Company.findById(companyId);
    const license = await License.findOne({ companyId });

    if (!company) {
      return NextResponse.json({ error: 'Company workspace not found.' }, { status: 404 });
    }

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    const availableSeats = license ? Math.max(0, license.seatLimit - license.occupiedSeats) : 0;

    for (let index = 0; index < rawList.length; index++) {
      const item = rawList[index];
      const rawName = item.name || item.Name || item['Full Name'] || item['Employee Name'];
      const rawEmail = item.email || item.Email || item['Email Address'];
      const phone = (item.phone || item.contactNumber || item['Contact Number'] || item['Contact'] || item.Phone || item.Mobile || '').toString().trim();
      const department = (item.department || item.Department || item.Dept || '').toString().trim();
      const designation = (item.designation || item.Designation || item.Role || item.Title || '').toString().trim();
      const systemId = (item.systemId || item.system_id || item['System ID'] || item['SystemId'] || item['Emp ID'] || '').toString().trim();
      if (!rawEmail || typeof rawEmail !== 'string') {
        errors.push(`Row ${index + 1}: Missing email address.`);
        skippedCount++;
        continue;
      }

      const email = rawEmail.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        errors.push(`Row ${index + 1} (${email}): Invalid email format.`);
        skippedCount++;
        continue;
      }

      const name = (rawName && typeof rawName === 'string') ? rawName.trim() : email.split('@')[0];

      try {
        let user = await User.findOne({ email });

        if (user) {
          if (user.role !== 'employee') {
            errors.push(`Row ${index + 1} (${email}): Account is not an employee account.`);
            skippedCount++;
            continue;
          }
          if (user.companyId && user.companyId.toString() !== companyId.toString()) {
            errors.push(`Row ${index + 1} (${email}): User belongs to another company workspace.`);
            skippedCount++;
            continue;
          }

          // Update existing employee in company
          user.name = name || user.name;
          if (phone) user.phone = phone;
          if (department) user.department = department;
          if (designation) user.designation = designation;
          if (systemId) user.systemId = systemId;
          user.isActive = true;

          let membership = await Membership.findOne({ companyId, userId: user._id });
          if (!membership) {
            membership = new Membership({
              companyId,
              userId: user._id,
              role: 'employee',
              status: 'active',
              hasSeat: false,
            });
          } else {
            membership.status = 'active';
          }

          await Promise.all([user.save(), membership.save()]);
          updatedCount++;
        } else {
          const unusablePasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
          user = await User.create({
            email,
            name,
            phone,
            department,
            designation,
            systemId,
            passwordHash: unusablePasswordHash,
            role: 'employee',
            companyId,
            isActive: true,
            hasLicenseSeat: false,
          });

          await Membership.create({
            companyId,
            userId: user._id,
            role: 'employee',
            status: 'active',
            hasSeat: false,
          });

          createdCount++;
        }
      } catch (err: any) {
        errors.push(`Row ${index + 1} (${email}): ${err.message || 'Error saving user'}`);
        skippedCount++;
      }
    }

    await logAuditEvent({
      companyId,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      action: 'EMPLOYEES_BULK_IMPORTED',
      entityType: 'User',
      entityId: companyId.toString(),
      details: {
        totalSubmitted: rawList.length,
        createdCount,
        updatedCount,
        skippedCount,
      },
      req,
    });

    return NextResponse.json({
      success: true,
      message: `Batch import completed: ${createdCount} created, ${updatedCount} updated, ${skippedCount} skipped.`,
      summary: {
        total: rawList.length,
        created: createdCount,
        updated: updatedCount,
        skipped: skippedCount,
        errors,
        availableSeatsRemaining: availableSeats,
      },
    }, { status: 200 });
  } catch (err: any) {
    console.error('[EmployeeImport] Error processing bulk import:', err);
    return NextResponse.json({ error: err.message || 'Internal server error during import' }, { status: 500 });
  }
}
