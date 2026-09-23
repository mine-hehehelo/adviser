# DeInfluenceMe deployment

- Repository: https://github.com/mine-hehehelo/adviser
- Production branch: `backend-rebuild`
- Vercel project: `goldendelibird0s-projects/deinfluenceme`
- Site: https://deinfluenceme.vercel.app

Pushes to `backend-rebuild` trigger production builds. Other branches create previews.
Environment settings live in Vercel; never commit real credentials. `.env.example` lists the required names. Supabase retains the local callback and allows the production `/auth/callback` URL.

New registrations automatically receive ordinary chat access after authentication. Apply `supabase/migrations/20260922160000_enable_chat_for_new_users.sql` to enable this default. Existing access flags are preserved; setting `profiles.is_allowed = false` still blocks an account. Admin tools additionally require the `admin` role, checked on the server. Email confirmation, conversation ownership, and usage limits still apply.

Apply `supabase/migrations/20260923090000_delete_advisor_conversation.sql` before deploying the chat-delete API. It removes an owned conversation and its messages, redacts the related turn text, and keeps usage totals and non-content audit records. Deletion waits for any processing turn to finish. The UI starts new chats as drafts and creates a conversation on the first send.

## Validation

```sh
pnpm build
node --test tests/admin-access.test.cjs tests/conversation-api.test.cjs tests/conversation-delete.test.cjs tests/legacy-gate.test.cjs tests/robustness.test.cjs tests/signup-access.test.cjs
node tests/budget-database.test.cjs
```

Next.js and React use patched stable versions. The old canary-only partial prerendering flag was removed so builds run on stable Next.js.
