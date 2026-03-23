#!/usr/bin/env python3
"""
Run Supabase function public.run_inventory_from_hoot(p_date) from CI.

This mirrors the old Django "delete then insert from hoot_inventory" flow:
- deletes inventorydata rows for target date + eligible clients
- inserts rows from hoot_inventory for same date + eligible clients

Eligibility is enforced inside SQL function:
  is_active=true, active_pull=true, scrap_feed=false, inventory_api non-empty

Environment:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY   (sb_secret_... or legacy service_role JWT)
Optional:
  HOOT_TRANSFER_DATE          YYYY-MM-DD (defaults to today)
"""

from __future__ import annotations

import base64
import json
import os
import sys
from datetime import date
from typing import Optional

from supabase import create_client


def supabase_jwt_role(api_key: str) -> Optional[str]:
    try:
        parts = api_key.strip().split(".")
        if len(parts) != 3:
            return None
        payload_b64 = parts[1]
        pad = "=" * (-len(payload_b64) % 4)
        raw = base64.urlsafe_b64decode(payload_b64 + pad)
        payload = json.loads(raw.decode("utf-8"))
        return payload.get("role")
    except Exception:
        return None


def is_supabase_secret_key(api_key: str) -> bool:
    return api_key.strip().startswith("sb_secret_")


def is_supabase_publishable_key(api_key: str) -> bool:
    return api_key.strip().startswith("sb_publishable_")


def parse_target_date() -> str:
    v = (os.environ.get("HOOT_TRANSFER_DATE") or "").strip()
    if not v:
        return date.today().isoformat()
    # validate YYYY-MM-DD
    date.fromisoformat(v)
    return v


def main() -> None:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        sys.exit(1)

    if is_supabase_publishable_key(key):
        print("Wrong key: publishable key cannot run backend transfer.", file=sys.stderr)
        sys.exit(1)
    role = supabase_jwt_role(key)
    if role == "anon":
        print("Wrong key: anon key cannot run backend transfer.", file=sys.stderr)
        sys.exit(1)
    if is_supabase_secret_key(key):
        print("API key: Supabase secret key (sb_secret_...)")
    elif role == "service_role":
        print("API key: legacy service_role JWT")
    elif role:
        print(f"API key JWT role: {role}")

    target_date = parse_target_date()
    print(f"Run inventory transfer from hoot for date: {target_date}")

    supabase = create_client(url, key)
    res = supabase.rpc("run_inventory_from_hoot", {"p_date": target_date}).execute()
    payload = res.data
    print(f"Function result: {payload}")


if __name__ == "__main__":
    main()
