/**
 * Client side of the password gate (backend: server/app/auth.py).
 *
 * The real credential is an HttpOnly session cookie the server sets on /auth —
 * JS can neither read nor forge it. This module only POSTs the password and
 * keeps a NON-secret local "logged in until" hint so a returning student inside
 * the session window skips the login screen instead of seeing it flash. The
 * hint is advisory: if it disagrees with the real cookie, the next live call's
 * 401 corrects it (setUnauthorizedHandler → clear hint → re-show login).
 */

import { liveInferenceUrl } from "@camp/data";

const HINT_KEY = "camp.session.until"; // epoch ms the local hint is good until

/** True if we have a not-yet-expired local login hint. */
export function authHintValid(): boolean {
  try {
    const raw = localStorage.getItem(HINT_KEY);
    return raw !== null && Date.now() < Number(raw);
  } catch {
    return false; // storage blocked (private mode) → treat as logged out
  }
}

function setAuthHint(ttlSeconds: number): void {
  try {
    localStorage.setItem(HINT_KEY, String(Date.now() + ttlSeconds * 1000));
  } catch {
    /* storage unavailable — the cookie still works; we just re-login next visit */
  }
}

export function clearAuthHint(): void {
  try {
    localStorage.removeItem(HINT_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Result of a login attempt:
 * - `ok`      — password accepted, session cookie set.
 * - `denied`  — server reached, password wrong (401).
 * - `offline` — server unreachable (network error / down). The caller lets the
 *   student continue in precomputed-only mode instead of trapping them at a
 *   login screen they can't get past.
 */
export type LoginResult = "ok" | "denied" | "offline";

/** Exchange the shared class password for a session cookie. Never throws. */
export async function login(password: string): Promise<LoginResult> {
  const base = liveInferenceUrl();
  if (!base) return "ok"; // no live server configured → nothing to gate
  let res: Response;
  try {
    res = await fetch(`${base}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // let the browser store the Set-Cookie
      body: JSON.stringify({ password }),
    });
  } catch {
    return "offline"; // network error / server down
  }
  if (!res.ok) return "denied"; // reached the server; password rejected
  const body = (await res.json().catch(() => ({}))) as {
    expiresInSeconds?: number;
  };
  setAuthHint(body.expiresInSeconds ?? 0);
  return "ok";
}
