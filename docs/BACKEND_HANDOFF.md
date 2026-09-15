# Advisor Console Backend Handoff

## Document control

| Item | Value |
|---|---|
| Project | Advisor Console |
| Project folder | `advisor-console` |
| Source template folder | `adviser` |
| Work branch | `backend-rebuild` |
| Source template commit | `476efe2` |
| Git remote | `https://github.com/rajcasillano/adviser.git` |
| Backend state | Production build passed |
| Persona state | Not selected |
| Evaluation state | Deferred |

## Security rules

- Keep `.env.local` outside Git
- Keep all private keys outside the repository
- Put placeholder values in `.env.example`
- Put production secrets in the host settings
- Do not send the system prompt to the browser
- Do not send the reference document to the browser
- Use `SUPABASE_SECRET_KEY` in server files only
- Use `OPENROUTER_API_KEY` in server files only
- Use `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` in server files only

## System boundary

| Part | Current owner | State |
|---|---|---|
| Backend routes | Backend developer | Complete |
| Database schema | Backend developer | Complete |
| Authentication | Backend developer | Complete |
| Google Docs connection | Backend developer | Complete |
| Model connection | Backend developer | Complete |
| Usage controls | Backend developer | Complete |
| Administrator endpoint | Backend developer | Complete |
| Backend test chat | Backend developer | Temporary |
| Final chat interface | Frontend developer | Not complete |
| Final sidebar design | Frontend developer | Not complete |
| Persona prompt | Product team | Deferred |
| Reference document | Product team | Deferred |
| Persona evaluation | Product team | Deferred |
| Deployment | Project team | Deferred |

## Source template

| Area | Source template content | Backend rebuild use |
|---|---|---|
| Framework | Next.js App Router and React | Kept |
| Interface | Tailwind CSS and shadcn components | Kept for the frontend |
| Authentication | Supabase Auth and email login | Kept and extended |
| Model access | Vercel AI SDK and OpenAI | Replaced for the advisor route |
| Chat storage | `chats` and template `messages` data | Replaced |
| Chat route | `app/(chat)/api/chat/route.ts` | Obsolete for the rebuild |
| Chat component | `components/custom/chat.tsx` | Obsolete for the rebuild |
| Database code | `db/` and template Supabase types | Obsolete for the rebuild |
| Extra functions | Files, documents, suggestions and votes | Outside the advisor scope |
| Template migrations | 12 migration files | Moved to `template-reference/template-migrations/` |

## Backend change record

| Checkpoint | Commit | Change | Files | Result |
|---|---|---|---|---|
| 0 | `476efe2` | Saved the source template | Full repository | Set the comparison point |
| 1 | `136c3be` | Added the health route | `app/api/health/route.ts` | Added a service check |
| 2 | `d99e8e7` | Added the advisor schema | Core migration and database types | Added profiles, conversations, messages, relationships and policies |
| 3 | `8b2ff7f` | Added protected server access | Auth, administrator client, errors and API routes | Added session checks and account access checks |
| 4 | `8b2ff7f` | Connected Google login | Login button and existing callback route | Added Supabase Google OAuth |
| 5 | `8b2ff7f` | Added conversation routes | `app/api/conversations/route.ts` | Added conversation list and create actions |
| 6 | `8b2ff7f` | Added message routes | Message route and database function | Added history, message save and duplicate protection |
| 7 | `bd38209` | Added the backend test interface | Test chat and sidebar files | Added basic backend access for tests |
| 8 | `9f7b0fe` | Added Google Docs access | Document, cache and grounding files | Added prompt load, cache and keyword selection |
| 9 | `ad60414` | Added OpenRouter | Model client and message route | Replaced the temporary response |
| 9A | `5752306` | Restricted test models | `lib/server/openrouter.ts` | Allowed `openrouter/free` and `:free` models |
| 10 | `b111a8e` | Added usage controls | Usage files, route changes and migrations | Added caps, rate limits, logs and cost data |
| 11 | `d50d1c1` | Added administrator usage access | `app/api/admin/usage/route.ts` | Added usage and conversation review data |
| 12 | `4078918` | Added reliability responses | Error, document and environment files | Added safe `400` and `503` responses |
| 12A | `4078918` | Removed direct browser data access | Access migration | Made the protected API the data path |

## Request flow

### Sign-in flow

1. Select **Continue with Google**
2. Send the user to Supabase Auth
3. Send the user to Google OAuth
4. Return the OAuth code to `/auth/callback`
5. Exchange the code for a Supabase session
6. Create or update the `profiles` row
7. Read `is_allowed` before protected backend work
8. Read `role` before administrator work

### Message flow

1. Send `POST /api/conversations/{id}/messages`
2. Check the Supabase session
3. Check `profiles.is_allowed`
4. Check the request data
5. Check conversation ownership
6. Check the request identifier
7. Load the conversation history
8. Call `begin_advisor_turn`
9. Block the request if a limit applies
10. Load the prompt and reference documents
11. Select the reference text for the user message
12. Assemble the system message on the server
13. Send the request to OpenRouter
14. Call `complete_advisor_turn`
15. Save both messages in one database transaction
16. Update the usage counter
17. Update the turn log
18. Return the assistant reply

### Failure flow

1. Reserve the request with `begin_advisor_turn`
2. Call the document service or model service
3. Call `fail_advisor_turn` if the request fails
4. Save the failure code in `advisor_turn_logs`
5. Do not save partial messages
6. Return a safe error to the browser

### Document flow

1. Read `advisor_document_cache`
2. Return the cache if its age is less than the time limit
3. Read both Google Docs if the cache is old
4. Save the new document text in the cache
5. Return the old cache if Google Docs fails
6. Return `503` if Google Docs fails and no cache exists
7. Do not call OpenRouter after the `503` response

## Main file map

| File | Function |
|---|---|
| `app/api/health/route.ts` | Service check |
| `app/api/me/route.ts` | Current account and profile data |
| `app/api/conversations/route.ts` | Conversation list and create actions |
| `app/api/conversations/[id]/messages/route.ts` | History and advisor messages |
| `app/api/admin/docs-status/route.ts` | Administrator document status |
| `app/api/admin/usage/route.ts` | Administrator usage data |
| `app/auth/callback/route.ts` | OAuth code exchange |
| `lib/server/auth.ts` | Session, account and administrator checks |
| `lib/server/errors.ts` | Safe HTTP responses |
| `lib/server/google-docs.ts` | Google Docs load and cache logic |
| `lib/server/grounding.ts` | Keyword selection and text chunks |
| `lib/server/advisor-docs.ts` | Private system-message assembly |
| `lib/server/openrouter.ts` | OpenRouter request and usage data |
| `lib/server/usage-limits.ts` | Limit values from the environment |
| `lib/supabase/admin.ts` | Protected Supabase client |
| `lib/supabase/database.types.ts` | Generated database types |
| `components/custom/backend-test-chat.tsx` | Temporary backend interface |
| `components/custom/sidebar-history.tsx` | Conversation list example |
| `components/custom/app-sidebar.tsx` | New conversation example |
| `supabase/migrations/` | Current database changes |
| `template-reference/template-migrations/` | Source template reference only |

## Environment variables

| Name | Exposure | Value source | Function |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Browser safe | Local or deployed app URL | Sets the site URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser safe | Supabase project settings | Connects the Supabase client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser safe | Supabase project settings | Starts browser Auth requests |
| `SUPABASE_SECRET_KEY` | Server secret | Supabase project settings | Runs protected database work |
| `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | Server secret | Google Cloud key | Authenticates the Docs client |
| `GOOGLE_PROMPT_DOC_ID` | Server data | Prompt document URL | Selects the prompt document |
| `GOOGLE_REFERENCE_DOC_ID` | Server data | Reference document URL | Selects the reference document |
| `GOOGLE_DOC_CACHE_TTL_SECONDS` | Server data | Team value | Sets the cache time |
| `OPENROUTER_API_KEY` | Server secret | OpenRouter account | Authenticates model requests |
| `OPENROUTER_MODEL` | Server data | OpenRouter model list | Selects the model route |
| `ADVISOR_DAILY_MESSAGE_LIMIT` | Server data | Team value | Sets the daily message cap |
| `ADVISOR_DAILY_TOKEN_LIMIT` | Server data | Team value | Sets the daily token cap |
| `ADVISOR_REQUESTS_PER_MINUTE` | Server data | Team value | Sets the rate limit |

### Current default values

```text
GOOGLE_DOC_CACHE_TTL_SECONDS=300
OPENROUTER_MODEL=openrouter/free
ADVISOR_DAILY_MESSAGE_LIMIT=20
ADVISOR_DAILY_TOKEN_LIMIT=50000
ADVISOR_REQUESTS_PER_MINUTE=5
```

## Local setup

### Requirements

- Node.js 18 or later
- pnpm
- Git
- A Supabase project
- A Google Cloud project
- 2 shared Google Docs
- An OpenRouter key

### Procedure

1. Clone the repository

```bash
git clone <repository-url>
cd advisor-console
```

2. Install the packages

```bash
pnpm install
```

3. Copy the environment example

```bash
cp .env.example .env.local
```

4. Replace each placeholder in `.env.local`

5. Start the development server

```bash
pnpm dev
```

6. Open the health route

```text
http://localhost:3000/api/health
```

7. Confirm this result

```json
{
  "ok": true,
  "service": "advisor-console",
  "time": "<ISO timestamp>"
}
```

8. Open the application

```text
http://localhost:3000
```

9. Do a production build check

```bash
pnpm build
```

## Database setup

### Current Supabase project

- The tables and functions already exist
- SQL Editor applied the current schema
- The remote migration history can differ from the local migration list
- Do not run the migration files again on this project
- Reconcile the migration history before a future `supabase db push`

### New Supabase project

1. Install the Supabase command-line interface

2. Log in to Supabase

```bash
supabase login
```

3. Link the new project

```bash
supabase link --project-ref <project-reference>
```

4. Apply these files in this sequence

```text
supabase/migrations/20260912093850_core_advisor_schema.sql
supabase/migrations/20260912144049_save_fixed_turn.sql
supabase/migrations/20260913155851_advisor_document_cache.sql
supabase/migrations/20260914070000_usage_controls.sql
supabase/migrations/20260914080000_usage_control_functions.sql
supabase/migrations/20260915090000_restrict_browser_data_access.sql
```

5. Preview the migration work

```bash
supabase db push --dry-run
```

6. Apply the migration files

```bash
supabase db push
```

7. Generate the database types

```bash
supabase gen types typescript --linked > lib/supabase/database.types.ts
```

IMPORTANT: Do not apply files from `template-reference/template-migrations/`

## Database schema

| Table | Main fields | Function |
|---|---|---|
| `profiles` | `id`, `email`, `display_name`, `role`, `is_allowed` | Stores application access data |
| `conversations` | `id`, `user_id`, `title`, timestamps | Stores one conversation header |
| `messages` | `conversation_id`, `request_id`, `sequence`, `role`, `content`, usage data | Stores visible conversation messages |
| `advisor_document_cache` | `cache_key`, document text, `fetched_at` | Stores the last valid Docs content |
| `usage_counters` | `user_id`, `usage_day`, message, token and cost totals | Stores daily usage |
| `advisor_turn_logs` | Request, response, status, model, usage and error fields | Stores the protected turn record |

### Database functions

| Function | Function result |
|---|---|
| `set_updated_at` | Updates an `updated_at` value |
| `handle_new_auth_user` | Creates or updates a profile after Auth changes |
| `save_fixed_turn` | Saves one user message and one assistant message |
| `begin_advisor_turn` | Checks ownership, duplicates and usage limits |
| `complete_advisor_turn` | Saves messages, usage data and the completed log |
| `fail_advisor_turn` | Changes a reserved turn to `failed` |

### Message usage fields

| Field | Stored value |
|---|---|
| User `token_count` | Full provider prompt tokens for the turn |
| Assistant `token_count` | Provider completion tokens for the turn |
| Assistant `est_cost_usd` | Provider cost for the full turn |

### Access model

| Role | Browser table access | Backend route access |
|---|---|---|
| Signed-out user | None | Health route only |
| Signed-in blocked user | Own profile row | No advisor route access |
| Signed-in allowed user | Own profile row | Conversation and message routes |
| Administrator | Own profile row | Administrator routes |
| Service role | Protected server access | Server files only |

IMPORTANT: Read conversation and message data through the protected API

## Account access

### Allow a user

1. Open **Supabase Dashboard**

2. Open **SQL Editor**

3. Replace the email value

4. Run this statement

```sql
update public.profiles
set is_allowed = true
where email = '<user-email>';
```

### Set an administrator

1. Replace the email value

2. Run this statement

```sql
update public.profiles
set
  role = 'admin',
  is_allowed = true
where email = '<administrator-email>';
```

### Check account access

```sql
select
  id,
  email,
  display_name,
  role,
  is_allowed
from public.profiles
order by created_at;
```

## Google OAuth setup

### Google Cloud

1. Open **Google Auth Platform**

2. Create a Web application OAuth client

3. Add the local origin

```text
http://localhost:3000
```

4. Add the deployed origin after deployment

```text
https://<application-domain>
```

5. Add the Supabase callback URL

```text
https://<project-reference>.supabase.co/auth/v1/callback
```

6. Copy the client identifier and client secret

### Supabase

1. Open **Authentication**

2. Open **Sign In and Providers**

3. Open **Google**

4. Enable Google

5. Enter the Google client identifier

6. Enter the Google client secret

7. Save the provider

8. Open **URL Configuration**

9. Set the local Site URL during local work

```text
http://localhost:3000
```

10. Add the local redirect URL

```text
http://localhost:3000/auth/callback
```

11. Add the deployed callback URL after deployment

```text
https://<application-domain>/auth/callback
```

## Google Docs setup

1. Enable the Google Docs API

2. Create a Google Cloud service account

3. Create one JSON key for the service account

4. Keep the JSON key outside the repository

5. Copy the base64 value to the clipboard on macOS

```bash
base64 -i <service-account-key-file>.json | tr -d '\n' | pbcopy
```

6. Put the value in `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`

7. Share the prompt Google Doc with the service account email

8. Give the service account Viewer access

9. Share the reference Google Doc with the same account

10. Give the service account Viewer access

11. Copy each document identifier from its URL

```text
https://docs.google.com/document/d/<document-id>/edit
```

12. Set `GOOGLE_PROMPT_DOC_ID`

13. Set `GOOGLE_REFERENCE_DOC_ID`

14. Set `GOOGLE_DOC_CACHE_TTL_SECONDS=300`

15. Sign in with an administrator account

16. Open the status route

```text
http://localhost:3000/api/admin/docs-status
```

17. Confirm these fields

```json
{
  "ok": true,
  "documentSource": "google",
  "documentsFetchedAt": "<ISO timestamp>"
}
```

Valid `documentSource` values:

- `google`
- `cache`
- `stale-cache`

## Prompt and reference documents

| Item | Edit location | Code change | Deployment |
|---|---|---|---|
| Advisor role | Prompt Google Doc | None | None |
| Advisor limits | Prompt Google Doc | None | None |
| Response format | Prompt Google Doc | None | None |
| Voice rules | Reference Google Doc | None | None |
| Approved facts | Reference Google Doc | None | None |
| Product terms | Reference Google Doc | None | None |

### Prompt document minimum content

- Advisor name
- Advisor role
- Target user
- Supported tasks
- Unsupported tasks
- Response rules
- Safety rules
- Private-data rules

### Reference document minimum content

- Voice and tone
- Approved principles
- Approved facts
- Terms and definitions
- Required response patterns
- Prohibited claims

## Grounding controls

| Setting | File | Current value |
|---|---|---|
| Maximum chunk size | `lib/server/grounding.ts` | `1000` characters |
| Maximum selected chunks | `lib/server/grounding.ts` | `2` |
| Stop words | `lib/server/grounding.ts` | `STOP_WORDS` set |
| No keyword match | `lib/server/grounding.ts` | First chunk |

## OpenRouter setup

1. Create an OpenRouter key

2. Put the key in `OPENROUTER_API_KEY`

3. Use the free model route during tests

```text
OPENROUTER_MODEL=openrouter/free
```

4. Restart the development server after an environment change

5. Send a message through the test chat

Current model controls:

| Control | File | Current value |
|---|---|---|
| API route | `lib/server/openrouter.ts` | `/api/v1/chat/completions` |
| Temperature | `lib/server/openrouter.ts` | `0.4` |
| Maximum completion tokens | `lib/server/openrouter.ts` | `500` |
| Request timeout | `lib/server/openrouter.ts` | `60` seconds |
| Allowed model values | `lib/server/openrouter.ts` | `openrouter/free` or a `:free` model |

IMPORTANT: The free model route can select a different model for each request

IMPORTANT: Free models can have low limits and low availability

## API contracts

### `GET /api/health`

Authentication:

- None

Response status:

- `200`

Response:

```json
{
  "ok": true,
  "service": "advisor-console",
  "time": "<ISO timestamp>"
}
```

### `GET /api/me`

Authentication:

- Supabase session cookie

Response status:

- `200`
- `401`
- `500`

Response:

```json
{
  "userId": "<user-uuid>",
  "email": "<email>",
  "profile": {
    "email": "<email>",
    "display_name": "<name-or-null>",
    "role": "user",
    "is_allowed": true
  }
}
```

### `GET /api/conversations`

Authentication:

- Allowed Supabase user

Response status:

- `200`
- `401`
- `403`
- `500`

Response:

```json
{
  "conversations": [
    {
      "id": "<conversation-uuid>",
      "title": "New advisor conversation",
      "created_at": "<ISO timestamp>",
      "updated_at": "<ISO timestamp>"
    }
  ]
}
```

### `POST /api/conversations`

Authentication:

- Allowed Supabase user

Request:

```json
{
  "title": "Optional title with 1 to 120 characters"
}
```

Response status:

- `201`
- `400`
- `401`
- `403`
- `500`

Response:

```json
{
  "conversation": {
    "id": "<conversation-uuid>",
    "title": "Optional title with 1 to 120 characters",
    "created_at": "<ISO timestamp>",
    "updated_at": "<ISO timestamp>"
  }
}
```

### `GET /api/conversations/{id}/messages`

Authentication:

- Allowed owner of the conversation

Response status:

- `200`
- `401`
- `403`
- `404`
- `500`

Response:

```json
{
  "conversation": {
    "id": "<conversation-uuid>",
    "title": "<title>",
    "user_id": "<user-uuid>"
  },
  "messages": [
    {
      "id": "<message-uuid>",
      "request_id": "<request-uuid>",
      "sequence": 1,
      "role": "user",
      "content": "<message-text>",
      "status": "completed",
      "created_at": "<ISO timestamp>"
    }
  ]
}
```

### `POST /api/conversations/{id}/messages`

Authentication:

- Allowed owner of the conversation

Request:

```json
{
  "requestId": "<new-uuid>",
  "text": "Message with 1 to 4000 characters"
}
```

Client rule:

```ts
const requestId = crypto.randomUUID()
```

Response status:

- `200`
- `400`
- `401`
- `403`
- `404`
- `409`
- `429`
- `500`
- `502`
- `503`

Response:

```json
{
  "requestId": "<request-uuid>",
  "reply": "<assistant-response>",
  "saved": {
    "duplicate": false,
    "user_message_id": "<message-uuid>",
    "assistant_message_id": "<message-uuid>",
    "status": "completed"
  }
}
```

Limit response:

```json
{
  "error": "<user-message>",
  "code": "message_cap",
  "retryAfterSeconds": null
}
```

Valid limit codes:

- `message_cap`
- `token_cap`
- `rate_limit`

### `GET /api/admin/docs-status`

Authentication:

- Allowed administrator

Response status:

- `200`
- `401`
- `403`
- `503`
- `500`

Response:

```json
{
  "ok": true,
  "documentSource": "cache",
  "documentsFetchedAt": "<ISO timestamp>"
}
```

### `GET /api/admin/usage`

Authentication:

- Allowed administrator

Query fields:

| Field | Format | Default |
|---|---|---|
| `day` | `YYYY-MM-DD` | Current Manila day |
| `limit` | Integer from `1` to `100` | `25` |

Example:

```text
/api/admin/usage?day=2026-09-15&limit=25
```

Response status:

- `200`
- `400`
- `401`
- `403`
- `500`

Response fields:

| Field | Content |
|---|---|
| `day` | Selected Manila day |
| `generatedAt` | Response time |
| `totals` | User, message, token and cost totals |
| `users` | Usage for each user |
| `recentConversations` | Recent conversation headers |
| `recentTurns` | Request, response, model, status, usage and error data |

## Error responses

| Status | Meaning | Typical cause |
|---|---|---|
| `400` | Invalid request | Invalid JSON, UUID, text or query value |
| `401` | Authentication needed | No valid Supabase session |
| `403` | Access denied | Blocked user or non-administrator |
| `404` | Conversation not found | Invalid identifier or different owner |
| `409` | Request conflict | Duplicate request still runs or failed before |
| `429` | Usage blocked | Daily cap, rate limit or provider limit |
| `500` | Server error | Database or configuration fault |
| `502` | Model service error | OpenRouter error or timeout |
| `503` | Document service error | No Google Docs data and no cache |

Error body:

```json
{
  "error": "<safe-error-message>"
}
```

## Frontend connection

### List conversations

```ts
const response = await fetch('/api/conversations')
const body = await response.json()

if (!response.ok) {
  throw new Error(body.error)
}

const conversations = body.conversations
```

### Create a conversation

```ts
const response = await fetch('/api/conversations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    title: 'New advisor conversation',
  }),
})

const body = await response.json()
```

### Load message history

```ts
const response = await fetch(
  `/api/conversations/${conversationId}/messages`
)

const body = await response.json()
const messages = body.messages
```

### Send a message

```ts
const response = await fetch(
  `/api/conversations/${conversationId}/messages`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requestId: crypto.randomUUID(),
      text,
    }),
  }
)

const body = await response.json()

if (!response.ok) {
  throw new Error(body.error)
}
```

### Resume a conversation

1. Read `GET /api/conversations`
2. Show each conversation title
3. Route a selection to `/chat/{conversationId}`
4. Read `GET /api/conversations/{id}/messages`
5. Show messages by `sequence`
6. Send the next message to the same conversation identifier

### Frontend rules

- Create one request UUID for each user submit action
- Keep the same request UUID for a network retry
- Do not create a new UUID for an automatic retry
- Show the server `error` value to the user
- Use `Retry-After` for a rate-limit wait
- Refresh conversation history after a successful send
- Refresh the conversation list after a new message
- Do not call the obsolete template chat route
- Do not query protected tables from browser code

## Edit locations

| Change | Edit location |
|---|---|
| Advisor role | Prompt Google Doc |
| Advisor facts | Reference Google Doc |
| Cache time | `GOOGLE_DOC_CACHE_TTL_SECONDS` |
| Daily message cap | `ADVISOR_DAILY_MESSAGE_LIMIT` |
| Daily token cap | `ADVISOR_DAILY_TOKEN_LIMIT` |
| Rate limit | `ADVISOR_REQUESTS_PER_MINUTE` |
| Free model route | `OPENROUTER_MODEL` |
| Model temperature | `lib/server/openrouter.ts` |
| Output token limit | `lib/server/openrouter.ts` |
| Grounding chunk size | `lib/server/grounding.ts` |
| Grounding chunk count | `lib/server/grounding.ts` |
| API request rules | Applicable file in `app/api/` |
| Authentication rules | `lib/server/auth.ts` |
| Database structure | A new file in `supabase/migrations/` |
| Database types | `lib/supabase/database.types.ts` |
| Test chat | `components/custom/backend-test-chat.tsx` |
| Sidebar example | `components/custom/sidebar-history.tsx` |
| New conversation action | `components/custom/app-sidebar.tsx` |
| Final user interface | Frontend files selected by the frontend developer |
| Administrator interface | New frontend page for `/api/admin/usage` |

## Completed checks

| Check | Result |
|---|---|
| Health route | Pass |
| Google login | Pass |
| Profile creation | Pass |
| Allowed-user check | Pass |
| Conversation create and list | Pass |
| Message save | Pass |
| Conversation separation | Pass |
| Duplicate request protection | Pass |
| Second-account isolation | Pass |
| Google Docs read | Pass |
| Five-minute cache | Pass |
| Last-valid-cache fallback | Pass |
| OpenRouter response | Pass |
| Daily message cap | Pass |
| Daily token cap | Pass |
| Per-minute rate limit | Pass |
| Turn usage log | Pass |
| Administrator usage route | Pass |
| Administrator role check | Pass |
| Provider failure response | Pass |
| No-cache document failure | Pass |
| Invalid request response | Pass |
| Malformed JSON response | Pass |
| Direct browser data access removed | Pass |
| Production build | Pass |

## Deferred work

| Item | Owner | Start condition |
|---|---|---|
| Select the advisor persona | Product team | Product decision |
| Write the prompt document | Product team | Persona selected |
| Write the reference document | Product team | Persona selected |
| Do the live Doc edit check | Backend and product team | Documents complete |
| Run 8 to 10 evaluation prompts | Product team | Documents complete |
| Record grounding results | Product team | Evaluation complete |
| Add the final chat interface | Frontend developer | Backend handoff complete |
| Add the final sidebar design | Frontend developer | Backend handoff complete |
| Add the administrator page | Frontend developer | API design accepted |
| Reconcile Supabase migration history | Backend developer | Before the next database push |
| Configure the Git remote | Project team | GitHub repository available |
| Push `backend-rebuild` | Backend developer | Git remote configured |
| Configure Vercel | Project team | Live deployment needed |

## Final repository steps

1. Do a check of the worktree

```bash
git status --short
```

2. Do the type check

```bash
pnpm exec tsc --noEmit --incremental false
```

3. Do the production build

```bash
pnpm build
```

4. Add the backend files

```bash
git add .
```

5. Check that `.env.local` is not staged

```bash
git status --short
```

6. Create the final backend commit

```bash
git commit -m "Complete Advisor Console backend handoff"
```

7. Add a Git remote if the project has no remote

```bash
git remote add origin <github-repository-url>
```

8. Push the backend branch

```bash
git push -u origin backend-rebuild
```

## Vercel handoff

1. Import the GitHub repository into Vercel
2. Select the Next.js framework
3. Open **Project Settings**
4. Open **Environment Variables**
5. Add each environment variable by name
6. Enter the production value for each variable
7. Mark each server secret as sensitive when this control is available
8. Set `NEXT_PUBLIC_SITE_URL` to the deployed URL
9. Do not upload `.env.local`
10. Select the applicable Vercel environment
11. Deploy the branch
12. Add the deployed URL to Supabase URL Configuration
13. Add the deployed callback URL to Supabase URL Configuration
14. Add the deployed origin to the Google OAuth client
15. Start a new deployment after each environment change

## Source links

- Supabase Google sign-in: <https://supabase.com/docs/guides/auth/social-login/auth-google>
- Supabase redirect URLs: <https://supabase.com/docs/guides/auth/redirect-urls>
- Supabase migration workflow: <https://supabase.com/docs/guides/local-development/cli-workflows>
- Google service accounts: <https://developers.google.com/identity/protocols/oauth2/service-account>
- OpenRouter free model route: <https://openrouter.ai/docs/cookbook/get-started/free-models-router-playground>
- Vercel environment variables: <https://vercel.com/docs/environment-variables>
