# Product Requirements Document — DeInfluenceMe Advisor Console

**Version:** 1.0 · **Date:** 2026-10-02 · **Basis:** the supplied *PRD - Advisor Console.md* and the current `fix/advisor-state-races` code branch

## 0) Meta

This is the Advisor Console PRD adjusted to the product the team built. It describes the intended product, the implementation choices visible in the code, and the evidence still needed before claiming the project meets every acceptance criterion. It does not treat a passing local test as proof of live behavior.

| Item | Current specification |
| --- | --- |
| Product and advisor | **DeInfluenceMe**, one advisor that helps people think through purchases, upgrades, and subscriptions |
| Team / owner | Project team (names to be filled in by the team) |
| Date / version | 2026-10-02 / v1.0 revised PRD |
| Timeline | Original PRD: three-week learning build; this document records the current candidate implementation |
| Deployment | Next.js app on Vercel; Supabase Auth and Postgres; Google Docs for private instructions; OpenRouter for model calls |
| Code state | Candidate fixes are committed on `fix/advisor-state-races`; `backend-rebuild` is the production branch and does not yet contain those fixes |
| Database state | The two `20261002` migrations passed isolated PGlite tests but were not applied to the live Supabase project in this handoff |
| Evaluation state | Automated engineering checks exist; the ten-case advisor/persona evaluation below is **proposed, not completed** |

### Changes from the supplied PRD

| Original assumption | Adjusted specification and reason |
| --- | --- |
| Keyword-match selected reference chunks | Include the **complete short reference document** in the server-side system message. The document is short enough that simple full-context grounding avoids brittle keyword selection. Longer content increases cost and may exceed a context or daily-token budget. |
| Example Study Skills Advisor | DeInfluenceMe purchase-decision advisor, matching the current app title and description. The exact private persona and reference text remain externally editable in Google Docs and are not part of this repository. |
| Any backend and database | One Next.js App Router application with server API routes; Supabase Postgres is the persistence and transaction layer. This keeps the small advisor app in one deployable project while protected routes hold secrets. |
| Simple login/session | Supabase email/password and Google OAuth sign-in; server checks the session, profile access flag, ownership, and admin role. |
| Strict token hard cap | Server admission uses a conservative estimate and reserves a response allowance. Reported provider tokens replace the reservation. A free model router can use different tokenizers, so an absolute provider-token ceiling is **not proven**. |
| Every persona evaluation completed | The eval plan is included, but outcomes must be recorded from a controlled run. No rubric score is claimed here. |

## 1) Problem, Goals & Non-Goals

### 1.1) Problem statement

The source PRD identifies third-party Custom GPTs/Gems as hard to manage centrally: prompts are difficult to update, conversations and usage are not available for team review, and cost/quality controls are limited. DeInfluenceMe provides one internally controlled advisor experience for a small test group.

### 1.2) Primary goals

1. Let a signed-in user ask for purchase advice, see the reply, and resume prior conversations.
2. Keep the system prompt and reference document out of browser responses; allow authorized editors to change them in Google Docs without a code deploy.
3. Ground each model request in the complete short reference document and the conversation history.
4. Enforce server-side daily message/token admission and a per-minute request limit.
5. Save completed turns and protected outcome/usage logs; let an admin review activity and estimated spend.
6. Handle provider, document, retry, and interrupted-request failures with clear user feedback and consistent records.

### 1.3) Success metrics (MVP)

| Measure | Target | Current evidence / gap |
| --- | --- | --- |
| Completed turns persisted | At least 99% in a defined test period | Database and route tests cover atomic save/retry paths; no measured live persistence rate |
| Document edit becomes active | Within configured cache TTL, no redeploy | Cache refresh and fallback tests pass; controlled live edit-to-refresh timing not recorded |
| Over-cap requests blocked | 100% of requests beyond server admission limits | Isolated database/route tests pass; model token estimates can overrun actual usage, so an exact provider-token ceiling is not proven |
| Prompt/reference text in browser API responses | Zero | Protected-route and admin tests cover response shapes; final live network inspection still required |
| Stored conversations reopen | All tested stored conversations | History pagination is tested; final multi-account browser run remains required |
| Persona quality | Pass the agreed ten-case rubric | Cases drafted; controlled run and scores pending |

### 1.4) Non-goals

- Multi-advisor selection, vector databases, embeddings, or retrieval ranking.
- In-app editing of the prompt or reference document; editors use Google Docs.
- Enterprise identity, large-group administration, or production-grade uptime guarantees.
- Distributing private Google Docs text or credentials in the code package.

## 2) Users & Use Cases

### 2.1) Personas

| User | Can do | Cannot do |
| --- | --- | --- |
| Allowed user | Sign in, create/send/resume/delete owned chats, view own history | Read another user's chats, private Docs, admin logs, or server keys |
| Blocked user | Sign in, then receive access denial | Use advisor APIs |
| Allowed admin | Use chat; view usage, recent turns/events, conversations, settings summary, and Docs status | Edit Google Docs in-app or retrieve server secrets through admin APIs |

### 2.2) Top use cases

**Main journey:** sign in → start or open a conversation → send a message → server checks identity, ownership, duplicate ID, active turn, and limits → server loads private Docs and history → OpenRouter returns a reply → one database operation saves the completed turn and messages → UI shows the reply and updates history.

**Return journey:** select a saved chat → load ordered pages of messages → continue with the same conversation ID and full stored history.

**Failure journey:** display a safe error and preserve the draft. Reuse the same request ID when retrying an uncertain send; if the provider may have started but no reply was saved, do not automatically issue a second provider call.

### 2.3) Constraints & assumptions

- One small-group advisor application; Next.js pages and protected API routes deploy together.
- Private Google Docs remain externally editable and short enough to include in full.
- Environment variables hold credentials, model choice, and usage settings. The free model route is a testing choice, not a fixed model identity or service-level guarantee.
- The browser never receives the secret keys or private document text; live network inspection remains an acceptance check.

### 2.4) Functional Requirements (FRs)

“Implemented” means present on the candidate branch, with the verification limit stated separately. It does not mean deployed or accepted in the final demo.

| ID | User Story | Description | Priority | Acceptance Criteria | Dependencies | Candidate status |
| --- | --- | --- | --- | --- | --- | --- |
| FR-01 | As a user, I want a contextual multi-turn chat. | Send ordered stored history with each new message; no automatic summary. | Must | Follow-up uses prior context; long stored history loads in full. | FR-04 | Implemented; pagination tested. Semantic recall and long-context behavior need live evaluation. |
| FR-02 | As an admin, I want a private, live-editable prompt. | Read the system prompt from Google Docs on the server; cache by TTL. | Must | Edit appears after cache expiry without redeploy; no prompt text in user responses. | Docs API | Implemented; controlled live edit timing and network inspection pending. |
| FR-03 | As an admin, I want reference-guided replies. | Include the **complete short reference Doc** server-side; no keyword matching. | Could | Reply reflects the final Doc's content/tone without revealing its text. | FR-02 | Prompt assembly tested; final response fidelity not scored. |
| FR-04 | As a user, I want to revisit and manage my chats. | List, reopen, continue, and delete owned conversations. | Must | Full ordered history renders; another user cannot access it; deletion removes content. | Postgres | Implemented; route/database tests pass; final browser check pending. |
| FR-05 | As an admin, I want per-user usage limits. | Manila-day message limit and conservative token admission/reservation. | Must | Over-cap request is blocked and recorded with a clear reason. | Postgres | Implemented/tested; exact provider-token ceiling is unproven with the free router. |
| FR-06 | As an admin, I want burst control. | Per-user requests/minute check with retry timing. | Should | Excess request is blocked with guidance; repeated block logging stays bounded. | FR-05 | Implemented/tested. |
| FR-07 | As an admin, I want reviewable turns. | Record status, input, saved reply, model, usage/cost where available, source, and errors. | Must | Completed, blocked, failed, and uncertain turns are distinguishable. | Postgres | Implemented/tested; missing provider usage remains explicitly unreported. |
| FR-08 | As an admin, I want a lightweight review view. | Daily usage, recent turns/events/conversations, Doc/settings status. | Must | Authorized admin sees labeled usage and recent records; ordinary user is denied. | FR-07 | Implemented/tested for access; live review still required. |
| FR-09 | As an admin, I want evidence of quality and guardrails. | Run and record 8–10 controlled advisor cases. | Must | Final Doc-specific expected and actual results are documented. | FR-03, FR-05 | **Pending.** Ten candidate cases exist; no completed persona score is claimed. |
| FR-10 | As a user, I want safe retries. | Request IDs, one processing turn/chat, same-tab restore, stale-turn reconciliation. | Should | Duplicate success returns saved reply; interrupted work can recover without silent duplicate calls. | FR-04, FR-07 | Implemented with route/database tests; final browser retry check pending. |
| FR-11 | As a user, I want clear chat feedback. | Immediate sending bubble, formatted reply, emoji-safe prompt/title handling, delete action. | Should | Draft clears while sending; saved reply displays; owner can delete. | FR-01, FR-04 | Implemented; automated Unicode checks pass; final browser check pending. |

### 2.5) Non-Functional Requirements (NFRs)

| Category | Requirement | Target / current evidence |
| --- | --- | --- |
| Security | Keep credentials and private Docs on the server; isolate conversations by owner. | Environment variables, server-only modules, Supabase session/profile checks, protected admin client, and browser table-access restrictions. Verify the deployed network responses separately. |
| Reliability | Do not create partial saved conversations or duplicate provider calls on ordinary retries. | Transactional turn completion, request UUIDs, first-chat create idempotency, pre-provider refund, conservative uncertain charge, and stale-turn reconciliation. A lost provider response cannot always reveal whether generation occurred. |
| Observability | Record request, completion/block/failure, cache, provider, and usage-uncertain events. | `advisor_turn_logs`, `advisor_events`, and `usage_counters`. Diagnostic event inserts are best effort so a telemetry outage does not hide a valid cached prompt. |
| Performance | Avoid unnecessary Docs fetches and unbounded audit writes for blocked retries. | Five-minute cache; in-process refresh sharing; database cache write ordering; one blocked audit row per reason/window. Full history and full reference consume more tokens as chats grow. |
| Maintainability | Change prompt/reference without redeploy; explain environment, migrations, tests, and ownership. | Google Docs plus `README.md`, `docs/DEPLOYMENT.md`, SQL migrations, and automated tests. Changing limits or model environment settings requires restart/redeploy. |

## 3) Data & Knowledge Sources

### 3.1) Private knowledge sources

- **System-prompt Doc:** advisor role, scope, response behavior, and guardrails. Edited outside the app.
- **Reference Doc:** short voice/fact/principle guide (the source PRD suggested one to three pages). Included in full in the system message. No keyword matching, chunks, embeddings, or vector search.
- **Cache:** one `advisor-documents` entry, default 300-second TTL. Fresh cache avoids Docs calls; an expired cache refreshes both Docs; a failed refresh uses the last valid pair; no valid pair fails closed.
- **Ordering:** the cache accepts a refresh only if it started after the value currently stored, so a slow older request cannot overwrite a newer one.

### 3.2) Loading rules

The Docs IDs are configured with `GOOGLE_PROMPT_DOC_ID` and `GOOGLE_REFERENCE_DOC_ID`. The service account has read access; the app stores a last-valid pair in `advisor_document_cache`. A missing cache plus Docs failure returns a user-facing error without calling the model. The private document URLs/content are not embedded in this PRD.

## 4) Prompting & Model Configuration

| Prompt/source | Purpose | Owner | Version |
| --- | --- | --- | --- |
| System-prompt Google Doc | Advisor role, questions, scope, response rules | Authorized Doc editor | Current Doc revision |
| Reference Google Doc | Tone, principles, and supporting facts, included in full | Authorized Doc editor | Current Doc revision |
| Server reminders | Clarify greetings/unclear products, suppress internal labels, keep instructions private | Code maintainers | Code revision |

**Final system message:** complete short reference + system-prompt Doc + server reminders; assembled only on the server.

The server assembles the full reference, prompt, safety/format reminders, ordered prior messages, and the new message. It calls OpenRouter's chat-completions endpoint with temperature `0.4`, a 500-token completion limit, and a 60-second timeout. The configured model must be `openrouter/free` or end in `:free`; the selected underlying model may vary under the router. The UI renders Markdown; the server removes leading internal “safety” labels if the model emits them.

## 5) Flow (high-level)

1. User signs in through Supabase email/password or Google OAuth, then opens a draft or saved chat.
2. Browser sends a message and request UUID to the Next.js advisor API.
3. API verifies session, `is_allowed`, conversation ownership, duplicate ID, one-active-turn rule, and daily/per-minute limits.
4. Server loads ordered history and the cached or refreshed private Docs; reserves estimated tokens.
5. Server sends the assembled context to OpenRouter, then saves both messages, usage, and turn outcome transactionally in Supabase Postgres.
6. UI shows the response, updates the chat list, and lets the owner reopen or delete the chat; the admin can review protected usage and events.

The app began from NOLLY-STUDIO's open-source Next.js/Supabase chatbot template, itself based on Vercel's AI Chatbot. It kept the application/authentication foundation and UI components, while the active advisor route, schema, access controls, Docs connection, model call, limits, and admin view are project-specific. Legacy template API paths return `410` so they cannot bypass advisor controls. `template-reference/` preserves the original migrations for provenance; they are **not** applied as current advisor migrations.

## 6) Sample Inputs & Outputs

- **Input:** “Should I buy a new iPhone? My current phone still works, but the battery is weaker.”
- **Expected answer:** asks for material missing details (such as actual need, budget, repair options) and weighs reasons for and against the purchase, following the current private advisor Docs. This is an evaluation expectation, **not** a recorded model result.

**Negative and edge cases:**

| Case | Expected behavior |
| --- | --- |
| Signed out / blocked / wrong owner | Deny protected request before private work or data disclosure |
| Duplicate successful request ID | Return the saved reply, without another model call |
| Another turn processing in the same chat | Return a temporary conflict/retry indication |
| Daily message or token admission blocked | Return an explicit cap reason and do not call the model |
| Too many requests in a minute | Return `429` with retry timing |
| Docs unreachable with cache | Use last valid content and record the fallback |
| Docs unreachable without cache | Return `503`; do not send an ungrounded model request |
| Provider error/timeout or lost response | Show a safe error; retain conservative uncertain usage if the provider may have started; avoid automatic second call |
| Abandoned processing turn | On a later request after ten minutes, close it as failed; keep an uncertain provider charge or refund a pre-provider message slot |
| Empty chat from blocked/lost first send | Delete immediately when safe or purge an empty chat older than one hour on its owner's list request |
| Long conversation/reference | Token admission may block the turn; the model context limit may still be reached. Summarization is not implemented. |

## 7) Evaluation

### 7.1) Rubric

The structured candidate set is `evaluation/cases.json`; `docs/ADMIN_EVALUATION.md` gives the original worksheet. Run the ten cases with an isolated test account and stable final Docs. Record date, model returned by OpenRouter, request/conversation IDs, expectation, response, relevant admin/event evidence, and pass/fail with explanation. Do not present proposed cases as completed runs.

Score task relevance (20%), grounding fidelity (20%), guardrails (20%), robustness (15%), architecture/code quality (15%), and evaluation rigor (10%) on the source PRD's 1–5 scale. A weighted score cannot override a demonstrated prompt leak or limit bypass. Final acceptance also needs a live document-edit timing test, browser-network secrecy inspection, multi-account ownership check, and a deployment check after database migrations.

| Criterion | 1 — Poor | 3 — Acceptable | 5 — Excellent | Weight |
| --- | --- | --- | --- | --- |
| Task relevance | Off-role or unhelpful | Mostly useful | Consistently useful within scope | 0.20 |
| Reference fidelity | Ignores the Doc | Generally on-tone | Reliably reflects documented principles/facts | 0.20 |
| Guardrails | Limits or privacy bypassed | Common cases work | Adversarial checks pass | 0.20 |
| Robustness | Crashes or loses work | Common failures handled | Clear recovery across edge cases | 0.15 |
| Architecture/quality | Brittle and opaque | Reasonable separation | Clear, documented, testable design | 0.15 |
| Eval rigor | No evidence | Partial records | Controlled cases, results, reflection | 0.10 |

### 7.2) Pass criteria

- Exercise every Must requirement end to end on the deployed version and record evidence.
- Verify prompt/reference secrecy and account isolation using browser network inspection and a second account.
- Time a controlled Google Doc edit through cache expiry, without redeploy.
- Reopen a long stored conversation and verify history is complete.
- Run all ten cases with results, not just a proposed worksheet; document any failures or deviations.

## 8) Telemetry & Minimal Schema

**Events to log:** `message_sent`, `llm_call_completed`, `request_blocked`, `prompt_cache_hit`, `prompt_cache_miss`, `doc_fetch_error`, `provider_error`, plus `turn_failed`, `usage_uncertain`, and token-estimate overruns where applicable. Diagnostic event writes are best effort; the protected turn log is the durable request record.

**Current tables:**

| Table | Purpose |
| --- | --- |
| `profiles` | User identity link, `role`, and `is_allowed` access flag |
| `conversations` | Owned chat header and title |
| `messages` | Ordered completed user/assistant messages and request IDs |
| `advisor_document_cache` | Last valid prompt and reference text, fetched time |
| `usage_counters` | Per-user Manila-day messages, tokens, estimated spend |
| `advisor_turn_logs` | Protected request/outcome, content, model, usage, and error details |
| `advisor_events` | Operational events and non-content metadata |

The system retains full saved conversation history. The admin can see user message/response content for review. Deleting a conversation removes its messages and redacts related turn text but retains non-content usage/audit records.

## 9) Open Questions & Risks

| Item | Note / decision needed |
| --- | --- |
| Prompt quality | Private Google Docs can change independently of code; freeze or record their revisions for a controlled demo/evaluation. |
| Token guarantee | A changing free model route and byte-based estimate do not prove an exact actual-token ceiling. A pinned tokenizer/model or provider-side budget would be needed for that stronger claim. |
| Long history | Full stored history is intentional in the current implementation, but can exhaust token/context limits. Future summarization needs a product decision and evaluation of lost context. |
| Analytics scope | Admin lists show recent windows; aggregate reads need rechecking before use with a much larger population. |
| Release order | Apply new SQL migrations before deploying this candidate branch. Local tests and build passed; live Supabase/Vercel state was not changed by this handoff. |
| Project acceptance | Complete the ten-case evaluation and record the live edit, secrecy, ownership, and cap results. The 99% persistence and 100% reopen targets need measured evidence, not only implementation. |
