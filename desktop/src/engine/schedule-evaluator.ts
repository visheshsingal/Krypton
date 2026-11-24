import { DeviceOwnership, DeviceScheduleConfig } from '@krypton/shared';

export interface TimeSyncAnchor {
  serverBaseTime: number; // Server epoch ms
  monotonicUptimeAtSync: number; // process.uptime() * 1000 at the moment of sync
}

export class TamperProofScheduleEvaluator {
  private syncAnchor: TimeSyncAnchor | null = null;
  private ownership: DeviceOwnership = 'company';
  private schedule: DeviceScheduleConfig = {
    enabled: false,
    workDays: [1, 2, 3, 4, 5],
    startTime: '09:00',
    endTime: '18:00',
    timezone: 'Asia/Kolkata',
  };

  /**
   * Sync authoritative server time from heartbeat / activation.
   * We record monotonic uptime (which cannot be manipulated by user changing clock).
   */
  public syncServerTime(serverIsoTime: string, uptimeSeconds = process.uptime()): void {
    const serverEpoch = Date.parse(serverIsoTime);
    if (!Number.isNaN(serverEpoch)) {
      this.syncAnchor = {
        serverBaseTime: serverEpoch,
        monotonicUptimeAtSync: Math.floor(uptimeSeconds * 1000),
      };
    }
  }

  public updateConfig(ownership?: DeviceOwnership, schedule?: DeviceScheduleConfig): void {
    if (ownership) this.ownership = ownership;
    if (schedule) this.schedule = { ...this.schedule, ...schedule };
  }

  public getConfig(): { ownership: DeviceOwnership; schedule: DeviceScheduleConfig } {
    return {
      ownership: this.ownership,
      schedule: { ...this.schedule },
    };
  }

  /**
   * Get the current authoritative time.
   * If synchronized, uses: serverBaseTime + (currentMonotonicUptime - monotonicUptimeAtSync)
   * This is IMMUNE to user altering system time in Windows Settings or Android Settings!
   */
  public getAuthoritativeTime(uptimeSeconds = process.uptime()): Date {
    if (!this.syncAnchor) {
      return new Date(); // fallback before first sync
    }
    const currentMonotonic = Math.floor(uptimeSeconds * 1000);
    const elapsedSinceSync = Math.max(0, currentMonotonic - this.syncAnchor.monotonicUptimeAtSync);
    return new Date(this.syncAnchor.serverBaseTime + elapsedSinceSync);
  }

  /**
   * Evaluates if protection should be ACTIVE right now.
   * - If Company device: Always TRUE (24/7 round-the-clock monitoring).
   * - If Personal device:
   *     - If schedule disabled: TRUE.
   *     - If schedule enabled: Only TRUE during allowed working days & hours.
   */
  public isProtectionActiveNow(uptimeSeconds = process.uptime()): {
    active: boolean;
    reason: string;
    authoritativeTime: string;
    ownership: DeviceOwnership;
  } {
    const authDate = this.getAuthoritativeTime(uptimeSeconds);
    const authIso = authDate.toISOString();

    if (this.ownership === 'company') {
      return {
        active: true,
        reason: 'Company device: 24/7 continuous protection active',
        authoritativeTime: authIso,
        ownership: this.ownership,
      };
    }

    if (!this.schedule.enabled) {
      return {
        active: true,
        reason: 'Personal device: Schedule is currently disabled (monitoring active)',
        authoritativeTime: authIso,
        ownership: this.ownership,
      };
    }

    // Evaluate day of week in target timezone
    try {
      const timezone = this.schedule.timezone || 'Asia/Kolkata';
      Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(authDate);
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short',
        hour: 'numeric',
        minute: 'numeric',
        hourCycle: 'h23',
      });

      const parts = formatter.formatToParts(authDate);
      const weekdayStr = parts.find((p) => p.type === 'weekday')?.value || '';
      const hourStr = parts.find((p) => p.type === 'hour')?.value || '0';
      const minuteStr = parts.find((p) => p.type === 'minute')?.value || '0';

      const weekdayMap: Record<string, number> = {
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
        Sun: 7,
      };

      const dayNumber = weekdayMap[weekdayStr];
      if (!dayNumber) throw new Error('The schedule weekday could not be determined.');

      // Check working hours
      const currentMinutes = parseInt(hourStr, 10) * 60 + parseInt(minuteStr, 10);
      const parseTime = (value: string): number => {
        const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
        if (!match) throw new Error('The schedule contains an invalid time.');
        return Number(match[1]) * 60 + Number(match[2]);
      };

      const startMinutes = parseTime(this.schedule.startTime);
      const endMinutes = parseTime(this.schedule.endTime);
      const isOvernight = startMinutes > endMinutes;
      const scheduleDay = isOvernight && currentMinutes < endMinutes
        ? dayNumber === 1 ? 7 : dayNumber - 1
        : dayNumber;
      if (!Array.isArray(this.schedule.workDays) || !this.schedule.workDays.includes(scheduleDay)) {
        return {
          active: false,
          reason: `Personal device: Excluded day (${weekdayStr}). Monitoring paused for employee privacy.`,
          authoritativeTime: authIso,
          ownership: this.ownership,
        };
      }

      const withinHours = startMinutes === endMinutes
        ? false
        : !isOvernight
          ? currentMinutes >= startMinutes && currentMinutes < endMinutes
          : currentMinutes >= startMinutes || currentMinutes < endMinutes;

      if (!withinHours) {
        return {
          active: false,
          reason: `Personal device: Outside working hours (${this.schedule.startTime} - ${this.schedule.endTime}). Monitoring paused for employee privacy.`,
          authoritativeTime: authIso,
          ownership: this.ownership,
        };
      }

      return {
        active: true,
        reason: `Personal device: Within working hours (${this.schedule.startTime} - ${this.schedule.endTime}). Monitoring active.`,
        authoritativeTime: authIso,
        ownership: this.ownership,
      };
    } catch {
      return {
        active: false,
        reason: 'Schedule evaluation failed; protection is not active (fail-closed).',
        authoritativeTime: authIso,
        ownership: this.ownership,
      };
    }
  }
}
