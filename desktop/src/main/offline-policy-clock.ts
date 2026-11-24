export type OfflinePolicyClockState = {
  serverTimeMs: number;
  monotonicMs: number;
  maxObservedWallMs: number;
};

export type OfflineGraceStatus = 'valid' | 'expired';

const CLOCK_ROLLBACK_TOLERANCE_MS = 2 * 60 * 1000;

export function recordPolicyValidation(
  serverIsoTime: string,
  monotonicMs: number,
  wallMs = Date.now(),
): OfflinePolicyClockState | null {
  const serverTimeMs = Date.parse(serverIsoTime);
  if (!Number.isFinite(serverTimeMs) || !Number.isFinite(monotonicMs) || monotonicMs < 0) {
    return null;
  }
  return {
    serverTimeMs,
    monotonicMs,
    maxObservedWallMs: Math.max(wallMs, serverTimeMs),
  };
}

export function observeWallClock(
  state: OfflinePolicyClockState | null,
  wallMs = Date.now(),
): OfflinePolicyClockState | null {
  if (!state) return null;
  return {
    ...state,
    maxObservedWallMs: Math.max(state.maxObservedWallMs, wallMs),
  };
}

export function evaluateOfflineGrace(
  state: OfflinePolicyClockState | null,
  graceHours: number,
  options: {
    wallMs?: number;
    monotonicMs?: number;
    sameProcess?: boolean;
  } = {},
): OfflineGraceStatus {
  if (!state || !Number.isFinite(graceHours) || graceHours <= 0) return 'expired';

  const wallMs = options.wallMs ?? Date.now();
  const monotonicMs = options.monotonicMs ?? 0;
  const sameProcess = options.sameProcess === true;
  const graceMs = graceHours * 60 * 60 * 1000;

  if (wallMs + CLOCK_ROLLBACK_TOLERANCE_MS < state.maxObservedWallMs) {
    if (!sameProcess) return 'expired';
  }

  const monotonicElapsed = sameProcess ? Math.max(0, monotonicMs - state.monotonicMs) : 0;
  const wallElapsed = wallMs - state.serverTimeMs;
  if (!sameProcess && wallElapsed < 0) return 'expired';

  const elapsed = sameProcess ? Math.max(monotonicElapsed, Math.max(0, wallElapsed)) : Math.max(0, wallElapsed);
  return elapsed <= graceMs ? 'valid' : 'expired';
}

export function getOfflineProtectionState(
  lastSuccessfulValidation: string | undefined,
  graceHours: number,
  now = Date.now(),
  clock?: OfflinePolicyClockState | null,
  monotonicMs?: number,
  sameProcess = false,
): OfflineGraceStatus {
  if (clock) {
    return evaluateOfflineGrace(clock, graceHours, { wallMs: now, monotonicMs, sameProcess });
  }
  if (!lastSuccessfulValidation) return 'expired';
  const validatedAt = Date.parse(lastSuccessfulValidation);
  if (!Number.isFinite(validatedAt) || validatedAt > now) return 'expired';
  return now - validatedAt <= graceHours * 60 * 60 * 1000 ? 'valid' : 'expired';
}
