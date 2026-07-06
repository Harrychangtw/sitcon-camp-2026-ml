import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { liveInferenceEnabled, setUnauthorizedHandler } from "@camp/data";
import { authHintValid, clearAuthHint, login, type LoginResult } from "../lib/auth";

/**
 * Password gate in front of the stations (backend: server/app/auth.py).
 *
 * When live inference is configured, a student first sees a login screen that
 * POSTs the shared class password (spoken aloud) to /auth, which mints an
 * HttpOnly session cookie — nothing secret lives in the bundle. After a
 * successful login the stations render. A later 401 (session expired) re-shows
 * the screen. If the server is unreachable the student can continue in
 * precomputed-only mode, so a dead backend never traps the class.
 *
 * When live inference is NOT configured (no VITE_LIVE_INFERENCE_URL), there is
 * no server to authenticate against and the gate is a no-op — stations render
 * straight away exactly as before.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const gated = liveInferenceEnabled();
  // Optimistic: a fresh, unexpired local hint means we probably still hold a
  // valid cookie, so skip the screen. A 401 on the next live call corrects us.
  const [authed, setAuthed] = useState(() => !gated || authHintValid());

  useEffect(() => {
    if (!gated) return;
    // A live call came back 401 → session gone. Drop the hint and re-gate.
    setUnauthorizedHandler(() => {
      clearAuthHint();
      setAuthed(false);
    });
    return () => setUnauthorizedHandler(null);
  }, [gated]);

  if (authed) return <>{children}</>;
  return <LoginScreen onEnter={() => setAuthed(true)} />;
}

/** A very simple centered popup: one line, a password box, a button. Calls
 * `onEnter` on a correct password (or when the student opts to continue offline
 * against an unreachable server). */
function LoginScreen({ onEnter }: { onEnter: () => void }) {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | LoginResult>("idle");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password.trim() || status === "checking") return;
    setStatus("checking");
    const result = await login(password);
    if (result === "ok") {
      onEnter();
      return;
    }
    setStatus(result); // "denied" or "offline"
  }

  return (
    <div className="flex h-full items-center justify-center bg-bg/80 p-6">
      <form
        onSubmit={submit}
        className="flex w-full max-w-xs flex-col gap-2 rounded-lg border border-border bg-panel p-4 shadow-lg"
      >
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (status !== "checking") setStatus("idle");
          }}
          autoFocus
          autoComplete="off"
          placeholder="課堂密碼"
          aria-label="課堂密碼"
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-fg outline-none focus:border-accent"
        />

        <button
          type="submit"
          disabled={status === "checking" || !password.trim()}
          className="w-full rounded-md bg-accent px-3 py-2 font-semibold text-bg transition-opacity disabled:opacity-50"
        >
          {status === "checking" ? "登入中…" : "登入"}
        </button>

        {status === "denied" ? (
          <p className="text-sm text-red-400">密碼錯誤</p>
        ) : null}
        {status === "offline" ? (
          <button
            type="button"
            onClick={onEnter}
            className="text-sm text-muted underline"
          >
            連不上伺服器，以離線模式繼續
          </button>
        ) : null}
      </form>
    </div>
  );
}
