import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { connectDB } from '../lib/db';
import { User } from '../models/User';

async function syncSuperAdmin() {
  const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD;
  const name = process.env.SUPERADMIN_NAME?.trim() || 'Krypton Root Administrator';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('SUPERADMIN_EMAIL must be a valid email address.');
  }
  if (!password || password.length < 12) {
    throw new Error('SUPERADMIN_PASSWORD must be at least 12 characters.');
  }

  await connectDB();
  const now = new Date();
  const passwordHash = await bcrypt.hash(password, 12);

  await User.updateOne(
    { email },
    {
      $set: {
        email,
        passwordHash,
        name,
        role: 'super_admin',
        isActive: true,
        hasLicenseSeat: false,
        refreshTokens: [],
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
      $unset: { companyId: '' },
    },
    { upsert: true }
  );

  const user = await User.findOne({ email });
  if (
    !user ||
    user.role !== 'super_admin' ||
    !user.isActive ||
    !(await user.comparePassword(password))
  ) {
    throw new Error('Superadmin credential synchronization could not be verified.');
  }

  console.log(`Superadmin credentials synchronized and verified for ${email}.`);
}

syncSuperAdmin()
  .catch((error) => {
    console.error('Superadmin synchronization failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    const mongoose = await import('mongoose');
    await mongoose.default.disconnect();
  });
