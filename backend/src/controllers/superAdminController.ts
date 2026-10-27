import { Request, Response } from 'express';
import { Company } from '../models/Company';
import { License } from '../models/License';
import { Subscription } from '../models/Subscription';
import { User } from '../models/User';
import { Device } from '../models/Device';
import { SecurityEvent } from '../models/SecurityEvent';
import { AuditLog } from '../models/AuditLog';
import { generateLicenseKey } from '../services/licenseService';
import { createAuditLog } from '../services/auditService';

export async function getSuperAdminOverview(req: Request, res: Response): Promise<void> {
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

  res.json({
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
}

export async function listCompanies(req: Request, res: Response): Promise<void> {
  const companies = await Company.find().sort({ createdAt: -1 });

  const companyIds = companies.map((c) => c._id);
  const [licenses, admins, devices, events] = await Promise.all([
    License.find({ companyId: { $in: companyIds } }),
    User.find({ companyId: { $in: companyIds }, role: 'company_admin' }),
    Device.find({ companyId: { $in: companyIds }, status: 'active' }),
    SecurityEvent.aggregate([
      { $match: { companyId: { $in: companyIds } } },
      { $group: { _id: '$companyId', count: { $sum: 1 } } },
    ]),
  ]);

  const licMap = new Map(licenses.map((l) => [l.companyId.toString(), l]));
  const adminMap = new Map(admins.map((a) => [a.companyId!.toString(), a]));
  const eventCountMap = new Map(events.map((e) => [e._id.toString(), e.count]));

  const deviceCountMap: Record<string, number> = {};
  for (const d of devices) {
    const cid = d.companyId.toString();
    deviceCountMap[cid] = (deviceCountMap[cid] || 0) + 1;
  }

  const result = companies.map((c) => {
    const cid = c._id.toString();
    const lic = licMap.get(cid);
    const admin = adminMap.get(cid);

    return {
      id: c._id,
      name: c.name,
      slug: c.slug,
      status: c.status,
      plan: c.plan,
      contactEmail: c.contactEmail || admin?.email,
      adminName: admin?.name || 'N/A',
      adminEmail: admin?.email || 'N/A',
      license: lic
        ? {
            id: lic._id,
            key: lic.licenseKey,
            seatLimit: lic.seatLimit,
            occupiedSeats: lic.occupiedSeats,
            availableSeats: Math.max(0, lic.seatLimit - lic.occupiedSeats),
            status: lic.status,
            expiresAt: lic.expiresAt,
            offlineGraceHours: lic.offlineGraceHours,
          }
        : null,
      deviceCount: deviceCountMap[cid] || 0,
      incidentCount: eventCountMap.get(cid) || 0,
      createdAt: c.createdAt,
    };
  });

  res.json({ companies: result });
}

export async function createLicense(req: Request, res: Response): Promise<void> {
  const { companyId, plan, seatLimit, maxDevicesPerUser = 2, offlineGraceHours = 72, expiresAt } = req.body;

  const company = await Company.findById(companyId);
  if (!company) {
    res.status(404).json({ error: 'Company not found' });
    return;
  }

  const licenseKey = generateLicenseKey();
  const expiry = expiresAt ? new Date(expiresAt) : new Date();
  if (!expiresAt) {
    expiry.setFullYear(expiry.getFullYear() + 1);
  }

  const license = await License.create({
    companyId: company._id,
    licenseKey,
    plan,
    seatLimit,
    occupiedSeats: 0,
    status: 'active',
    maxDevicesPerUser,
    offlineGraceHours,
    expiresAt: expiry,
    createdBy: req.user!.id,
  });

  await createAuditLog({
    companyId: company._id,
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'SUPERADMIN_LICENSE_CREATED',
    entityType: 'License',
    entityId: license._id.toString(),
    details: { licenseKey, plan, seatLimit },
    req,
  });

  res.status(201).json({
    message: 'License created successfully',
    license,
  });
}

export async function updateLicense(req: Request, res: Response): Promise<void> {
  const { id: licenseId } = req.params;
  const updates = req.body;

  const license = await License.findById(licenseId);
  if (!license) {
    res.status(404).json({ error: 'License not found' });
    return;
  }

  if (updates.seatLimit !== undefined) license.seatLimit = updates.seatLimit;
  if (updates.status !== undefined) license.status = updates.status;
  if (updates.maxDevicesPerUser !== undefined) license.maxDevicesPerUser = updates.maxDevicesPerUser;
  if (updates.offlineGraceHours !== undefined) license.offlineGraceHours = updates.offlineGraceHours;
  if (updates.expiresAt !== undefined) license.expiresAt = new Date(updates.expiresAt);

  await license.save();

  await createAuditLog({
    companyId: license.companyId,
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'SUPERADMIN_LICENSE_UPDATED',
    entityType: 'License',
    entityId: license._id.toString(),
    details: updates,
    req,
  });

  res.json({ message: 'License updated successfully', license });
}

export async function renewLicense(req: Request, res: Response): Promise<void> {
  const { id: licenseId } = req.params;
  const { months = 12 } = req.body;

  const license = await License.findById(licenseId);
  if (!license) {
    res.status(404).json({ error: 'License not found' });
    return;
  }

  const newExpiry = new Date(Math.max(new Date().getTime(), license.expiresAt.getTime()));
  newExpiry.setMonth(newExpiry.getMonth() + parseInt(String(months), 10));

  license.expiresAt = newExpiry;
  license.status = 'active';
  await license.save();

  await createAuditLog({
    companyId: license.companyId,
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'SUPERADMIN_LICENSE_RENEWED',
    entityType: 'License',
    entityId: license._id.toString(),
    details: { months, newExpiresAt: newExpiry },
    req,
  });

  res.json({ message: 'License renewed successfully', license });
}

export async function listAuditLogs(req: Request, res: Response): Promise<void> {
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);
  const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(limit);
  res.json({ logs });
}
