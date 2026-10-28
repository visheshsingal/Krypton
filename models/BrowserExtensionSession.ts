import mongoose, { Document, Schema } from 'mongoose';

export type BrowserExtensionStatus = 'pending' | 'active' | 'revoked';

export interface IBrowserExtensionSession extends Document {
  companyId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  desktopDeviceId: string;
  browserInstallationId?: string;
  browser: 'chrome' | 'edge';
  status: BrowserExtensionStatus;
  pairingCodeHash?: string;
  pairingExpiresAt?: Date;
  sessionTokenHash?: string;
  sessionExpiresAt?: Date;
  lastHeartbeatAt?: Date;
  activatedAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BrowserExtensionSessionSchema = new Schema<IBrowserExtensionSession>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    desktopDeviceId: { type: String, required: true, trim: true, index: true },
    browserInstallationId: { type: String, trim: true },
    browser: { type: String, enum: ['chrome', 'edge'], required: true },
    status: { type: String, enum: ['pending', 'active', 'revoked'], required: true, index: true },
    pairingCodeHash: { type: String, select: false },
    pairingExpiresAt: { type: Date },
    sessionTokenHash: { type: String, select: false },
    sessionExpiresAt: { type: Date },
    lastHeartbeatAt: { type: Date },
    activatedAt: { type: Date },
    revokedAt: { type: Date },
  },
  { timestamps: true }
);

BrowserExtensionSessionSchema.index(
  { browserInstallationId: 1 },
  { unique: true, partialFilterExpression: { browserInstallationId: { $type: 'string' } } }
);
BrowserExtensionSessionSchema.index({ pairingExpiresAt: 1 }, { expireAfterSeconds: 86400 });
BrowserExtensionSessionSchema.index({ sessionExpiresAt: 1 });
BrowserExtensionSessionSchema.index({ companyId: 1, userId: 1, createdAt: -1 });

export const BrowserExtensionSession =
  mongoose.models.BrowserExtensionSession ||
  mongoose.model<IBrowserExtensionSession>('BrowserExtensionSession', BrowserExtensionSessionSchema);
