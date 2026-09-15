# Advisor Console

Advisor Console is a backend rebuild of a Next.js and Supabase chatbot template

The backend supports one advisor, saved conversations, private prompt documents, usage controls and administrator review

## Source

This project derives from the [Next.js AI Chatbot with Supabase](https://github.com/nolly-studio/ai-chatbot-supabase) template

The template supplied the Next.js application, Supabase connection, authentication structure and user interface components

The original template state is saved in commit `476efe2`

The original database migrations remain in `template-reference/template-migrations/`

The project keeps the Apache License 2.0 notice from Vercel

## Backend changes

- Added `/api/health` for a basic service check
- Replaced the template chat schema with advisor-specific tables
- Added profiles with `role` and `is_allowed` access fields
- Added separate conversations and ordered message history
- Added Google sign-in through Supabase Auth
- Added server checks for the session, account access and administrator role
- Added backend routes for conversations and messages
- Added duplicate-request protection for message retries
- Added read-only Google Docs access for the prompt and reference document
- Added a five-minute document cache with a last-valid-cache fallback
- Added keyword selection for relevant reference text
- Added OpenRouter for advisor responses
- Restricted test models to `openrouter/free` and `:free` model values
- Added daily message caps, daily token caps and per-minute rate limits
- Added protected logs for completed, blocked and failed turns
- Added token counts, estimated cost and model data to the turn logs
- Added an administrator endpoint for usage and conversation review
- Added safe error responses for invalid requests and service failures
- Removed direct browser access to conversation and message tables
- Added a temporary chat interface for backend tests

## Backend flow

Supabase Auth creates the user session

The `profiles` table controls application access and the administrator role

The message route checks the session, account access, ownership, duplicate request and usage limits

The server loads the Google Docs content after the usage check

The cache supplies the last valid content if Google Docs does not respond

The grounding module selects reference text that matches the user message

The server sends the private system message and conversation history to OpenRouter

Database functions save the messages, usage totals and turn log in protected transactions

## Main routes

- `GET /api/health` returns the service state
- `GET /api/me` returns the signed-in account and profile
- `GET /api/conversations` returns the user conversation list
- `POST /api/conversations` creates a conversation
- `GET /api/conversations/{id}/messages` returns ordered message history
- `POST /api/conversations/{id}/messages` sends one advisor message
- `GET /api/admin/docs-status` returns document cache status for an administrator
- `GET /api/admin/usage` returns usage and turn data for an administrator

## Database

Current tables:

- `profiles`
- `conversations`
- `messages`
- `advisor_document_cache`
- `usage_counters`
- `advisor_turn_logs`

Current database functions:

- `set_updated_at`
- `handle_new_auth_user`
- `save_fixed_turn`
- `begin_advisor_turn`
- `complete_advisor_turn`
- `fail_advisor_turn`

Apply the files in `supabase/migrations/` to a new Supabase project

Do not apply files in `template-reference/template-migrations/`

The current remote schema was applied through the Supabase SQL Editor

Reconcile its migration history before a future `supabase db push`

## Environment

Use `.env.example` as the variable list

Keep the real values in `.env.local` during local work

Keep `.env.local` outside Git

Server secrets:

- `SUPABASE_SECRET_KEY`
- `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`
- `OPENROUTER_API_KEY`

Server settings:

- `GOOGLE_PROMPT_DOC_ID`
- `GOOGLE_REFERENCE_DOC_ID`
- `GOOGLE_DOC_CACHE_TTL_SECONDS`
- `OPENROUTER_MODEL`
- `ADVISOR_DAILY_MESSAGE_LIMIT`
- `ADVISOR_DAILY_TOKEN_LIMIT`
- `ADVISOR_REQUESTS_PER_MINUTE`

Browser-safe settings:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Local commands

Install the packages:

```bash
pnpm install
```

Start the development server:

```bash
pnpm dev
```

Do the TypeScript check:

```bash
pnpm exec tsc --noEmit --incremental false
```

Create the production build:

```bash
pnpm build
```

## Current state

- Branch: `backend-rebuild`
- Backend build: passed
- Backend tests: passed
- Advisor persona: not selected
- Prompt document: not final
- Reference document: not final
- Persona evaluation: deferred
- Final user interface: outside this backend work
- Deployment: not complete

## Handoff record

The backend handoff guide contains the full setup, API contracts, data structure and edit locations

See `docs/BACKEND_HANDOFF.md`
