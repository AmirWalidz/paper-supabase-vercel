export default function NotFound() {
  return (
    <main className="state-page">
      <p className="eyebrow">NOT FOUND</p>
      <h1>Nothing in this orbit.</h1>
      <p>This page isn’t available.</p>
      <Link className="primary" href="/">
        Back to overview
      </Link>
    </main>
  );
}
import Link from "next/link";
