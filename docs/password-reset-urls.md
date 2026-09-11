# Password reset links (Forgot password)

Production is configured with **Vercel** (`VITE_AUTH_REDIRECT_URL`) and **Supabase** redirect allow list.

## Production setup (done)

| Where | Setting | Value |
|-------|---------|--------|
| **Vercel** → Environment Variables | `VITE_AUTH_REDIRECT_URL` | `https://instant-intel-silk.vercel.app/login` |
| **Supabase** → Authentication → URL Configuration → Redirect URLs | allow list | `https://instant-intel-silk.vercel.app/**` |

After changing Vercel env vars, **redeploy** so the new `VITE_*` value is baked into the build.

Request a **new** password-reset email after deploy — old emails keep the previous redirect.

## Local development

Copy `.env.example` to `.env` and set:

```env
VITE_AUTH_REDIRECT_URL=http://localhost:3000/login
```

Restart `npm run dev` after changing `.env`.

Optional for local reset emails: add `http://localhost:3000/**` to the same Supabase **Redirect URLs** list.

## If the link still misbehaves

Confirm **Supabase → Site URL** is not still `http://localhost:3000`. Set it to `https://instant-intel-silk.vercel.app` if needed.

## How the app uses this

```js
redirectTo: getPasswordResetRedirectUrl()
```

- If `VITE_AUTH_REDIRECT_URL` is set → use it (production on Vercel).
- Otherwise → `window.location.origin` + `/login` (local dev without `.env`).
