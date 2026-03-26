# SendGrid webhook — open/click + mc_auto_name only

Inserts into `public.sendgrid_events_autoname` only when:

- `event` is `open` or `click` (case-insensitive), and  
- `mc_auto_name` is non-empty after trim.

All other events in the same POST batch are ignored (reported as `skipped` in the JSON response).

The main `sendgrid-webhook` function should still receive **all** events if you want a full archive in `sendgrid_events`. In SendGrid you can add a **second** Event Webhook URL pointing here.

## Deploy

```bash
supabase functions deploy sendgrid-webhook-autoname --no-verify-jwt
```

## SendGrid URL

`https://<PROJECT_REF>.supabase.co/functions/v1/sendgrid-webhook-autoname`

## Secrets (optional)

| Variable | Behavior |
|----------|----------|
| `SENDGRID_WEBHOOK_AUTONAME_SECRET` | If set, requires `Authorization: Bearer <value>` or `X-Webhook-Secret: <value>`. |
| `SENDGRID_WEBHOOK_SECRET` | Used as fallback if `SENDGRID_WEBHOOK_AUTONAME_SECRET` is not set. |

## Database

Apply migration `20260326100000_sendgrid_events_autoname.sql` before first use.

## Table name

The table is `sendgrid_events_autoname` (SendGrid naming). If you need a different name, rename in the migration and in `index.ts`.
