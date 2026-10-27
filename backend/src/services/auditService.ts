import { Request } from 'express';
import { AuditLog } from '../models/AuditLog';
import { UserRole } from '@krypton/shared';
import mongoose from 'mongoose';

export interface AuditLogParams {
  companyId?: mongoose.Types.ObjectId | string;
  actorId: mongoose.Types.ObjectId | string;
  actorEmail: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, any>;
  req?: Request;
}

export async function createAuditLog(params: AuditLogParams) {
  try {
    let ipAddress: string | undefined;
    let userAgent: string | undefined;

    if (params.req) {
      ipAddress =
        (params.req.headers['x-forwarded-for'] as string) ||
        params.req.socket.remoteAddress ||
        undefined;
      userAgent = params.req.headers['user-agent'];
    }

    await AuditLog.create({
      companyId: params.companyId ? new mongoose.Types.ObjectId(params.companyId) : undefined,
      actorId: new mongoose.Types.ObjectId(params.actorId),
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      details: params.details,
      ipAddress,
      userAgent,
      timestamp: new Date(),
    });
  } catch (error: any) {
    console.error(`[AuditService] Failed to create audit log: ${error.message}`);
  }
}
