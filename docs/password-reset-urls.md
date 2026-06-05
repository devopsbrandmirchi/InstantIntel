# Password reset links (Forgot password)

Production uses **`VITE_AUTH_REDIRECT_URL`** on Vercel. No Supabase dashboard change is required for the normal setup.

## Production (Vercel) — required

1. **Vercel → Project → Settings → Environment Variables**

   | Name | Value |
   |------|--------|
   | `VITE_AUTH_REDIRECT_URL` | `https://instant-intel-silk.vercel.app/login` |

   Enable for **Production** (and Preview if you test preview URLs there).

2. **Redeploy** the project after saving the variable.  
   Vite embeds `VITE_*` at **build time**, so a new deployment is required; adding the variable alone does not update an existing build.

3. Request a **new** password-reset email after redeploy. Old emails still contain the previous redirect.

The app passes this URL to Supabase as `redirectTo` when you click **Forgot password** (`src/lib/authRedirectUrl.js`).

## Local development

Copy `.env.example` to `.env` and set:

```env
VITE_AUTH_REDIRECT_URL=http://localhost:3000/login
```

Restart `npm run dev` after changing `.env`.

## If the link still opens localhost

Only then check **Supabase Dashboard → Authentication → URL Configuration**:

| Setting | Suggested value |
|---------|-----------------|
| **Site URL** | `https://instant-intel-silk.vercel.app` |
| **Redirect URLs** | `https://instant-intel-silk.vercel.app/**` |

Supabase may fall back to **Site URL** when the redirect from the email is not allowed. That fallback is often still `http://localhost:3000` from early project setup. Updating Supabase fixes that edge case; it is not part of the default Vercel-only flow.

## How the app uses this

```js
redirectTo: getPasswordResetRedirectUrl()
```

- If `VITE_AUTH_REDIRECT_URL` is set → use it (production on Vercel).
- Otherwise → `window.location.origin` + `/login` (local dev without `.env`).
