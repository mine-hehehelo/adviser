# DeInfluenceMe deployment

- Repository: https://github.com/mine-hehehelo/adviser
- Production branch: `backend-rebuild`
- Vercel project: `goldendelibird0s-projects/deinfluenceme`
- Site: https://deinfluenceme.vercel.app

Pushes to `backend-rebuild` trigger production builds. Other branches create previews.
Environment settings live in Vercel; never commit real credentials. `.env.example` lists the required names. Supabase retains the local callback and allows the production `/auth/callback` URL.

The application still requires approved accounts. Admin tools require an approved profile with the `admin` role, checked on the server.

## Validation

```sh
pnpm build
node --test tests/admin-access.test.cjs tests/robustness.test.cjs
node tests/budget-database.test.cjs
```

Next.js and React use patched stable versions. The old canary-only partial prerendering flag was removed so builds run on stable Next.js.
