export function SetupNotice() {
  return (
    <main className="auth-page">
      <Link className="brand" href="/">
        <span className="orbit-mark" aria-hidden="true" />
        orbit
      </Link>
      <div className="auth-card">
        <p className="eyebrow">A LITTLE SETUP FIRST</p>
        <h1>
          Give your work
          <br />a place to land.
        </h1>
        <p>
          Orbit is built, but this environment isn’t connected to Supabase yet.
          Follow the README to configure the public Supabase URL, publishable
          key, and OAuth callback.
        </p>
        <p>No sample data or private records are displayed.</p>
      </div>
    </main>
  );
}
import Link from "next/link";
