/**
 * Coverage for enableProactiveRefresh: false.
 *
 * The proactive refresh scheduler re-arms itself ~5min before every access
 * token's expiry, forever, independent of any real request - which keeps a
 * tab silently authenticated even if nobody does anything in it. For an app
 * where every authenticated call already goes through
 * createAuthFetch/useAuthFetch's reactive refresh-on-401 retry, that's not
 * just redundant: on the backend, a server-side inactivity timeout
 * (AUTHSVC_SESSION_INACTIVITY_TIMEOUT in flask-headless-auth) is measured
 * from the last real /token/refresh call - and the proactive loop makes
 * every refresh look like real activity, defeating the timeout for any tab
 * left open and awake. Confirmed against real production data: sessions
 * stayed "active" past their configured 8-hour cutoff for well over 24
 * hours, purely from this loop, with zero real usage.
 *
 * Defaults to true (the historical, pre-existing behavior) so this is
 * opt-out, not opt-in - any other consumer of this package that doesn't
 * explicitly disable it keeps working exactly as before.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthClient } from '../AuthClient';
import { TokenStorage, LocalStorageAdapter } from '../TokenStorage';

function base64url(json: unknown): string {
  return Buffer.from(JSON.stringify(json)).toString('base64url');
}

function makeJwt(payload: Record<string, unknown>): string {
  return `${base64url({ alg: 'none' })}.${base64url(payload)}.sig`;
}

describe('AuthClient enableProactiveRefresh toggle', () => {
  let localStorageData: Map<string, string>;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorageData = new Map<string, string>();
    (globalThis as any).window = new EventTarget();
    (globalThis as any).window.localStorage = {
      getItem: (key: string) => (localStorageData.has(key) ? localStorageData.get(key)! : null),
      setItem: (key: string, value: string) => { localStorageData.set(key, String(value)); },
      removeItem: (key: string) => { localStorageData.delete(key); },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeClient(enableProactiveRefresh?: boolean) {
    const storage = new TokenStorage('cookie-first', new LocalStorageAdapter());
    return new AuthClient(
      { apiBaseUrl: 'https://api.example.com', enableProactiveRefresh },
      storage,
    );
  }

  it('defaults to proactive refresh enabled (backward compatible)', async () => {
    const iat = Math.floor(Date.now() / 1000);
    const token = makeJwt({ iat, exp: iat + 900 });

    let refreshCalls = 0;
    (globalThis as any).fetch = vi.fn(async () => {
      refreshCalls++;
      return { ok: true, json: async () => ({ access_token: token, refresh_token: 'r.r.r' }) } as Response;
    });

    const client = makeClient(undefined);
    client.initializeRefreshSchedule(token);

    await vi.advanceTimersByTimeAsync(600_000);
    expect(refreshCalls).toBe(1);
  });

  it('schedules no proactive refresh at all when disabled', async () => {
    const iat = Math.floor(Date.now() / 1000);
    const token = makeJwt({ iat, exp: iat + 900 });

    let refreshCalls = 0;
    (globalThis as any).fetch = vi.fn(async () => {
      refreshCalls++;
      return { ok: true, json: async () => ({ access_token: token, refresh_token: 'r.r.r' }) } as Response;
    });

    const client = makeClient(false);
    client.initializeRefreshSchedule(token);

    // Advance well past the point a proactive refresh would otherwise fire
    // (and past the token's own expiry) - nothing should ever call fetch.
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(refreshCalls).toBe(0);
  });

  it('reactive refreshToken() still works normally when proactive refresh is disabled', async () => {
    const iat = Math.floor(Date.now() / 1000);
    const token = makeJwt({ iat, exp: iat + 900 });

    let refreshCalls = 0;
    (globalThis as any).fetch = vi.fn(async () => {
      refreshCalls++;
      return { ok: true, json: async () => ({ access_token: token, refresh_token: 'r.r.r' }) } as Response;
    });

    const client = makeClient(false);
    client.initializeRefreshSchedule(token);

    // No proactive call yet.
    await vi.advanceTimersByTimeAsync(600_000);
    expect(refreshCalls).toBe(0);

    // A real caller (e.g. createAuthFetch reacting to a 401) still works -
    // disabling the proactive loop must not disable refresh entirely.
    const result = await client.refreshToken();
    expect(result).toBe(true);
    expect(refreshCalls).toBe(1);

    // _performRefresh's own success path re-arms scheduleTokenRefresh for
    // the next cycle (AuthClient.ts, both storage-mode branches) - that
    // re-arm must ALSO respect the flag, or every reactive refresh would
    // quietly restart the exact proactive loop this flag exists to stop.
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(refreshCalls).toBe(1);
  });

  it('a disabled client never leaves a previously-armed timer running', async () => {
    // There's no public API to toggle enableProactiveRefresh after
    // construction (config is private, no setter, getConfig() returns a
    // copy) - the real-world equivalent is AuthProvider building a fresh
    // AuthClient when its config prop changes, with the old client's timer
    // cleared by the provider's own unmount cleanup. This test instead
    // pins the clear-before-return ordering directly inside
    // scheduleTokenRefresh itself: if the early-return guard were ever
    // moved above the clearTimeout call, a timer armed before the guard
    // existed would keep firing even on an otherwise-disabled client.
    const iat = Math.floor(Date.now() / 1000);
    const token = makeJwt({ iat, exp: iat + 900 });

    let refreshCalls = 0;
    (globalThis as any).fetch = vi.fn(async () => {
      refreshCalls++;
      return { ok: true, json: async () => ({ access_token: token, refresh_token: 'r.r.r' }) } as Response;
    });

    const client = makeClient(true);
    client.initializeRefreshSchedule(token);

    (client as any).config.enableProactiveRefresh = false;
    client.initializeRefreshSchedule(token);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(refreshCalls).toBe(0);
  });
});
