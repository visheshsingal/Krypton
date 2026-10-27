import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { User, IUser } from '@/models/User';
import { Company } from '@/models/Company';
import { connectDB } from './db';

function getSigningSecret(name: 'JWT_SECRET' | 'REFRESH_TOKEN_SECRET', developmentFallback: string): string {
  const secret = process.env[name];
  if (secret) {
    if (process.env.NODE_ENV === 'production' && secret.length < 32) {
      throw new Error(`${name} must be at least 32 characters in production.`);
    }
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} must be configured in production.`);
  }

  return developmentFallback;
}

export interface AuthenticatedUserPayload {
  id: string;
  email: string;
  role: 'super_admin' | 'company_admin' | 'employee';
  companyId?: string;
  name: string;
}

export function signAccessToken(payload: { id: string; email: string; role: string; companyId?: string }): string {
  return jwt.sign(
    {
      sub: payload.id,
      email: payload.email,
      role: payload.role,
      companyId: payload.companyId,
    },
    getSigningSecret('JWT_SECRET', 'krypton_local_development_jwt_secret'),
    { expiresIn: '15m' }
  );
}

export function signRefreshToken(payload: { id: string }): string {
  return jwt.sign(
    { sub: payload.id },
    getSigningSecret('REFRESH_TOKEN_SECRET', 'krypton_local_development_refresh_secret'),
    { expiresIn: '7d' }
  );
}

export async function authenticateRequest(req: NextRequest): Promise<{ user?: AuthenticatedUserPayload; error?: string; status?: number }> {
  await connectDB();

  const authHeader = req.headers.get('authorization');
  let token: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    // Also check cookies
    token = req.cookies.get('krypton_token')?.value || null;
  }

  if (!token) {
    return { error: 'Authentication token missing', status: 401 };
  }

  try {
    const decoded = jwt.verify(
      token,
      getSigningSecret('JWT_SECRET', 'krypton_local_development_jwt_secret')
    ) as {
      sub: string;
      email: string;
      role: 'super_admin' | 'company_admin' | 'employee';
      companyId?: string;
    };

    const user = await User.findById(decoded.sub);
    if (!user || !user.isActive) {
      return { error: 'User account is deactivated or invalid', status: 401 };
    }
    if (user.role !== 'super_admin' && user.companyId) {
      const company = await Company.findById(user.companyId).select('status');
      if (!company || company.status !== 'active') {
        return { error: 'Company workspace is inactive', status: 403 };
      }
    }

    return {
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        companyId: user.companyId ? user.companyId.toString() : undefined,
        name: user.name,
      },
    };
  } catch (err) {
    return { error: 'Invalid or expired authentication token', status: 401 };
  }
}

/**
 * Enforces multi-tenant isolation.
 * Super admins may target any company; company admins are locked to their tenant.
 * Employees are not authorized to use company-management APIs.
 */
export function enforceTenant(user: AuthenticatedUserPayload, explicitCompanyId?: string | null): { companyId?: string; error?: string; status?: number } {
  if (user.role === 'super_admin') {
    return { companyId: explicitCompanyId || undefined };
  }

  if (user.role !== 'company_admin') {
    return { error: 'Company administrator access required', status: 403 };
  }

  if (!user.companyId) {
    return { error: 'User does not belong to any company workspace', status: 403 };
  }

  if (explicitCompanyId && explicitCompanyId !== user.companyId) {
    return { error: 'Cross-tenant access denied: You cannot view or modify data for another company', status: 403 };
  }

  return { companyId: user.companyId };
}
