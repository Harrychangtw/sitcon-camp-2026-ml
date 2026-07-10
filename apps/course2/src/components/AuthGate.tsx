import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { liveInferenceEnabled, setUnauthorizedHandler } from "@camp/data";
import { authHintValid, clearAuthHint, login, type LoginResult } from "../lib/auth";

/**
 * Login gate in front of the stations (backend: server/app/auth.py).
 *
 * When live inference is configured, a student first sees a login screen that
 * POSTs their own credentials (roster name + birthday as an 8-digit password;
 * staff use their name + the staff password) to /auth, which mints an
 * HttpOnly session cookie — nothing secret lives in the bundle, and every
 * request is attributable to a person server-side. After a successful login
 * the stations render. A later 401 (session expired) re-shows the screen. If
 * the server is unreachable the student can continue in precomputed-only
 * mode, so a dead backend never traps the class.
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

/** A very simple centered popup: name + password boxes and a button. Calls
 * `onEnter` on accepted credentials (or when the student opts to continue
 * offline against an unreachable server). */
function LoginScreen({ onEnter }: { onEnter: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | LoginResult>("idle");

  const filled = username.trim().length > 0 && password.trim().length > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!filled || status === "checking") return;
    setStatus("checking");
    const result = await login(username, password);
    if (result === "ok") {
      onEnter();
      return;
    }
    setStatus(result); // "denied", "banned" or "offline"
  }

  return (
    <div className="flex h-full items-center justify-center bg-bg/80 p-6">
      <form
        onSubmit={submit}
        className="flex w-full max-w-xs flex-col gap-2 rounded-lg border border-border bg-panel p-4 shadow-lg"
      >
        <input
          type="text"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            if (status !== "checking") setStatus("idle");
          }}
          autoFocus
          autoComplete="off"
          placeholder="姓名"
          aria-label="姓名"
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-fg outline-none focus:border-accent"
        />

        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (status !== "checking") setStatus("idle");
          }}
          autoComplete="off"
          placeholder="生日 8 碼（例：20190214）"
          aria-label="密碼：生日 8 碼"
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-fg outline-none focus:border-accent"
        />

        <button
          type="submit"
          disabled={status === "checking" || !filled}
          className="w-full rounded-md bg-accent px-3 py-2 font-semibold text-bg transition-opacity disabled:opacity-50"
        >
          {status === "checking" ? "登入中…" : "登入"}
        </button>

        {status === "denied" ? (
          <p className="text-sm text-red-400">姓名或密碼錯誤</p>
        ) : null}
        {status === "banned" ? (
          <p className="text-sm text-red-400">
            此帳號已被工作人員停用，請找助教協助
          </p>
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
