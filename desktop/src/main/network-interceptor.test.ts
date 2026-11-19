import { LocalNetworkInterceptor } from './network-interceptor';
import { PromptSecurityEngine } from '../engine/scanner';

jest.mock('electron', () => ({
  Notification: class {
    static isSupported() {
      return true;
    }
    show = jest.fn();
  },
}));

describe('LocalNetworkInterceptor', () => {
  let interceptor: LocalNetworkInterceptor;
  let engine: PromptSecurityEngine;

  beforeEach(() => {
    engine = new PromptSecurityEngine();
    interceptor = new LocalNetworkInterceptor(engine, undefined, 18787);
  });

  afterEach(async () => {
    await interceptor.stop();
  });

  it('initializes with clean stats', () => {
    const stats = interceptor.getStats();
    expect(stats.requestsInspected).toBe(0);
    expect(stats.threatsBlocked).toBe(0);
    expect(stats.allowedRequests).toBe(0);
  });

  it('allows non-AI traffic without inspection', () => {
    const { blocked, result } = interceptor.inspectPayload(
      'https://api.github.com/user',
      'GET',
      '',
    );
    expect(blocked).toBe(false);
    expect(result.action).toBe('allow');
    expect(interceptor.getStats().allowedRequests).toBe(1);
  });

  it('allows safe AI prompt requests', () => {
    const safePayload = JSON.stringify({
      messages: [{ role: 'user', content: 'What is photosynthesis?' }],
    });

    const { blocked, result } = interceptor.inspectPayload(
      'https://chatgpt.com/backend-api/conversation',
      'POST',
      safePayload,
    );

    expect(blocked).toBe(false);
    expect(result.action).toBe('allow');
    expect(interceptor.getStats().allowedRequests).toBe(1);
    expect(interceptor.getStats().threatsBlocked).toBe(0);
  });

  it('blocks sensitive AI prompt requests containing secrets or .env variables', () => {
    const leakPayload = JSON.stringify({
      messages: [{ role: 'user', content: 'DATABASE_URL=postgres://admin:prodpass123456@db.corp.net:5432/app' }],
    });

    const { blocked, result } = interceptor.inspectPayload(
      'https://chatgpt.com/backend-api/conversation',
      'POST',
      leakPayload,
    );

    expect(blocked).toBe(true);
    expect(result.action).toBe('block');
    expect(interceptor.getStats().threatsBlocked).toBe(1);
  });

  it('can start and stop server on dynamic port', async () => {
    const startRes = await interceptor.start();
    expect(startRes.success).toBe(true);
    expect(interceptor.getStats().proxyActive).toBe(true);

    await interceptor.stop();
    expect(interceptor.getStats().proxyActive).toBe(false);
  });
});
