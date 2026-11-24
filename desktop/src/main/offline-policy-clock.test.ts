import {
  evaluateOfflineGrace,
  observeWallClock,
  recordPolicyValidation,
  getOfflineProtectionState,
} from './offline-policy-clock';

describe('offline policy clock', () => {
  const server = '2026-11-23T09:00:00.000Z';
  const serverMs = Date.parse(server);

  test('keeps policy valid within the configured grace window using monotonic elapsed time', () => {
    const state = recordPolicyValidation(server, 1_000, serverMs);
    expect(evaluateOfflineGrace(state, 2, {
      wallMs: serverMs + 30 * 60 * 1000,
      monotonicMs: 1_000 + 30 * 60 * 1000,
      sameProcess: true,
    })).toBe('valid');
  });

  test('expires when monotonic elapsed time exceeds grace hours', () => {
    const state = recordPolicyValidation(server, 1_000, serverMs);
    expect(evaluateOfflineGrace(state, 1, {
      wallMs: serverMs,
      monotonicMs: 1_000 + 2 * 60 * 60 * 1000,
      sameProcess: true,
    })).toBe('expired');
  });

  test('does not let a local clock rollback extend grace after process restart', () => {
    const state = observeWallClock(recordPolicyValidation(server, 5_000, serverMs), serverMs + 10_000);
    expect(evaluateOfflineGrace(state, 72, {
      wallMs: serverMs - 60 * 60 * 1000,
      monotonicMs: 0,
      sameProcess: false,
    })).toBe('expired');
  });

  test('does not treat a persisted clock as monotonic state from the current process', () => {
    const state = recordPolicyValidation(server, 10 * 60 * 60 * 1000, serverMs);
    expect(evaluateOfflineGrace(state, 1, {
      wallMs: serverMs - 60 * 60 * 1000,
      monotonicMs: 30_000,
      sameProcess: false,
    })).toBe('expired');
  });

  test('rejects missing or future wall-clock validation timestamps', () => {
    expect(getOfflineProtectionState(undefined, 72, serverMs)).toBe('expired');
    expect(getOfflineProtectionState('2026-11-24T00:00:00.000Z', 72, serverMs)).toBe('expired');
    expect(getOfflineProtectionState('2026-11-23T08:00:00.000Z', 2, serverMs)).toBe('valid');
  });
});
