# DeInfluenceMe — Advisor Console

DeInfluenceMe is a single-advisor chat application for thinking through purchases, upgrades, and subscriptions. A signed-in user can start, resume, and delete owned conversations. The server checks access and usage, loads private guidance from Google Docs, sends the full short reference plus conversation history to OpenRouter, and saves replies and usage in Supabase Postgres. An admin can review recent activity, outcomes, and estimated cost.

This repository contains the **candidate code** on `fix/advisor-state-races`. The production branch is `backend-rebuild`. The latest candidate requires the two `20261002` SQL migrations **before** it can be deployed; these migrations have passed isolated database tests but have not been applied to live Supabase by this handoff. The ten-case advisor/persona evaluation is proposed, not scored.

## Source and attribution

The project began with [NOLLY-STUDIO's Next.js AI Chatbot with Supabase](https://github.com/nolly-studio/ai-chatbot-supabase), which builds on [Vercel's AI Chatbot](https://github.com/vercel/ai-chatbot). It kept the Next.js app, Supabase authentication foundation, and UI components. The active advisor APIs, schema, private Docs integration, OpenRouter call, usage controls, and admin view were built for this project. The original template snapshot is commit `476efe2`; its migrations remain under `template-reference/template-migrations/` for provenance and are **not** the current advisor migrations. Keep the repository's `LICENSE` notice with redistributed code.

## System at a glance

```text
User → Next.js chat page → protected advisor API
                         ├─ Supabase Auth + profile + ownership checks
                         ├─ Supabase Postgres (history, limits, turn log, cache)
                         ├─ Google Docs (private prompt + short reference)
                         └─ OpenRouter (advisor reply)
      ← saved reply and updated conversation
```

The pages and API routes live in one Next.js App Router application. The browser never directly reads the protected advisor tables or receives the prompt, reference text, or server keys. Legacy template chat/file/document/history/suggestion/vote API paths return HTTP `410` so they cannot bypass the advisor controls.

## Current features and limits

| Area | Behavior |
| --- | --- |
| Sign-in | Supabase email/password and Google OAuth; callback exchanges the OAuth code for a session. New users receive ordinary access unless an operator blocks their `profiles.is_allowed` flag. |
| Chat | One advisor; blank draft creates a conversation on first send; ordered saved history; Markdown replies; immediate sending bubble; owned-chat deletion. |
| Retries | Request UUIDs prevent duplicate saved turns; first-chat creation is idempotent; same-tab pending IDs survive reload; one turn per conversation processes at a time. |
| Guidance | Private prompt and complete short reference loaded from Google Docs. **No keyword-based chunk matching.** Default cache TTL is 300 seconds; last valid content is used if Docs fails. |
| Model | OpenRouter chat completions; `openrouter/free` or a `:free` model value; temperature `0.4`, up to 500 reply tokens, 60-second timeout. The free router may choose different underlying models. |
| Usage | Defaults: 20 messages per user per Manila day, 50,000 estimated/reported tokens per user per day, five requests per minute. Values come from server environment variables. |
| Admin | Daily counters and estimated cost; recent turns, conversations, events, settings summary, and Doc status. Requires `role = 'admin'` and `is_allowed = true`. |
| Recovery | Pre-provider failures refund the message slot; uncertain provider use is charged conservatively. An abandoned processing turn is reconciled after ten minutes on a later request. |

Token admission reserves a conservative estimate for the prompt/history and 500 reply tokens. This protects the application budget but is **not an exact provider-token hard cap** when the free router changes tokenizers. Cost values are estimates, not bills. Long conversations send full stored history and may hit a token or model-context limit; automatic summarization is not implemented.

## Repository map

| Path | Purpose |
| --- | --- |
| `app/(chat)/` | Chat and admin pages; legacy template routes remain retired |
| `app/(auth)/`, `app/auth/callback/` | Email/password and Google OAuth sign-in flow |
| `app/api/conversations/` | Owned conversation creation, list, deletion, history, and message send |
| `app/api/admin/` | Protected admin usage, event, conversation, settings, and Docs-status APIs |
| `components/custom/`, `components/admin/`, `components/ui/` | Chat, sidebar, admin, and shared UI components |
| `lib/server/` | Authentication, Docs, prompt assembly, OpenRouter, limits, events, errors, token estimation |
| `lib/supabase/` | Supabase clients and database types |
| `supabase/migrations/` | Advisor schema and database functions, applied in filename order |
| `template-reference/` | Original template migrations; reference only |
| `tests/` | Isolated route, security, reliability, and PGlite database tests |
| `evaluation/` | Proposed ten-case advisor evaluation set; no scores yet |
| `docs/REVISED_PRD.md` | Product requirements adjusted to this implementation and its known gaps |
| `docs/DEPLOYMENT.md` | Production branch, migration order, and validation |
| `docs/ADMIN_PANEL.md` | Admin behavior and usage-accounting details |
| `docs/ADMIN_EVALUATION.md` | Earlier evaluation worksheet and evidence caveats |
| `docs/BACKEND_HANDOFF.md` | Historical backend build notes; check this README and current code for newer behavior |
| `public/`, `app/(chat)/*.png`, `readme-video-thumbnail.png` | Tracked fonts and image assets |

There is no model-training dataset or standalone data-seeding script in this repository. `evaluation/cases.json` is the proposed test dataset. Tests and SQL migrations are the main development/verification scripts. The live prompt and reference Docs are external resources and are not exported into the package.

## Dependencies and prerequisites

- Node.js and `pnpm` for the Next.js/React application. Use the checked-in `pnpm-lock.yaml` for reproducible installation. The candidate was validated with Node `v24.21.0` and pnpm `12.4.1`; other versions need their own check.
- A Supabase project for Auth and Postgres. The browser uses the public URL/anon key; server routes need a secret/service-role key. Google OAuth additionally needs a Google OAuth client configured in Supabase.
- A Google Cloud service account with **Viewer** access to both Google Docs and the Google Docs API enabled.
- An OpenRouter API key and a free-route model value for the current test configuration.

No real credentials are committed. Copy `.env.example` to `.env.local` and fill in values locally; keep `.env.local` outside Git and outside deliverable ZIPs. Set the same variable names in the hosting environment for deployment.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Local or deployed app origin |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-safe Supabase project connection |
| `SUPABASE_SECRET_KEY` | Server-only privileged Supabase access |
| `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | Server-only base64 service-account JSON |
| `GOOGLE_PROMPT_DOC_ID`, `GOOGLE_REFERENCE_DOC_ID` | IDs of the two private Docs |
| `GOOGLE_DOC_CACHE_TTL_SECONDS` | Cache lifetime; example/default `300` |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | Server-only model access and free model selection |
| `ADVISOR_DAILY_MESSAGE_LIMIT`, `ADVISOR_DAILY_TOKEN_LIMIT`, `ADVISOR_REQUESTS_PER_MINUTE` | Server usage limits; defaults `20`, `50000`, `5` |

## Set up and run

1. Install dependencies in the repository root:

   ```sh
   pnpm install --frozen-lockfile
   ```

2. Create a Supabase project. For a **new empty project**, apply `supabase/migrations/*.sql` in filename order. For an **existing project**, compare its actual schema/migration history first; do not blindly replay earlier SQL or run `supabase db push`. The two `20261002` migrations must be applied before this candidate app code is deployed. Do not apply `template-reference/template-migrations/` to the advisor schema.

3. Configure Supabase Auth email/password and, if used, Google OAuth. Allow `http://localhost:3000/auth/callback` locally and the deployed `/auth/callback` URL in production. New signups receive ordinary access via the advisor migration; an admin role is assigned by a trusted project operator in `profiles`, not by a public UI action.

4. Give the Google service account Viewer access to both Docs; set their IDs and the base64 JSON credential in `.env.local`. Set the Supabase and OpenRouter variables from `.env.example`. Keep the two Docs short and private; edit them in Google Docs to change advisor guidance without a code deployment.

5. Run locally:

   ```sh
   pnpm dev
   ```

   Open `http://localhost:3000`, sign in, and use the chat. `/api/health` is a basic unauthenticated service check. The admin view is at `/admin` for an allowed admin account.

6. Validate the candidate:

   ```sh
   pnpm lint
   pnpm exec tsc --noEmit --incremental false
   node --test --test-concurrency=1 tests/*.test.cjs
   pnpm build
   ```

   The automated database tests use isolated PGlite identities and actual migration SQL; they do not create live users or edit live caps. The last run passed 36 tests, lint, typecheck, and build. This is not a substitute for the live evaluation in `evaluation/`.

## Main API and data flow

| Route | Action and access |
| --- | --- |
| `GET /api/health` | Basic service response; public |
| `GET /api/me` | Current account and profile; signed-in |
| `GET`, `POST /api/conversations` | List and create owned chats; allowed user |
| `DELETE /api/conversations/{id}` | Delete owned chat, redacting turn content; allowed owner |
| `GET`, `POST /api/conversations/{id}/messages` | Ordered history and advisor send; allowed owner |
| `GET /api/admin/*` | Usage, events, conversation review, settings and Docs status; allowed admin |

`profiles` controls access. `conversations` and `messages` hold saved chat data. `advisor_document_cache` stores the last valid Docs pair. `usage_counters` tracks Manila-day limits, `advisor_turn_logs` records protected request outcomes, and `advisor_events` records operational events. A completed turn saves the user and assistant messages transactionally. A duplicate completed request returns its saved answer; a failure after a possible provider call is reported as uncertain rather than silently generating another reply.

## Deployment and acceptance

`backend-rebuild` is configured as the production branch. Pushes to it trigger production builds; other branches can create previews. **Apply the candidate's new SQL migrations first**, then deploy the matching code. Follow `docs/DEPLOYMENT.md` for the exact migration names and validation commands. The current handoff does not assert that the live site, Supabase schema, or Google Docs have been updated to this candidate.

Before claiming PRD acceptance, run the ten cases in `evaluation/cases.json` with stable final Docs and isolated test accounts. Record actual results, live Doc edit-to-refresh time, a browser-network secrecy inspection, multi-account ownership checks, and the final deployed commit/schema. The source PRD's 99% persistence target also needs a measured period, not only passing code tests.

## Known limits and reading order

- Full history and full short reference are sent to the model; no keyword retrieval or summarization is present.
- An OpenRouter free route may change underlying models and be unavailable or return incomplete usage. Token/cost figures can be conservative estimates.
- The admin UI shows labeled recent windows rather than unlimited analytics history.
- Private Google Docs and live evaluation evidence remain outside this repository.

For a reviewer: read `docs/REVISED_PRD.md` → this README → `docs/DEPLOYMENT.md` → `evaluation/README.md` → the code and tests. `docs/BACKEND_HANDOFF.md` records earlier build history and may describe behavior that predates the latest retry/recovery changes.
