/**
 * Regression coverage for waitForPopupResult, extracted from
 * AuthProvider.tsx's oauthLoginPopup specifically so this is testable
 * without jsdom/React rendering.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitForPopupResult, type PopupHandle } from '../waitForPopupResult';

class FakePopup implements PopupHandle {
  closed = false;
  close = vi.fn(() => { this.closed = true; });
}

function postMessage(data: any, origin = 'https://example.com') {
  const event = Object.assign(new Event('message'), { data, origin });
  window.dispatchEvent(event as MessageEvent);
}

describe('waitForPopupResult', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as any).window = new EventTarget();
    (globalThis as any).window.location = { origin: 'https://example.com' };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it(
    'resolves success when the popup self-closes WHILE onTokens is still in flight ' +
    '(the exact ordering regression this file exists to catch: an earlier version of ' +
    'this fix marked the result resolved only AFTER awaiting onTokens, so the closed-popup ' +
    'poll firing during that await would win the race and report failure despite valid tokens)',
    async () => {
      const popup = new FakePopup();
      let resolveOnTokens: (() => void) | undefined;
      const onTokens = vi.fn(() => new Promise<void>((resolve) => { resolveOnTokens = resolve; }));

      const resultPromise = waitForPopupResult({
        popup,
        expectedOrigin: 'https://example.com',
        messageType: 'oauth-tokens',
        onTokens,
      });

      postMessage({ type: 'oauth-tokens', access_token: 'a', refresh_token: 'b' });
      // onTokens is now in flight (its promise hasn't resolved yet). The
      // OAuth callback page has done its job and, as real callback pages
      // typically do, closes itself right away.
      popup.closed = true;

      // Advance past several poll intervals while onTokens is still
      // pending - if claiming were bundled with the final resolve
      // instead of happening synchronously on message receipt, this is
      // exactly where the old bug would fire `popup_closed`.
      await vi.advanceTimersByTimeAsync(2000);

      resolveOnTokens?.();
      const result = await resultPromise;

      expect(result).toEqual({ success: true });
      expect(onTokens).toHaveBeenCalledTimes(1);
    }
  );

  it('resolves popup_closed when the popup is closed before any message arrives', async () => {
    const popup = new FakePopup();
    const onTokens = vi.fn();

    const resultPromise = waitForPopupResult({
      popup,
      expectedOrigin: 'https://example.com',
      messageType: 'oauth-tokens',
      onTokens,
    });

    popup.closed = true;
    await vi.advanceTimersByTimeAsync(500);

    expect(await resultPromise).toEqual({ success: false, error: 'popup_closed' });
    expect(onTokens).not.toHaveBeenCalled();
  });

  it('resolves popup_timeout and closes the popup if nothing happens before the deadline', async () => {
    const popup = new FakePopup();
    const onTokens = vi.fn();

    const resultPromise = waitForPopupResult({
      popup,
      expectedOrigin: 'https://example.com',
      messageType: 'oauth-tokens',
      onTokens,
      timeoutMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(1000);

    expect(await resultPromise).toEqual({ success: false, error: 'popup_timeout' });
    expect(popup.close).toHaveBeenCalledTimes(1);
  });

  it('ignores messages from an unexpected origin', async () => {
    const popup = new FakePopup();
    const onTokens = vi.fn();

    const resultPromise = waitForPopupResult({
      popup,
      expectedOrigin: 'https://example.com',
      messageType: 'oauth-tokens',
      onTokens,
      timeoutMs: 1000,
    });

    postMessage({ type: 'oauth-tokens', access_token: 'a', refresh_token: 'b' }, 'https://evil.example');
    await vi.advanceTimersByTimeAsync(1000);

    expect(await resultPromise).toEqual({ success: false, error: 'popup_timeout' });
    expect(onTokens).not.toHaveBeenCalled();
  });

  it('does not double-fire onTokens if two messages arrive back to back', async () => {
    const popup = new FakePopup();
    const onTokens = vi.fn(async () => {});

    const resultPromise = waitForPopupResult({
      popup,
      expectedOrigin: 'https://example.com',
      messageType: 'oauth-tokens',
      onTokens,
    });

    postMessage({ type: 'oauth-tokens', access_token: 'a', refresh_token: 'b' });
    postMessage({ type: 'oauth-tokens', access_token: 'a', refresh_token: 'b' });
    await vi.advanceTimersByTimeAsync(0);

    expect(await resultPromise).toEqual({ success: true });
    expect(onTokens).toHaveBeenCalledTimes(1);
  });

  it('resolves failure without calling onTokens when the popup reports an error', async () => {
    const popup = new FakePopup();
    const onTokens = vi.fn();

    const resultPromise = waitForPopupResult({
      popup,
      expectedOrigin: 'https://example.com',
      messageType: 'oauth-tokens',
      onTokens,
    });

    postMessage({ type: 'oauth-tokens', error: 'access_denied' });
    await vi.advanceTimersByTimeAsync(0);

    expect(await resultPromise).toEqual({ success: false, error: 'access_denied' });
    expect(onTokens).not.toHaveBeenCalled();
  });
});
