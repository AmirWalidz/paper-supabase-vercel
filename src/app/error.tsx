"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="state-page">
      <p className="eyebrow">LET’S TRY THAT AGAIN</p>
      <h1>A little interruption.</h1>
      <p role="alert">
        We couldn’t load your workspace. Check your connection and try again.
        Your saved work hasn’t changed.
      </p>
      <button className="primary" onClick={reset}>
        Try again
      </button>
      <a href="/login">Back to sign-in</a>
    </main>
  );
}
