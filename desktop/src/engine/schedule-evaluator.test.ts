import { TamperProofScheduleEvaluator } from './schedule-evaluator';

describe('TamperProofScheduleEvaluator', () => {
  let evaluator: TamperProofScheduleEvaluator;

  beforeEach(() => {
    evaluator = new TamperProofScheduleEvaluator();
  });

  test('Company devices are always active 24/7 regardless of time or day', () => {
    evaluator.updateConfig('company', {
      enabled: true,
      workDays: [1, 2, 3, 4, 5],
      startTime: '09:00',
      endTime: '18:00',
      timezone: 'UTC',
    });

    const status = evaluator.isProtectionActiveNow();
    expect(status.active).toBe(true);
    expect(status.reason).toContain('Company device: 24/7');
  });

  test('Personal devices allow monitoring if schedule is disabled', () => {
    evaluator.updateConfig('personal', {
      enabled: false,
      workDays: [1, 2, 3, 4, 5],
      startTime: '09:00',
      endTime: '18:00',
      timezone: 'UTC',
    });

    const status = evaluator.isProtectionActiveNow();
    expect(status.active).toBe(true);
  });

  test('Personal device evaluates working hours and excludes off-days based on server time', () => {
    // Wednesday 2026-11-18 10:00:00 UTC (Workday inside 09:00 - 18:00)
    const wednesdayWorkingHoursIso = '2026-11-18T10:00:00.000Z';
    evaluator.syncServerTime(wednesdayWorkingHoursIso, 100);

    evaluator.updateConfig('personal', {
      enabled: true,
      workDays: [1, 2, 3, 4, 5], // Mon - Fri
      startTime: '09:00',
      endTime: '18:00',
      timezone: 'UTC',
    });

    // Exactly at sync (uptime = 100)
    const workStatus = evaluator.isProtectionActiveNow(100);
    expect(workStatus.active).toBe(true);
    expect(workStatus.reason).toContain('Within working hours');

    // 10 hours later (uptime = 100 + 36000), time is 20:00:00 UTC (Outside 18:00)
    const offHoursStatus = evaluator.isProtectionActiveNow(100 + 36000);
    expect(offHoursStatus.active).toBe(false);
    expect(offHoursStatus.reason).toContain('Outside working hours');

    // 3 days later (Sunday, Nov 22) -> Excluded day
    const sundayStatus = evaluator.isProtectionActiveNow(100 + 4 * 86400);
    expect(sundayStatus.active).toBe(false);
    expect(sundayStatus.reason).toContain('Excluded day');
  });

  test('Tamper proof: User changing system clock has ZERO effect on authoritative time', () => {
    const originalServerTime = '2026-11-18T10:00:00.000Z';
    evaluator.syncServerTime(originalServerTime, 50);

    // Even if local Date() is mocked or changed, monotonic uptime is used:
    const timeAtUptime60 = evaluator.getAuthoritativeTime(60);
    // Elapsed 10 seconds (60 - 50)
    expect(timeAtUptime60.getTime()).toBe(Date.parse(originalServerTime) + 10000);
  });
});
