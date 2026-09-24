/**
 * Regression test for the cross-tab refresh race fixed in AuthClient.
 *
 * Two browser tabs are, from Node's perspective, just two separate
 * instances of this framework-agnostic class - so two tabs are simulated
 * literally, by constructing two AuthClient instances that share one
 * `window` (with a real Storage-backed localStorage and a real
 * EventTarget for `storage` events), exactly like two tabs on the same
 * origin actually share one localStorage. No reimplementation of the fix
 * under test - this exercises the real acquireRefreshLock /
 * releaseRefreshLock / waitForOtherTabRefresh code paths via the public
 * refreshToken() API.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthClient } from '../AuthClient';
import { TokenStorage, LocalStorageAdapter } from '../TokenStorage';

/** Minimal but real localStorage: a Storage-shaped object backed by a Map,
 * shared across both simulated tabs (real browsers share one origin-keyed
 * localStorage across all tabs). */
function createSharedLocalStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => { data.set(key, String(value)); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => { data.clear(); },
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() { return data.size; },
  } as Storage;
}

describe('AuthClient cross-tab refresh coordination', () => {
  let sharedLocalStorage: Storage;
  let tabAWindow: EventTarget & { localStorage: Storage };
  let tabBWindow: EventTarget & { localStorage: Storage };

  beforeEach(() => {
    sharedLocalStorage = createSharedLocalStorage();

    // Two separate `window` objects (two tabs), sharing one localStorage
    // instance (the real browser invariant this fix depends on), but each
    // with its OWN EventTarget so a `storage` event dispatched by "tab A"
    // doesn't just call tab A's own listeners - it has to be manually
    // relayed to tab B below, mirroring how the browser delivers `storage`
    // events only to the OTHER tabs, never the one that made the change.
    tabAWindow = Object.assign(new EventTarget(), { localStorage: sharedLocalStorage });
    tabBWindow = Object.assign(new EventTarget(), { localStorage: sharedLocalStorage });

    // Patch setItem/removeItem to fan a synthetic `storage` event out to
    // every OTHER tab's window - this is the one piece of real browser
    // behavior that can't come from the shared Storage object itself
    // (browsers dispatch this at the window level, not the Storage level).
    // "Which tab is the one making this call" is read fresh from
    // globalThis.window at the moment of the call, not a separately
    // tracked flag - AuthClient's own code resolves the bare `window`
    // global the same way, at whatever point it happens to run, so the
    // test's notion of "self" has to track the same thing to stay in
    // sync across interleaved async continuations from both simulated
    // tabs (unlike real browsers, this process has only one globalThis to
    // share between them).
    const rawSetItem = sharedLocalStorage.setItem.bind(sharedLocalStorage);
    const rawRemoveItem = sharedLocalStorage.removeItem.bind(sharedLocalStorage);
    const windows = [tabAWindow, tabBWindow];

    sharedLocalStorage.setItem = (key: string, value: string) => {
      rawSetItem(key, value);
      const self = (globalThis as any).window;
      for (const w of windows) {
        if (w !== self) {
          w.dispatchEvent(Object.assign(new Event('storage'), { key, newValue: value }));
        }
      }
    };
    sharedLocalStorage.removeItem = (key: string) => {
      rawRemoveItem(key);
      const self = (globalThis as any).window;
      for (const w of windows) {
        if (w !== self) {
          w.dispatchEvent(Object.assign(new Event('storage'), { key, newValue: null }));
        }
      }
    };
  });

  function makeClientForTab(tabWindow: EventTarget & { localStorage: Storage }) {
    (globalThis as any).window = tabWindow;
    const storage = new TokenStorage('cookie-first', new LocalStorageAdapter());
    const client = new AuthClient({ apiBaseUrl: 'https://api.example.com' }, storage);
    return client;
  }

  it('only lets one tab actually call the refresh endpoint; the other waits and does not call it', async () => {
    let fetchCallCount = 0;
    // Object wrapper, not a bare `let`: TS's control-flow narrowing on a
    // plain `let` reassigned from inside this nested closure collapses
    // its type to `never` at the later call site below (a real TS
    // inference quirk with this shape, unrelated to the fix under test) -
    // a property write sidesteps it.
    const fetchGate: { resolve: (() => void) | null } = { resolve: null };

    (globalThis as any).fetch = vi.fn(async () => {
      fetchCallCount++;
      // Hold the first call open until the test explicitly lets it finish,
      // so tab B's refreshToken() call is guaranteed to observe tab A's
      // lock as already held, not a fluke of both finishing instantly.
      await new Promise<void>((resolve) => { fetchGate.resolve = resolve; });
      return {
        ok: true,
        json: async () => ({ access_token: 'a.b.c', refresh_token: 'd.e.f' }),
      } as Response;
    });

    (globalThis as any).window = tabAWindow;
    const clientA = makeClientForTab(tabAWindow);
    const refreshAPromise = clientA.refreshToken();

    // Let clientA's fetch actually start (and acquire the lock) before
    // clientB tries. globalThis.window must be restored to tabAWindow
    // before this tick runs any of clientA's pending continuations - the
    // setTimeout callback itself doesn't touch window, so no restore
    // needed here, but subsequent steps that resume clientA's async work
    // (the resolveFirstFetch call below) do need it set correctly first.
    await new Promise((r) => setTimeout(r, 0));

    (globalThis as any).window = tabBWindow;
    const clientB = makeClientForTab(tabBWindow);
    const refreshBPromise = clientB.refreshToken();

    // Only tab A should have actually hit the network so far.
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchCallCount).toBe(1);

    // Restore tab A as "self" before resuming its held-open fetch -
    // its continuation (json parsing, storage writes, releaseRefreshLock)
    // all run as a result of resolving this promise, and need
    // globalThis.window to read as tabAWindow while they do, exactly as
    // it would be in a real tab resuming its own suspended async function.
    (globalThis as any).window = tabAWindow;
    fetchGate.resolve?.();
    const [resultA, resultB] = await Promise.all([refreshAPromise, refreshBPromise]);

    expect(resultA).toBe(true);
    expect(resultB).toBe(true);
    // Tab B waited for the lock instead of racing its own POST.
    expect(fetchCallCount).toBe(1);
  });

  it('takes over a stale lock instead of waiting forever (crashed-tab safety valve)', async () => {
    (globalThis as any).window = tabAWindow;
    // Simulate tab A having crashed mid-refresh: a lock exists, but it's
    // old enough to be past the TTL.
    sharedLocalStorage.setItem(
      '__auth_refresh_lock__',
      JSON.stringify({ id: 'dead-tab', ts: Date.now() - 60_000 })
    );

    (globalThis as any).fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: 'a.b.c', refresh_token: 'd.e.f' }),
    }));

    (globalThis as any).window = tabBWindow;
    const clientB = makeClientForTab(tabBWindow);

    const result = await clientB.refreshToken();

    expect(result).toBe(true);
    expect((globalThis as any).fetch).toHaveBeenCalledTimes(1);
  });

  it('does not release a lock it does not own (e.g. after being overtaken as stale)', async () => {
    (globalThis as any).window = tabAWindow;
    sharedLocalStorage.setItem(
      '__auth_refresh_lock__',
      JSON.stringify({ id: 'someone-else', ts: Date.now() })
    );

    const clientA = makeClientForTab(tabAWindow);
    // Directly exercise the private method via a type cast - this is the
    // one piece of internal behavior (never clear another tab's live
    // lock) that has no other externally observable trigger worth setting
    // up a full concurrent scenario for.
    (clientA as any).releaseRefreshLock();

    expect(sharedLocalStorage.getItem('__auth_refresh_lock__')).not.toBeNull();
  });
});
