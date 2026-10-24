# Orbit

A personal project tracker built with Next.js App Router, React, TypeScript, Tailwind CSS and Supabase. GitHub OAuth is the only application sign-in method. Projects and tasks persist in PostgreSQL under the signed-in user’s RLS permissions; there is no privileged application backend, ORM, Edge Function, or sample-data mode.

## Run from a clean checkout

Requirements: Node.js 22+ (CI uses 24), npm, Docker with a running daemon, and ports 3000, 54321 and 54322 available. The lockfile pins the CLI and dependencies. The minimal local Supabase stack runs PostgreSQL, Auth, REST and Kong; Studio, storage, realtime and analytics are disabled. It was selected for a 1 CPU / 4 GB development machine.

```sh
npm ci
npm run db:start
npm run db:reset
node --import tsx scripts/local-env.ts
npm run dev
```

`db:reset` destroys **local** database records and reapplies `supabase/migrations/20261024000000_orbit.sql`. Do not use it against valuable data. `local-env.ts` writes the ignored `.env.local` with local public API configuration only. Never paste CLI status output into chat or CI logs: the CLI also displays local administrative credentials. Stop containers with `npm run db:stop`.

The unauthenticated app opens at `http://localhost:3000/login`. Missing Supabase configuration shows a setup notice instead of fabricated data. Real interactive sign-in requires a configured GitHub OAuth provider; the automated local tests use temporary fixture sessions, not a fake login route.

### Local GitHub OAuth (optional, separate owner configuration)

Create a development GitHub OAuth App with callback `http://127.0.0.1:54321/auth/v1/callback`. Set its credentials securely in your shell and add a local provider block to `supabase/config.toml`:

```toml
[auth.external.github]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET)"
redirect_uri = "http://127.0.0.1:54321/auth/v1/callback"
```

Restart local Supabase after changing Auth configuration. Never commit credential values. The local email provider is enabled solely so tests can create synthetic accounts without GitHub; no email/password UI or registration route exists. Do not copy that testing configuration into hosted Auth.

## Application configuration

Copy `.env.example` to `.env.local` for manual setup, or use the local helper above. All three variables are required for a usable sign-in flow:

| Variable                               | Purpose                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Selected Supabase API origin.                                              |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (or legacy anon key), never a secret/service-role key.     |
| `NEXT_PUBLIC_SITE_URL`                 | Exact app origin for the PKCE callback; HTTPS except loopback development. |

Public variables are compiled into the browser bundle. Set them **before building**, and rebuild when they change. No Paper token, GitHub OAuth secret, database password, service-role key or management credential belongs in the application environment.

The server validates identity with `getUser()` before rendering protected pages. `src/proxy.ts` refreshes cookie sessions and marks responses private/no-store. The browser rechecks identity before mutations, handles account changes/sign-out, and sends ordinary user JWTs to the Supabase Data API. Sign-out deliberately performs a full navigation to discard the in-memory private query cache. RLS remains the final authorization boundary even if someone bypasses the UI.

## Data and behavior

- Projects require a trimmed name of 1–120 Unicode characters and a valid authenticated owner. Tasks require a trimmed title of 1–200 characters, an owned parent project, and `todo`, `doing` or `done` status. The database repeats these checks and maintains timestamps.
- Both tables enable RLS with separate SELECT, INSERT, UPDATE and DELETE policies. Project UPDATE checks both the old and resulting owner. Task UPDATE checks both old and resulting parents. Anonymous roles receive no table grants. Deleting a project cascades to its tasks only after UI confirmation; deleting an Auth user also cascades their records.
- Overview fetches at most four project rows and displays three. Project/task pages fetch at most 21 rows and display 20, with stable `created_at, id` ordering. Pagination uses offsets, so concurrent edits in another tab may shift a page; Refresh reloads it. There is no realtime subscription or polling.
- Totals use three exact database HEAD counts under RLS, not the displayed page’s length or a downloaded table. They update after writes, including zeros and cascade deletes. Independent counts are not a transactionally atomic snapshot during concurrent external writes.
- All CRUD actions show pending and error states; repeated submissions are locked while pending. Failed writes retain the form. A successful write followed by a failed refresh shows a read error and Retry, rather than invented totals. Network ambiguity can still mean a write reached the database before its response was lost: refresh before retrying an uncertain create.
- Dialogs use native modal focus containment, Escape cancellation, focus restoration, labeled fields and live error feedback. Destructive dialogs explain cascade effects. Mobile layouts wrap long names without horizontal page scrolling.

## Verification

Run after the clean setup above:

```sh
npm run lint
npm run typecheck
npm test
npm run test:security
npx playwright install --with-deps chromium
npm run build
npm run test:e2e
```

The Playwright configuration starts the production server automatically. Stop an unrelated server on port 3000 first to avoid testing an old build. Tests are serialized for Small machines. The GitHub Actions workflow repeats the same checks from a clean local database; it does not deploy or contact the hosted backend.

`tests/security.test.ts` uses actual local HTTP Data API requests with anonymous and two independent user sessions. It checks all four operations on both tables, spoofed owners, old-row hijacks, resulting-owner/parent reassignment, null/blank/length/status/parent constraints, timestamps, task status/rename/delete, cascades, bounded pages and exact totals beyond the API’s 100-row cap. Temporary local admin access is used **only** to create/delete fixture Auth users; all application-data assertions use publishable keys plus ordinary user sessions. Helpers refuse non-loopback Supabase URLs and never print credentials.

`tests/e2e/orbit.spec.ts` exercises browser → real local Supabase → persisted records → rendered totals, project/task CRUD, all statuses, reload persistence, sign-out, anonymous routing, an unavailable foreign project, read/write failures and retry, submission locking, modal keyboard behavior, pagination, desktop/mobile layout and axe accessibility checks. Fixture sessions bypass GitHub’s interactive consent step; these tests do **not** prove hosted GitHub OAuth or hosted security.

Before calling an authorized hosted deployment ready, repeat with two ordinary GitHub test identities and synthetic data:

1. Complete GitHub → Supabase → `/auth/callback`, reload, sign out and return; confirm records persist and expired sessions expose no private records.
2. Through direct Data API calls using each user’s own session, attempt foreign reads, inserts, updates and deletes on both tables. Attempt owner reassignment and changing a task’s parent to the other account’s project. Verify denial/empty affected rows and unchanged owner-visible records. Repeat anonymous CRUD attempts with only the publishable key. Never share bearer tokens or request-header captures.
3. Exercise CRUD, live totals, delete confirmation/cascade, empty states, failed requests, keyboard dialogs and mobile/desktop views on the actual deployed build.

## Hosted setup — gated, not deployment authorization

The owner’s selected resources are Supabase **Orbit**, project ref `otxbcvazupwqatbubkqy` (Singapore / Free), and Vercel **orbit**, project ID `prj_XKZsPWmqoAvFHoKsdvADflei7JFa` in AW (Hobby). The API origin is `https://otxbcvazupwqatbubkqy.supabase.co`. The allocated app hostname is `orbit-pink-omega.vercel.app`; allocation alone does not mean an application is live. Leave the unrelated OB1 project untouched.

After separate explicit authorization:

1. Review/export the selected backend before material schema changes and retain the export outside this public repository. Apply the versioned migration only to the approved Orbit backend; e.g. securely link the CLI to ref `otxbcvazupwqatbubkqy`, inspect `supabase db push --dry-run`, then apply only after approval. `config.toml` configures local development, not hosted Auth. Do not run test fixtures or reset a hosted database. Test export restoration before trusting valuable data.
2. The owner configures a GitHub OAuth App directly in Supabase’s GitHub provider. Its **GitHub callback** is `https://otxbcvazupwqatbubkqy.supabase.co/auth/v1/callback`. The separate **application PKCE callback** is `/auth/callback`. Disable unused email registration and anonymous sign-in for the GitHub-only hosted prototype.
3. Configure Supabase Site URL as the actual approved HTTPS application origin. Allow exact callback URLs: `http://localhost:3000/auth/callback`, `https://orbit-pink-omega.vercel.app/auth/callback` if that is the chosen live host, and each separately authorized preview callback. Do not wildcard all Vercel tenants. Set `NEXT_PUBLIC_SITE_URL` to the origin matching that deployment; do not derive redirects from untrusted query parameters or Host headers.
4. Configure the three public environment variables on the unlinked Vercel project before its build. Use the Next.js preset, Node 24, `npm ci` and `npm run build`, without paid build options. Git linkage enables automatic deployments; connecting it requires authorization covering that behavior. A PR or resource allocation does not authorize deploying, promoting, applying migrations or merging.
5. Deploy only the specifically approved commit/target, then complete the hosted verification gates above. Preview and production may share this synthetic-data backend; they are **not** database-isolated. Review resource usage before adding testers.

Use only personal, non-commercial synthetic data while Vercel Hobby remains appropriate. Free-plan limits, Supabase inactivity pausing and lack of included automatic backups mean no uptime or durability promise. Do not activate paid plans, trials, add-ons, SMTP, domains, storage or other services without the owner’s approval.

## Design provenance and known limits

Reference: [01 — Editorial / overview](https://app.paper.design/file/01M5PVS86TXFY5BKVYAEQA89QM/p-1-0), file `01M5PVS86TXFY5BKVYAEQA89QM`, page `p-1-0`, artboard `1-0`. Four read-only Paper calls inspected basic info/tokens, the layer tree, complete JSX and a screenshot. No source design was modified. The implementation reuses Inter, the six supplied color tokens, the 56 px desktop gutters, editorial typography, metric band, ruled list and blue focus card. Team navigation, fake calendar/meeting actions, deadline metrics, decorative progress and demo/sample labels were removed. The focus card now creates a real project; metrics represent stored project/task totals. There is no theme selector.

Hosted migrations, OAuth round-trip, deployed behavior and two hosted GitHub accounts require separate authorization/access and are not proven by local fixtures. There is no deployment, realtime sync, sharing, calendar, uploads, billing or AI in this change. This is a prototype for a few synthetic-data testers, not a production business service.
