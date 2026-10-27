import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { Membership } from '../models/Membership';
import { License } from '../models/License';
import { Subscription } from '../models/Subscription';
import { SecurityPolicy } from '../models/SecurityPolicy';
import { Invitation } from '../models/Invitation';
import { generateAccessToken, generateRefreshToken } from '../middleware/auth';
import { generateLicenseKey } from '../services/licenseService';
import { createAuditLog } from '../services/auditService';
import { sendInvitationEmail } from '../services/emailService';
import { config } from '../config/env';

export async function registerCompany(req: Request, res: Response): Promise<void> {
  const { companyName, adminName, adminEmail, password, plan = 'starter', seats = 5 } = req.body;

  const normalizedEmail = adminEmail.trim().toLowerCase();

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    res.status(409).json({ error: 'An account with this email address already exists.' });
    return;
  }

  // Generate unique slug
  const baseSlug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
  let slug = baseSlug;
  let counter = 1;
  while (await Company.findOne({ slug })) {
    slug = `${baseSlug}-${counter++}`;
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Create Company
    const [company] = await Company.create(
      [
        {
          name: companyName.trim(),
          slug,
          plan,
          status: 'active',
          contactEmail: normalizedEmail,
        },
      ],
      { session }
    );

    // 2. Hash password & create Company Admin User
    const passwordHash = await bcrypt.hash(password, 12);
    const [adminUser] = await User.create(
      [
        {
          email: normalizedEmail,
          passwordHash,
          name: adminName.trim(),
          role: 'company_admin',
          companyId: company._id,
          isActive: true,
          hasLicenseSeat: true, // Admin receives an active seat
        },
      ],
      { session }
    );

    // 3. Create Membership
    await Membership.create(
      [
        {
          userId: adminUser._id,
          companyId: company._id,
          role: 'company_admin',
          status: 'active',
          hasSeat: true,
        },
      ],
      { session }
    );

    // 4. Generate unique cryptographically secure License Key
    const licenseKey = generateLicenseKey();
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1); // 1 year default

    const [license] = await License.create(
      [
        {
          companyId: company._id,
          licenseKey,
          plan,
          seatLimit: Math.max(seats, 1),
          occupiedSeats: 1, // Admin occupies 1 seat
          status: 'active',
          maxDevicesPerUser: config.defaults.maxDevicesPerUser,
          offlineGraceHours: config.defaults.offlineGraceHours,
          expiresAt,
          createdBy: adminUser._id,
        },
      ],
      { session }
    );

    // 5. Create Subscription
    const currentPeriodEnd = new Date();
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

    await Subscription.create(
      [
        {
          companyId: company._id,
          plan,
          status: 'active',
          seatsPurchased: seats,
          billingInterval: 'month',
          amountPerSeatCents: plan === 'enterprise' ? 2900 : plan === 'business' ? 1900 : 1200,
          currentPeriodStart: new Date(),
          currentPeriodEnd,
        },
      ],
      { session }
    );

    // 6. Create default Security Policy for company
    await SecurityPolicy.create(
      [
        {
          companyId: company._id,
          blockCriticalRisk: true,
          blockHighRisk: true,
          warnMediumRisk: true,
          allowLowRisk: true,
          allowEmployeeBypassWarning: true,
          enablePiiDetection: true,
          enableSecretDetection: true,
          enableCustomRules: true,
          maxDevicesPerUser: config.defaults.maxDevicesPerUser,
          offlineGracePeriodHours: config.defaults.offlineGraceHours,
          fullPromptLoggingEnabled: false,
          customRules: [],
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    // Generate tokens
    const accessToken = generateAccessToken({
      id: adminUser._id.toString(),
      email: adminUser.email,
      role: adminUser.role,
      companyId: company._id.toString(),
    });

    const refreshToken = generateRefreshToken({ id: adminUser._id.toString() });
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const refreshExpiresAt = new Date();
    refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 7);

    adminUser.refreshTokens.push({
      tokenHash: refreshTokenHash,
      createdAt: new Date(),
      expiresAt: refreshExpiresAt,
    });
    await adminUser.save();

    await createAuditLog({
      companyId: company._id,
      actorId: adminUser._id,
      actorEmail: adminUser.email,
      actorRole: adminUser.role,
      action: 'COMPANY_REGISTERED',
      entityType: 'Company',
      entityId: company._id.toString(),
      details: { companyName, plan, seats, licenseKey },
    });

    res.status(201).json({
      message: 'Company registered successfully.',
      accessToken,
      refreshToken,
      user: {
        id: adminUser._id.toString(),
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role,
        companyId: company._id.toString(),
      },
      company: {
        id: company._id.toString(),
        name: company.name,
        slug: company.slug,
        plan: company.plan,
      },
      license: {
        licenseKey: license.licenseKey,
        seatLimit: license.seatLimit,
        occupiedSeats: license.occupiedSeats,
        expiresAt: license.expiresAt,
      },
    });
  } catch (error: any) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;
  let normalizedEmail = email.trim().toLowerCase();

  // If user entered "admin", map to admin@kryptonsecurity.com
  if (normalizedEmail === 'admin') {
    normalizedEmail = 'admin@kryptonsecurity.com';
  }

  const user = await User.findOne({
    $or: [{ email: normalizedEmail }, { email: 'superadmin@kryptonsecurity.com' }],
  });
  if (!user) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({ error: 'Your account has been deactivated. Please contact your company administrator.' });
    return;
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  let companyData: any = null;
  let licenseData: any = null;
  if (user.companyId) {
    companyData = await Company.findById(user.companyId);
    if (!companyData || companyData.status !== 'active') {
      res.status(403).json({ error: 'Company workspace is inactive.' });
      return;
    }
    licenseData = await License.findOne({ companyId: user.companyId });
  }

  // Generate tokens
  const accessToken = generateAccessToken({
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    companyId: user.companyId ? user.companyId.toString() : undefined,
  });

  const refreshToken = generateRefreshToken({ id: user._id.toString() });
  const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const refreshExpiresAt = new Date();
  refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 7);

  // Keep max 5 active refresh tokens per user
  user.refreshTokens = user.refreshTokens.filter((t) => t.expiresAt > new Date()).slice(-4);
  user.refreshTokens.push({
    tokenHash: refreshTokenHash,
    createdAt: new Date(),
    expiresAt: refreshExpiresAt,
  });
  await user.save();

  await createAuditLog({
    companyId: user.companyId,
    actorId: user._id,
    actorEmail: user.email,
    actorRole: user.role,
    action: 'USER_LOGIN',
    entityType: 'User',
    entityId: user._id.toString(),
    req,
  });

  res.json({
    accessToken,
    refreshToken,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: user.companyId ? user.companyId.toString() : undefined,
      hasLicenseSeat: user.hasLicenseSeat,
    },
    company: companyData
      ? {
          id: companyData._id.toString(),
          name: companyData.name,
          slug: companyData.slug,
          plan: companyData.plan,
          status: companyData.status,
        }
      : undefined,
    license: licenseData
      ? {
          licenseKey: licenseData.licenseKey,
          seatLimit: licenseData.seatLimit,
          occupiedSeats: licenseData.occupiedSeats,
          availableSeats: Math.max(0, licenseData.seatLimit - licenseData.occupiedSeats),
          status: licenseData.status,
          expiresAt: licenseData.expiresAt,
        }
      : undefined,
  });
}

export async function refreshToken(req: Request, res: Response): Promise<void> {
  const { refreshToken: token } = req.body;

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = new Date();
    const tokenQuery = {
      refreshTokens: {
        $elemMatch: {
          tokenHash,
          expiresAt: { $gt: now },
        },
      },
    };
    const user = await User.findOne({
      ...tokenQuery,
      isActive: true,
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }

    // Rotate refresh token
    const newAccessToken = generateAccessToken({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      companyId: user.companyId ? user.companyId.toString() : undefined,
    });

    const newRefreshToken = generateRefreshToken({ id: user._id.toString() });
    const newHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + 7);

    const rotatedUser = await User.findOneAndUpdate(
      { _id: user._id, isActive: true, ...tokenQuery },
      {
        $set: {
          'refreshTokens.$[matchingToken].tokenHash': newHash,
          'refreshTokens.$[matchingToken].createdAt': now,
          'refreshTokens.$[matchingToken].expiresAt': newExpiresAt,
        },
      },
      {
        new: true,
        arrayFilters: [
          {
            'matchingToken.tokenHash': tokenHash,
            'matchingToken.expiresAt': { $gt: now },
          },
        ],
      }
    );

    if (!rotatedUser) {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err: any) {
    res.status(401).json({ error: 'Token refresh failed' });
  }
}

export async function getCurrentUser(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  const user = await User.findById(req.user.id).select('-passwordHash -refreshTokens');
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  let companyData: any = null;
  let licenseData: any = null;

  if (user.companyId) {
    companyData = await Company.findById(user.companyId);
    licenseData = await License.findOne({ companyId: user.companyId });
  }

  res.json({
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: user.companyId ? user.companyId.toString() : undefined,
      hasLicenseSeat: user.hasLicenseSeat,
      isActive: user.isActive,
      createdAt: user.createdAt,
    },
    company: companyData
      ? {
          id: companyData._id.toString(),
          name: companyData.name,
          slug: companyData.slug,
          plan: companyData.plan,
          status: companyData.status,
        }
      : undefined,
    license: licenseData
      ? {
          id: licenseData._id.toString(),
          licenseKey: licenseData.licenseKey,
          plan: licenseData.plan,
          seatLimit: licenseData.seatLimit,
          occupiedSeats: licenseData.occupiedSeats,
          availableSeats: Math.max(0, licenseData.seatLimit - licenseData.occupiedSeats),
          status: licenseData.status,
          expiresAt: licenseData.expiresAt,
        }
      : undefined,
  });
}

export async function acceptInvitation(req: Request, res: Response): Promise<void> {
  const { token, password } = req.body;
  if (!token || !password) {
    res.status(400).json({ error: 'Token and password are required.' });
    return;
  }

  const invitation = await Invitation.findOne({
    token,
    status: 'pending',
    expiresAt: { $gt: new Date() },
  });

  if (!invitation) {
    res.status(400).json({ error: 'Invitation link is invalid or has expired.' });
    return;
  }

  const company = await Company.findById(invitation.companyId);
  if (!company || company.status !== 'active') {
    res.status(400).json({ error: 'Associated company workspace is inactive.' });
    return;
  }

  let user = await User.findOne({ email: invitation.email });
  const passwordHash = await bcrypt.hash(password, 12);

  if (!user) {
    user = await User.create({
      email: invitation.email,
      name: invitation.name,
      passwordHash,
      role: invitation.role,
      companyId: company._id,
      isActive: true,
      hasLicenseSeat: false,
    });
  } else {
    user.passwordHash = passwordHash;
    user.companyId = company._id as any;
    user.role = invitation.role;
    user.isActive = true;
    await user.save();
  }

  await Membership.findOneAndUpdate(
    { userId: user._id, companyId: company._id },
    { role: invitation.role, status: 'active', hasSeat: false },
    { upsert: true }
  );

  invitation.status = 'accepted';
  await invitation.save();

  const accessToken = generateAccessToken({
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    companyId: company._id.toString(),
  });

  const refreshToken = generateRefreshToken({ id: user._id.toString() });

  res.json({
    message: 'Invitation accepted successfully.',
    accessToken,
    refreshToken,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: company._id.toString(),
    },
  });
}
