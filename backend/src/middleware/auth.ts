import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { UserRole } from '@krypton/shared';
import mongoose from 'mongoose';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  companyId?: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export async function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Authentication token is required' });
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as {
      sub: string;
      email: string;
      role: UserRole;
      companyId?: string;
    };

    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) {
      res.status(401).json({ error: 'User account is deactivated or not found' });
      return;
    }
    if (user.role !== 'super_admin' && user.companyId) {
      const company = await Company.findById(user.companyId).select('status');
      if (!company || company.status !== 'active') {
        res.status(403).json({ error: 'Company workspace is inactive' });
        return;
      }
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      companyId: user.companyId ? user.companyId.toString() : undefined,
      name: user.name,
    };

    next();
  } catch (error: any) {
    res.status(401).json({ error: 'Invalid or expired authentication token' });
  }
}

export function generateAccessToken(user: { id: string; email: string; role: UserRole; companyId?: string }): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as any }
  );
}

export function generateRefreshToken(user: { id: string }): string {
  return jwt.sign({ sub: user.id }, config.refreshTokenSecret, {
    expiresIn: config.refreshTokenExpiresIn as any,
  });
}
