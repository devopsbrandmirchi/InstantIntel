# Run Scrapy from the dashboard (Vercel → droplet bridge)

This app triggers spiders on your **DigitalOcean droplet** from **Run spider** in the sidebar (`/scraper-control`). The browser calls **Vercel** (`/api/scraper/*`); Vercel calls a small **HTTP bridge** on the droplet; the bridge runs `python -m scrapy crawl …` in the background.

**Important:** UI-triggered runs do **not** start `systemctl scrapy-spider@…`. Those systemd units are only for timers. Check crawl output under `_bridge_crawl_logs/` on the droplet (see [Logs](#logs-after-a-run)).

---

## Prerequisites

- **InstantIntelProxyScraper** (or equivalent) cloned on the droplet, e.g. `/root/scrappingproxy`, with a working `.venv` and `.env` (Supabase, proxy, etc.).
- **Bridge code** from this repo: `infra/scraper-bridge/` (copy to e.g. `/root/scrappingproxy/scraper-bridge/`).
- **Firewall:** allow inbound TCP on the bridge port (default **8787**) from the internet if Vercel calls the droplet by public IP (or use HTTPS + domain in front).

---

## 1. Bridge secret on the droplet

Create a file readable only by root. Use a **long random string**; do **not** commit it to git.

```bash
sudo nano /etc/scraper-bridge.env
```

Contents (single line):

```bash
SCRAPER_BRIDGE_SECRET=<your-long-random-secret>
```

```bash
sudo chmod 600 /etc/scraper-bridge.env
```

Use the **same** value for **`SCRAPER_BRIDGE_SECRET`** in Vercel (see below).

---

## 2. Point the bridge at your Scrapy project

Defaults in `main.py` (override via environment if your paths differ):

| Variable | Typical value |
|----------|----------------|
| `SCRAPY_PROJECT_DIR` | `/root/scrappingproxy` |
| `SCRAPY_PYTHON` | `/root/scrappingproxy/.venv/bin/python` |

The bridge also loads **`$SCRAPY_PROJECT_DIR/.env`** so spiders see the same variables as manual `scrapy crawl`.

---

## 3. Install the bridge virtualenv

```bash
cd /root/scrappingproxy/scraper-bridge
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

---

## 4. systemd service (recommended)

Copy the example unit and edit if paths differ:

```bash
sudo cp /root/scrappingproxy/scraper-bridge/deploy/scraper-bridge.service.example /etc/systemd/system/scraper-bridge.service
sudo nano /etc/systemd/system/scraper-bridge.service
```

Confirm:

- `WorkingDirectory` → directory that contains `main.py` (e.g. `/root/scrappingproxy/scraper-bridge`)
- `ExecStart` → that venv’s `uvicorn` (e.g. `.../scraper-bridge/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8787`)
- `EnvironmentFile=/root/scrappingproxy/.env`
- `EnvironmentFile=-/etc/scraper-bridge.env`
- `Environment=SCRAPY_PROJECT_DIR=...` and `Environment=SCRAPY_PYTHON=...`

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now scraper-bridge
sudo systemctl status scraper-bridge
```

---

## 5. Quick health check (on the droplet)

```bash
curl -s http://127.0.0.1:8787/health
```

Expected: JSON with `"ok": true` and `project_dir`.

List spiders (replace placeholders):

```bash
curl -s -H "Authorization: Bearer <YOUR_SCRAPER_BRIDGE_SECRET>" "http://127.0.0.1:8787/spiders"
```

From your laptop (public IP or domain, same port):

```bash
curl -s -H "Authorization: Bearer <YOUR_SCRAPER_BRIDGE_SECRET>" "http://<YOUR_DROPLET_IP>:8787/spiders"
```

If you terminate TLS on a domain:

```bash
curl -s -H "Authorization: Bearer <YOUR_SCRAPER_BRIDGE_SECRET>" "https://<your-bridge-hostname>/spiders"
```

A successful response looks like: `{"spiders":["SpiderOne","SpiderTwo",...]}`.

---

## 6. Vercel environment variables

In the Vercel project: **Settings → Environment Variables**.

| Name | Value | Notes |
|------|--------|--------|
| `SCRAPER_BRIDGE_URL` | `http://<YOUR_DROPLET_IP>:8787` or `https://<your-bridge-hostname>` | No trailing slash |
| `SCRAPER_BRIDGE_SECRET` | Same string as `/etc/scraper-bridge.env` | Never use `VITE_*` for this |

Enable for **Production** (and **Preview** if you use preview URLs).

**Supabase (for `/api/scraper/*` admin check):**

- Either keep **`VITE_SUPABASE_URL`** + **`VITE_SUPABASE_ANON_KEY`** (serverless can read them too) and rely on **`get_my_role`**,  
- Or set **`SUPABASE_URL`** + **`SUPABASE_SERVICE_ROLE_KEY`** (server-only).

Redeploy the project after changing variables.

---

## 7. React UI

- **Admin** only: sidebar **Scrapping Reports** → **Run spider** → `/scraper-control`.
- The browser calls **`https://<your-vercel-app>/api/scraper/spiders`** and **`.../crawl`** — not the droplet directly.

---

## Logs after a run

Crawl **stdout/stderr** is written under the Scrapy project directory:

```text
<SCRAPY_PROJECT_DIR>/_bridge_crawl_logs/<SpiderName>-<unix-timestamp>.log
```

Example:

```bash
cd /root/scrappingproxy
ls -lt _bridge_crawl_logs | head
tail -n 80 _bridge_crawl_logs/<newest-file>
```

If `ps` shows no `scrapy` process, the run may have finished quickly or exited on error — use this log file to see why.

---

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| Vercel UI: bridge not configured | `SCRAPER_BRIDGE_URL` and `SCRAPER_BRIDGE_SECRET` set for the right environment; **redeploy** |
| 502 / unreachable from Vercel | Droplet firewall, bridge running (`systemctl status scraper-bridge`), correct IP/port/HTTPS |
| 401 / Admin only | Logged-in user must be **admin**; Supabase env / `get_my_role` |
| Success in UI but no systemd logs | Expected: UI does not use `scrapy-spider@…`; use `_bridge_crawl_logs` |
| Spider list empty / 500 from bridge | Run `scrapy list` manually in `SCRAPY_PROJECT_DIR` with the same venv |

---

## Security notes

- **Rotate** `SCRAPER_BRIDGE_SECRET` if it was ever pasted into chat, tickets, or screenshots.
- Prefer **HTTPS** (reverse proxy) on the droplet instead of raw `http://IP:8787` when possible.
- Never put **`SCRAPER_BRIDGE_SECRET`** or **`SUPABASE_SERVICE_ROLE_KEY`** in `VITE_*` variables (they are exposed to the browser).
