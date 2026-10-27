import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { Company } from '../src/models/Company';
import { License } from '../src/models/License';
import { User } from '../src/models/User';
import { Membership } from '../src/models/Membership';
import { Device } from '../src/models/Device';
import {
  generateLicenseKey,
  activateDesktopDevice,
  releaseSeatForUser,
} from '../src/services/licenseService';

describe('Server-Authoritative Licensing & Concurrency-Safe Seat Allocation', () => {
  let testCompany: any;
  let testLicense: any;
  let testUser1: any;
  let testUser2: any;
  let testUser3: any;
  let testPassword: string;

  beforeAll(async () => {
    await connectDatabase();

    const uniqueId = Date.now();
    testPassword = 'Test-Password-Only-For-Licensing';
    const testPasswordHash = await bcrypt.hash(testPassword, 4);
    testCompany = await Company.create({
      name: `Test Security Corp ${uniqueId}`,
      slug: `test-sec-${uniqueId}`,
      plan: 'business',
      status: 'active',
    });

    const key = generateLicenseKey();
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 1);

    // Create a license strictly capped at 2 seats
    testLicense = await License.create({
      companyId: testCompany._id,
      licenseKey: key,
      plan: 'business',
      seatLimit: 2,
      occupiedSeats: 0,
      status: 'active',
      maxDevicesPerUser: 2,
      offlineGraceHours: 72,
      expiresAt: expiry,
    });

    // Create 3 employees in this company
    testUser1 = await User.create({
      name: 'Employee One',
      email: `emp1_${uniqueId}@testsec.com`,
      passwordHash: testPasswordHash,
      role: 'employee',
      companyId: testCompany._id,
      isActive: true,
      hasLicenseSeat: false,
    });
    await Membership.create({
      userId: testUser1._id,
      companyId: testCompany._id,
      role: 'employee',
      status: 'active',
    });

    testUser2 = await User.create({
      name: 'Employee Two',
      email: `emp2_${uniqueId}@testsec.com`,
      passwordHash: testPasswordHash,
      role: 'employee',
      companyId: testCompany._id,
      isActive: true,
      hasLicenseSeat: false,
    });
    await Membership.create({
      userId: testUser2._id,
      companyId: testCompany._id,
      role: 'employee',
      status: 'active',
    });

    testUser3 = await User.create({
      name: 'Employee Three',
      email: `emp3_${uniqueId}@testsec.com`,
      passwordHash: testPasswordHash,
      role: 'employee',
      companyId: testCompany._id,
      isActive: true,
      hasLicenseSeat: false,
    });
    await Membership.create({
      userId: testUser3._id,
      companyId: testCompany._id,
      role: 'employee',
      status: 'active',
    });
  });

  afterAll(async () => {
    if (testCompany) {
      await Company.deleteOne({ _id: testCompany._id });
      await License.deleteMany({ companyId: testCompany._id });
      await User.deleteMany({ companyId: testCompany._id });
      await Membership.deleteMany({ companyId: testCompany._id });
      await Device.deleteMany({ companyId: testCompany._id });
    }
    await disconnectDatabase();
  });

  test('1. First employee activates successfully and consumes 1 seat', async () => {
    const res = await activateDesktopDevice({
      licenseKey: testLicense.licenseKey,
      email: testUser1.email,
      password: testPassword,
      deviceId: 'TEST-DEV-001',
      deviceName: 'Employee1-Laptop',
    });

    expect(res.success).toBe(true);
    expect(res.user?.hasLicenseSeat).toBe(true);

    const refreshedLicense = await License.findById(testLicense._id);
    expect(refreshedLicense?.occupiedSeats).toBe(1);
  });

  test('2. Re-activation or second device for same employee does NOT consume an extra seat', async () => {
    const res = await activateDesktopDevice({
      licenseKey: testLicense.licenseKey,
      email: testUser1.email,
      password: testPassword,
      deviceId: 'TEST-DEV-001-B',
      deviceName: 'Employee1-Desktop',
    });

    expect(res.success).toBe(true);

    const refreshedLicense = await License.findById(testLicense._id);
    expect(refreshedLicense?.occupiedSeats).toBe(1); // Still 1!
  });

  test('3. Second employee activates and consumes the last remaining seat', async () => {
    const res = await activateDesktopDevice({
      licenseKey: testLicense.licenseKey,
      email: testUser2.email,
      password: testPassword,
      deviceId: 'TEST-DEV-002',
      deviceName: 'Employee2-Laptop',
    });

    expect(res.success).toBe(true);

    const refreshedLicense = await License.findById(testLicense._id);
    expect(refreshedLicense?.occupiedSeats).toBe(2);
  });

  test('4. Third employee activation is REJECTED because seat limit (2) is exhausted', async () => {
    const res = await activateDesktopDevice({
      licenseKey: testLicense.licenseKey,
      email: testUser3.email,
      password: testPassword,
      deviceId: 'TEST-DEV-003',
      deviceName: 'Employee3-Laptop',
    });

    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(409);
    expect(res.error).toMatch(/All 2 purchased seats are currently occupied/i);

    const refreshedLicense = await License.findById(testLicense._id);
    expect(refreshedLicense?.occupiedSeats).toBe(2);
  });

  test('5. Releasing seat for Employee 1 allows Employee 3 to claim the released seat', async () => {
    const released = await releaseSeatForUser(testCompany._id, testUser1._id, {
      id: testUser1._id.toString(),
      email: testUser1.email,
      role: 'company_admin',
    });
    expect(released).toBe(true);

    let refreshedLicense = await License.findById(testLicense._id);
    expect(refreshedLicense?.occupiedSeats).toBe(1);

    // Now Employee 3 should be able to activate
    const res3 = await activateDesktopDevice({
      licenseKey: testLicense.licenseKey,
      email: testUser3.email,
      password: testPassword,
      deviceId: 'TEST-DEV-003',
      deviceName: 'Employee3-Laptop',
    });

    expect(res3.success).toBe(true);

    refreshedLicense = await License.findById(testLicense._id);
    expect(refreshedLicense?.occupiedSeats).toBe(2);
  });
});
