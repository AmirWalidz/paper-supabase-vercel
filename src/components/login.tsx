"use client";

import Link from "next/link";
import { useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { siteUrl } from "@/lib/validation";

export function Login({ reason }: { reason?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    setPending(true);
    setError("");
    try {
      const { error } = await browserClient().auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo: `${siteUrl()}/auth/callback` },
      });
      if (error) throw error;
    } catch {
      setError(
        "We couldn’t start GitHub sign-in. Check your connection and try again.",
      );
      setPending(false);
    }
  }

  return (
    <main className="auth-page">
      <Link className="brand" href="/">
        <span className="orbit-mark" aria-hidden="true" />
        orbit
      </Link>
      <div className="auth-card">
        <p className="eyebrow">YOUR PERSONAL WORKSPACE</p>
        <h1>
          Good work,
          <br />
          in motion.
        </h1>
        <p>
          A little clarity for everything you’re making. Keep your projects
          close and your next step simple.
        </p>
        {reason === "session" && (
          <p role="status">Sign in to continue. Your session may have ended.</p>
        )}
        {reason === "oauth" && (
          <p role="alert" className="error-message">
            Sign-in wasn’t completed. Please try again.
          </p>
        )}
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <button className="primary" disabled={pending} onClick={signIn}>
          {pending ? "Connecting…" : "Continue with GitHub"}
          <span aria-hidden="true">↗</span>
        </button>
        <p className="small muted">
          A private space for your projects. No shared workspaces, no noise.
        </p>
      </div>
      <footer>ORBIT / PERSONAL PROJECT TRACKER</footer>
    </main>
  );
}
