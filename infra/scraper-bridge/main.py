"""
HTTP bridge for Instant Intel dashboard → Scrapy on the same DigitalOcean droplet.

Recommended layout inside the same clone as InstantIntelProxyScraper:

  /root/scrappingproxy/
    scrapy.cfg
    Rocmob/
    .venv/               # Scrapy virtualenv (python -m scrapy …)
    .env
    scraper-bridge/      # copy infra/scraper-bridge/ here: main.py, requirements.txt, deploy/
      .venv/             # bridge-only deps (fastapi, uvicorn, dotenv)

Setup:

  cd /root/scrappingproxy/scraper-bridge
  python3 -m venv .venv && source .venv/bin/activate
  pip install -r requirements.txt
  export SCRAPER_BRIDGE_SECRET='long-random-string'
  export SCRAPY_PROJECT_DIR=/root/scrappingproxy
  export SCRAPY_PYTHON=/root/scrappingproxy/.venv/bin/python
  uvicorn main:app --host 0.0.0.0 --port 8787

Or systemd: deploy/scraper-bridge.service.example

Loads PROJECT_DIR/.env into the process (without overriding vars already set by systemd),
so subprocess scrapy runs see the same env as: python -m scrapy crawl Livingston
"""

import os
import re
import subprocess
from typing import Dict, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

PROJECT_DIR = os.environ.get("SCRAPY_PROJECT_DIR", "/root/scrappingproxy").rstrip("/")
ENV_FILE = os.environ.get("SCRAPY_ENV_FILE", os.path.join(PROJECT_DIR, ".env"))
PYTHON = os.environ.get("SCRAPY_PYTHON", os.path.join(PROJECT_DIR, ".venv", "bin", "python"))

if os.path.isfile(ENV_FILE):
    load_dotenv(ENV_FILE, override=False)

SECRET = os.environ.get("SCRAPER_BRIDGE_SECRET", "")

app = FastAPI(title="Scraper bridge")


def _subprocess_env() -> Dict[str, str]:
    return {k: str(v) for k, v in os.environ.items() if v is not None}


def _require_bearer(authorization: Optional[str]) -> None:
    if not SECRET:
        raise HTTPException(status_code=503, detail="SCRAPER_BRIDGE_SECRET is not set on the server")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization: Bearer …")
    token = authorization[7:].strip()
    if token != SECRET:
        raise HTTPException(status_code=403, detail="Invalid bridge token")


@app.get("/health")
def health():
    return {"ok": True, "project_dir": PROJECT_DIR}


@app.get("/spiders")
def list_spiders(authorization: Optional[str] = Header(None)):
    _require_bearer(authorization)
    try:
        r = subprocess.run(
            [PYTHON, "-m", "scrapy", "list"],
            cwd=PROJECT_DIR,
            env=_subprocess_env(),
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="scrapy list timed out")
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail=f"Python not found: {PYTHON}")
    if r.returncode != 0:
        err = (r.stderr or r.stdout or "scrapy list failed").strip()
        raise HTTPException(status_code=500, detail=err[:4000])
    spiders = [ln.strip() for ln in r.stdout.splitlines() if ln.strip()]
    return {"spiders": spiders}


class CrawlBody(BaseModel):
    spider: str
    logLevel: str = "INFO"


@app.post("/crawl")
def start_crawl(body: CrawlBody, authorization: Optional[str] = Header(None)):
    _require_bearer(authorization)
    name = (body.spider or "").strip()
    if not re.match(r"^[A-Za-z0-9_]+$", name):
        raise HTTPException(status_code=400, detail="Invalid spider name")
    ll = (body.logLevel or "INFO").strip().upper()
    if ll not in ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"):
        ll = "INFO"
    args = [PYTHON, "-m", "scrapy", "crawl", name, "-s", f"LOG_LEVEL={ll}"]
    try:
        proc = subprocess.Popen(
            args,
            cwd=PROJECT_DIR,
            env=_subprocess_env(),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:2000])
    return {
        "ok": True,
        "spider": name,
        "pid": proc.pid,
        "logLevel": ll,
        "message": "Spider started in background on the droplet (same env as manual scrapy crawl).",
    }
