/**
 * Framework-agnostic "wait for an OAuth popup to finish" mechanic, pulled
 * out of AuthProvider.tsx's oauthLoginPopup so it's testable without
 * rendering a React component (window.open/postMessage/setInterval are
 * all it needs - none of that requires jsdom or React).
 */

export interface PopupResult {
  success: boolean;
  error?: string;
}

/** Minimal shape actually used - accepts the real `Window` returned by
 * `window.open`, or a test double with just these two members. */
export interface PopupHandle {
  readonly closed: boolean;
  close: () => void;
}

export interface WaitForPopupOptions {
  popup: PopupHandle;
  expectedOrigin: string;
  messageType: string;
  onTokens: (tokens: { access_token: string; refresh_token: string }) => Promise<void>;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

/**
 * Resolves once exactly one of three things happens:
 * 1. A same-origin `message` event of `messageType` arrives with tokens
 *    (or an error) - the common, successful path.
 * 2. The popup gets closed (by the user, or by the callback page itself
 *    right after posting its message) without ever completing step 1.
 * 3. `timeoutMs` elapses with neither of the above - the user abandoned
 *    the popup on an intermediate page without closing it. The popup is
 *    closed on our end in this case so it doesn't linger open forever
 *    after we've given up waiting on it.
 *
 * All three exit paths go through one `claim()` gate that marks the
 * result resolved AND stops the other two listeners/timers in the same
 * synchronous step - deliberately BEFORE `onTokens` is awaited on the
 * success path, not after. `onTokens` is a real network round-trip, and
 * OAuth callback pages typically self-close immediately after posting
 * their message; if claiming were bundled with the final `resolve(...)`
 * instead of happening synchronously up front, the closed-popup poll
 * could fire during that await, see the (already-closed-by-design)
 * popup, and resolve this as a failure - even though the tokens were
 * valid and about to be stored successfully. This exact ordering bug
 * shipped once already in an earlier version of this fix; the test file
 * next to this one exists specifically to catch it if it ever recurs.
 */
export function waitForPopupResult(options: WaitForPopupOptions): Promise<PopupResult> {
  const {
    popup,
    expectedOrigin,
    messageType,
    onTokens,
    pollIntervalMs = 500,
    timeoutMs = 5 * 60 * 1000,
  } = options;

  return new Promise<PopupResult>((resolve) => {
    let resolved = false;

    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      clearInterval(pollClosed);
      clearTimeout(hardTimeout);
    };

    const claim = (): boolean => {
      if (resolved) return false;
      resolved = true;
      cleanup();
      return true;
    };

    const finish = (result: PopupResult) => {
      if (claim()) resolve(result);
    };

    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== expectedOrigin) return;
      if (event.data?.type !== messageType) return;
      if (!claim()) return;

      const { access_token, refresh_token, error: popupError } = event.data ?? {};
      if (access_token && refresh_token) {
        try {
          await onTokens({ access_token, refresh_token });
          resolve({ success: true });
        } catch (err: any) {
          resolve({ success: false, error: err?.message });
        }
      } else {
        resolve({ success: false, error: popupError || 'no_tokens' });
      }
    };

    window.addEventListener('message', handleMessage);

    const pollClosed = setInterval(() => {
      if (popup.closed) {
        finish({ success: false, error: 'popup_closed' });
      }
    }, pollIntervalMs);

    const hardTimeout = setTimeout(() => {
      try {
        if (!popup.closed) popup.close();
      } catch {
        // Ignoring: already resolving with a timeout error regardless of
        // whether we could close the popup ourselves (cross-origin
        // restrictions, browser quirks).
      }
      finish({ success: false, error: 'popup_timeout' });
    }, timeoutMs);
  });
}

export default waitForPopupResult;
