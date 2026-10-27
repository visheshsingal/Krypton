import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { AuditLog } from '@/models/AuditLog';

export interface ServerlessAuditParams {
  companyId?: mongoose.Types.ObjectId | string;
  actorId: mongoose.Types.ObjectId | string;
  actorEmail: string;
  actorRole: 'super_admin' | 'company_admin' | 'employee';
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, any>;
  req?: NextRequest;
}

export async function logAuditEvent(params: ServerlessAuditParams) {
  try {
    let ipAddress: string | undefined;
    let userAgent: string | undefined;

    if (params.req) {
      ipAddress =
        params.req.headers.get('x-forwarded-for') ||
        params.req.headers.get('x-real-ip') ||
        undefined;
      userAgent = params.req.headers.get('user-agent') || undefined;
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
  } catch (err: any) {
    console.error(`[Audit] Failed to log audit event: ${err.message}`);
  }
}
