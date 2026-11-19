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
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: this.schedule.timezone || 'Asia/Kolkata',
        weekday: 'short',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
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

      const dayNumber = weekdayMap[weekdayStr] || 1;

      // Check if current day is an excluded day
      if (!this.schedule.workDays.includes(dayNumber)) {
        return {
          active: false,
          reason: `Personal device: Excluded day (${weekdayStr}). Monitoring paused for employee privacy.`,
          authoritativeTime: authIso,
          ownership: this.ownership,
        };
      }

      // Check working hours
      const currentMinutes = parseInt(hourStr, 10) * 60 + parseInt(minuteStr, 10);
      const [startH, startM] = this.schedule.startTime.split(':').map(Number);
      const [endH, endM] = this.schedule.endTime.split(':').map(Number);

      const startMinutes = (startH || 9) * 60 + (startM || 0);
      const endMinutes = (endH || 18) * 60 + (endM || 0);

      if (currentMinutes < startMinutes || currentMinutes >= endMinutes) {
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
        active: true,
        reason: 'Schedule evaluation fallback to active',
        authoritativeTime: authIso,
        ownership: this.ownership,
      };
    }
  }
}
