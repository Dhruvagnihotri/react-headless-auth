/**
 * Regression coverage for a real production incident: scheduleTokenRefresh
 * used to compute its delay as `serverExpiry - clientDateNow()`, trusting
 * the client's clock against a server-issued `exp` claim. A device with a
 * skewed clock (even a few minutes fast) saw that delay as already
 * negative on every single refresh - the server always issues a
 * correctly-dated token, so the skew never self-corrects - and
 * `Math.max(0, ...)` alone let the reschedule fire again immediately,
 * forever. One production account with a skewed clock generated ~880K
 * token.refresh calls over several days (up to ~4.4/sec sustained for a
 * full day) before self-resolving.
 *
 * The real fix is scheduling from the token's own exp/iat claim interval
 * instead: both are server-issued timestamps, so their difference is a
 * pure duration with no client clock in it at all - immune to skew, not
 * just bounded by it. MIN_PROACTIVE_REFRESH_DELAY_MS remains as a floor
 * for the branch that still compares against the client clock (no `iat`
 * claim available) and as a backstop for short-lived tokens.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthClient } from '../AuthClient';
import { TokenStorage, LocalStorageAdapter } from '../TokenStorage';

/** Real base64url (RFC 7519) encoding, deliberately NOT plain base64 -
 * this is what actual flask-jwt-extended tokens use, and what decodeJWT
 * must handle correctly (its bug: it fed base64url straight to atob(),
 * which only accepts standard base64 and throws on '-'/'_'). */
function base64url(json: unknown): string {
  return Buffer.from(JSON.stringify(json)).toString('base64url');
}

function makeJwt(payload: Record<string, unknown>): string {
  return `${base64url({ alg: 'none' })}.${base64url(payload)}.sig`;
}

describe('AuthClient proactive refresh scheduling', () => {
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

  function makeClient() {
    const storage = new TokenStorage('cookie-first', new LocalStorageAdapter());
    return new AuthClient({ apiBaseUrl: 'https://api.example.com' }, storage);
  }

  it('decodes a real base64url-encoded JWT (not just plain base64)', async () => {
    // A payload big/varied enough that its base64url form is virtually
    // guaranteed to contain at least one '-' or '_' - if decodeJWT still
    // fed this straight to atob() without the base64url->base64 fix,
    // this would throw internally and decodeJWT would return null.
    const iat = Math.floor(Date.now() / 1000);
    const token = makeJwt({
      exp: iat + 900,
      iat,
      email: 'someone.testing-clock-skew@example.com',
      role: 'admin',
      // Deliberately chosen (and verified) so this exact payload's
      // base64url encoding contains at least one '-'/'_' - without that,
      // this test could pass for the wrong reason (a payload that
      // happens to encode identically in base64 and base64url, so it
      // would "pass" even against the pre-fix atob()-only decode).
      marker: '~?>',
      permissions: ['transcriptions.create', 'transcriptions.view', 'patients.manage'],
    });
    const encodedPayload = token.split('.')[1];
    expect(encodedPayload).toMatch(/[-_]/);

    let refreshCalls = 0;
    (globalThis as any).fetch = vi.fn(async () => {
      refreshCalls++;
      return { ok: true, json: async () => ({ access_token: token, refresh_token: 'r.r.r' }) } as Response;
    });

    const client = makeClient();
    client.initializeRefreshSchedule(token);

    // A real 900s/15-min token schedules 5 min before expiry (600s), not
    // the 50-minute "couldn't decode this token at all" fallback - proves
    // decodeJWT actually parsed exp out of a real base64url payload.
    await vi.advanceTimersByTimeAsync(599_000);
    expect(refreshCalls).toBe(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(refreshCalls).toBe(1);
  });

  it('schedules from the exp/iat claim interval, immune to client clock skew', async () => {
    const iat = Math.floor(Date.now() / 1000);
    const token = makeJwt({ iat, exp: iat + 900 }); // real 15-minute token

    let refreshCalls = 0;
    (globalThis as any).fetch = vi.fn(async () => {
      refreshCalls++;
      return { ok: true, json: async () => ({ access_token: token, refresh_token: 'r.r.r' }) } as Response;
    });

    const client = makeClient();
    client.initializeRefreshSchedule(token);

    // Simulate a client clock that's 20 minutes fast, mid-wait. The
    // exp/iat-derived delay doesn't reference Date.now() at all, so this
    // must have no effect on when the timer fires.
    vi.setSystemTime(Date.now() + 20 * 60 * 1000);

    // 900s lifetime - 300s lead = 600s. Not before, and not the 60s floor
    // either (proves this isn't just falling back to the floor).
    await vi.advanceTimersByTimeAsync(599_000);
    expect(refreshCalls).toBe(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(refreshCalls).toBe(1);
  });

  it('does not burst on the next cycle - the loop is eliminated, not just slowed', async () => {
    const iat = Math.floor(Date.now() / 1000);
    const token = makeJwt({ iat, exp: iat + 900 });

    let refreshCalls = 0;
    (globalThis as any).fetch = vi.fn(async () => {
      refreshCalls++;
      // Each refresh returns a fresh token with its own fresh iat/exp,
      // exactly like the real backend does.
      const newIat = Math.floor(Date.now() / 1000);
      const newToken = makeJwt({ iat: newIat, exp: newIat + 900 });
      return { ok: true, json: async () => ({ access_token: newToken, refresh_token: 'r.r.r' }) } as Response;
    });

    const client = makeClient();
    client.initializeRefreshSchedule(token);

    await vi.advanceTimersByTimeAsync(600_000);
    expect(refreshCalls).toBe(1);

    // If this were still comparing an absolute exp against a still-honest
    // Date.now(), the second cycle would also land ~600s later. The old
    // bug's signature was the SECOND (and every subsequent) cycle firing
    // near-instantly instead.
    await vi.advanceTimersByTimeAsync(599_000);
    expect(refreshCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(refreshCalls).toBe(2);
  });

  it('floors the delay for a token too short-lived for the 5-minute lead, even with iat present', async () => {
    // A 2-minute token: lifetime (120s) - lead (300s) is negative, so the
    // claim-interval branch itself needs the floor here too, independent
    // of any clock skew at all.
    const iat = Math.floor(Date.now() / 1000);
    const token = makeJwt({ iat, exp: iat + 120 });

    let refreshCalls = 0;
    (globalThis as any).fetch = vi.fn(async () => {
      refreshCalls++;
      return { ok: true, json: async () => ({ access_token: token, refresh_token: 'r.r.r' }) } as Response;
    });

    const client = makeClient();
    client.initializeRefreshSchedule(token);

    await vi.advanceTimersByTimeAsync(59_000);
    expect(refreshCalls).toBe(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(refreshCalls).toBe(1);
  });

  it('falls back to comparing exp against the client clock (and the floor still bounds skew) when iat is absent', async () => {
    // exp computed against the real (unskewed) clock, representing what
    // the server actually issued.
    const token = makeJwt({ exp: Math.floor(Date.now() / 1000) + 900 }); // no iat

    let refreshCalls = 0;
    (globalThis as any).fetch = vi.fn(async () => {
      refreshCalls++;
      return { ok: true, json: async () => ({ access_token: token, refresh_token: 'r.r.r' }) } as Response;
    });

    // Now simulate the client's clock reading 20 minutes fast at the
    // moment it schedules - this must happen BEFORE scheduling, since
    // scheduleTokenRefresh reads Date.now() once, synchronously, right
    // when it computes the delay (moving the system clock afterward
    // can't retroactively change an already-armed timer's countdown).
    vi.setSystemTime(Date.now() + 20 * 60 * 1000);

    const client = makeClient();
    client.initializeRefreshSchedule(token);

    // Without iat, this branch has no skew-immune option and has to
    // fall back to the floor.
    await vi.advanceTimersByTimeAsync(59_000);
    expect(refreshCalls).toBe(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(refreshCalls).toBe(1);
  });
});
