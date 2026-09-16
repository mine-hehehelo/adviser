# Admin view

Eligible admins open **Admin view** from the existing advisor sidebar. `/admin` uses the same chat layout, sidebar, typography, and light/dark theme. **Back to chat** returns to the normal advisor.

## Access

The signed-in account must have `profiles.role = 'admin'` and `profiles.is_allowed = true`. These checks run on the page and every admin API endpoint. The sidebar checks the authenticated user for the current request, not a shared cached session or user-editable metadata. No roles or permissions are changed by the panel.

## Views

- **Overview:** daily usage records, accepted requests counted against the cap, recorded tokens and estimated USD spend; per-person usage and request outcomes.
- **Turn logs:** up to 100 recent turns for the selected Manila calendar day, with search and outcome filters; read-only input, response, usage, model, source, timestamps and failure reason.
- **Conversations:** latest 100 conversations across all dates. Full stored message history loads in pages of 100.
- **System events:** latest 100 events for a selected Manila day: message submissions, completion/block/failure outcomes, document cache hits/misses, document failures, provider errors, and uncertain usage. No private prompt text is included.
- **Advisor controls:** effective environment-based limits and model, external Google Doc edit links, cache lifetime and a document connection check. No private document content is returned to the browser.

The backend increments the daily message counter when it accepts a request, before generation. Failed accepted requests still count toward the cap. “Requests counted” therefore need not equal completed turns. Missing provider usage on a turn is displayed as “Not reported”; aggregate counters include conservative token charges when provider usage is unknown and should not be read as billing statements. Outcome counts cover the displayed recent window; usage counters cover the selected day.

## Configuration and evaluation

Set caps in the server environment with `ADVISOR_DAILY_MESSAGE_LIMIT`, `ADVISOR_DAILY_TOKEN_LIMIT`, and `ADVISOR_REQUESTS_PER_MINUTE`, then restart the local server. Prompt and reference content is edited only in Google Docs. The event feed and token reservations require `supabase/migrations/20260916090000_token_reservations_and_events.sql`. Apply this additive migration once in each target database before deploying the new routes. It was already applied to the development project on 2026-09-16.

See `ADMIN_EVALUATION.md` for the proposed 10-case PRD evaluation worksheet and remaining project-level acceptance tests. It does not claim completed persona evaluation.

## Verification

Run `node --test tests/admin-access.test.cjs` for isolated API authorization, settings secrecy, invalid input and conversation pagination checks. Tests replace Supabase at its boundary and never change live data. Build with `pnpm build` while the development server is stopped.

UI checks cover the normal advisor shell, outcome filtering, turn detail, conversation review, and mobile/light/dark layouts using isolated synthetic fixtures. The live admin view was also checked against the connected Supabase project; signed-out endpoints returned 401. There is no public preview route or authentication bypass.

## Token admission and failure accounting

Before calling the model, the server reserves a conservative budget for the complete prompt/history and a 500-token response. Per-user database locking prevents simultaneous requests from reserving the same remaining allowance. Completion replaces the reservation with reported usage; a failure before provider submission releases it. Missing usage or uncertain failure after provider submission charges the reserved amount once. An interrupted process retains its in-flight reservation rather than silently freeing potentially consumed usage. Day boundaries use the request's original Manila date.

The free-model router can choose different tokenizers, so the byte-based estimate plus overhead is conservative rather than a mathematical provider-token guarantee. A reported overrun is recorded as `token_estimate_exceeded`. Exact hard provider-token guarantees require a pinned tokenizer/model or provider-enforced per-user budgets. Long histories may be blocked while some nominal daily tokens remain; starting a shorter conversation can help.

Rate-limit replies include retry timing. The chat preserves the draft and shows a countdown; uncertain network retries reuse the request ID so a completed reply is not generated twice. Daily-cap messages explain the Manila midnight reset.

## Reproduce the checks

Run `pnpm install --frozen-lockfile`, then `node --test tests/admin-access.test.cjs tests/robustness.test.cjs` and `node tests/budget-database.test.cjs`. The database test uses PGlite with the actual migrations and isolated fake identities; it never creates live accounts or changes shared caps.
