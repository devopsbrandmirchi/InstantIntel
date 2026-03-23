#!/usr/bin/env python3
"""
Fetch Hoot inventory CSV per client (clients.inventory_api), apply the same
custom-type / lookup rules as the Django job, upsert into public.hoot_inventory.

Environment:
  SUPABASE_URL                 Project URL (https://xxx.supabase.co)
  SUPABASE_SERVICE_ROLE_KEY    Service role key (bypasses RLS; required for inserts)

Optional:
  HOOT_ACTIVE_PULL_ONLY=1      Only clients with active_pull=true and scrap_feed=false
  HOOT_CHUNK_SIZE=300        Rows per upsert request
  DOTENV_PATH                  Path to .env file (default: same dir as this script)

Usage:
  python hoot_inventory_import.py
  python hoot_inventory_import.py --client-id 43
  python hoot_inventory_import.py --dry-run
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import traceback
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from dotenv import load_dotenv
from supabase import Client, create_client


def supabase_jwt_role(api_key: str) -> Optional[str]:
    """Read JWT `role` claim (anon vs service_role). No crypto verify — local hint only."""
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


# ---------------------------------------------------------------------------
# CSV columns (order must match Django pandas DataFrame)
# ---------------------------------------------------------------------------

HOOT_CSV_COLUMNS = [
    "Condition",
    "Year",
    "Make",
    "Model",
    "VIN",
    "Advertiser Name",
    "Color",
    "Description",
    "Doors",
    "Drivetrain",
    "Formatted Price",
    "Fuel Type",
    "Image Type",
    "Image URL",
    "Location",
    "Mileage",
    "Price",
    "Title",
    "Transmission",
    "Trim",
    "Type",
    "URL",
    "Vehicle Type",
    "make_lower",
    "model_lower",
    "custom_label_0",
    "custom_label_1",
    "custom_label_2",
    "custom_label_3",
    "custom_label_4",
    "RV_type",
    "RV Category",
    "RV_class",
    "Category",
    "RV Type",
    "Motorhome Class",
    "RV_Type",
]

MIN_COLS = 37


def cell_str(x: Any) -> str:
    if x is None:
        return ""
    if isinstance(x, float) and pd.isna(x):
        return ""
    s = str(x).strip()
    if s.lower() == "nan":
        return ""
    return s


def trunc(s: Optional[str], n: int = 255) -> Optional[str]:
    if s is None:
        return None
    s = str(s).strip()
    if not s:
        return None
    return s if len(s) <= n else s[:n]


def normalize_row(raw: List[Any]) -> List[str]:
    out: List[str] = []
    for x in raw:
        out.append(cell_str(x))
    while len(out) < MIN_COLS:
        out.append("")
    return out[:MIN_COLS]


# ---------------------------------------------------------------------------
# Lookup loaders (custommaketext / custom_make_text, etc.)
# ---------------------------------------------------------------------------

LOOKUP_MAKE = ("custommaketext", "custom_make_text")
LOOKUP_TYPE = ("customtypetext", "custom_type_text")
LOOKUP_COND = ("customconditiontext", "custom_condition_text")


def _fetch_all_table(supabase: Client, names: Tuple[str, ...], cols: str) -> List[dict]:
    last_err: Optional[Exception] = None
    for name in names:
        try:
            r = supabase.table(name).select(cols).execute()
            if r.data is not None:
                return list(r.data)
        except Exception as e:
            last_err = e
            continue
    if last_err:
        raise last_err
    return []


def get_custom_make_dictionary(supabase: Client) -> Dict[str, str]:
    rows = _fetch_all_table(supabase, LOOKUP_MAKE, "make_text,custom_make_text")
    return {str(r["make_text"]).lower(): str(r["custom_make_text"]) for r in rows if r.get("make_text")}


def get_custom_type_dictionary(supabase: Client) -> Dict[str, str]:
    rows = _fetch_all_table(supabase, LOOKUP_TYPE, "type_text,custom_type_text")
    return {str(r["type_text"]).lower(): str(r["custom_type_text"]) for r in rows if r.get("type_text")}


def get_custom_condition_dictionary(supabase: Client) -> Dict[str, str]:
    rows = _fetch_all_table(supabase, LOOKUP_COND, "condition_text,custom_condition_text")
    return {
        str(r["condition_text"]).lower(): str(r["custom_condition_text"])
        for r in rows
        if r.get("condition_text")
    }


def get_custom_model_trim_dict(supabase: Client) -> Dict[Tuple[str, str, str], Tuple[str, str]]:
    rows = _fetch_all_table(supabase, ("custom_model_trim",), "model,trim,title,custom_model,custom_trim")
    out: Dict[Tuple[str, str, str], Tuple[str, str]] = {}
    for r in rows:
        m = (r.get("model") or "").strip().lower()
        t = (r.get("trim") or "").strip().lower()
        ti = (r.get("title") or "").strip().lower()
        out[(m, t, ti)] = (str(r.get("custom_model") or ""), str(r.get("custom_trim") or ""))
    return out


def choose_custom_make(make: Optional[str], custom_make_dictionary: Dict[str, str]) -> Optional[str]:
    if make in (None, ""):
        return None
    key = make.lower()
    return custom_make_dictionary.get(key, "") or None


def normalise_custom_type(type_val: Optional[str], dictionary: Dict[str, str]) -> Optional[str]:
    if type_val in (None, ""):
        return None
    key = type_val.lower()
    return dictionary.get(key, "") or None


def normalise_custom_condition(condition: Optional[str], dictionary: Dict[str, str]) -> Optional[str]:
    if condition in (None, ""):
        return None
    key = condition.lower()
    return dictionary.get(key, "") or None


def normalise_custom_model_trim(
    the_model: Any,
    the_trim: Any,
    the_title: Any,
    custom_model_trim_dict: Dict[Tuple[str, str, str], Tuple[str, str]],
) -> Tuple[str, str]:
    key = (
        (the_model or "").strip().lower(),
        (the_trim or "").strip().lower(),
        (the_title or "").strip().lower(),
    )
    if key in custom_model_trim_dict:
        return custom_model_trim_dict[key]
    return "", ""


def choose_custom_type(customer_id: int, d: List[str]) -> str:
    """Port of Django choose_custom_type — first matching branch wins (duplicate customer_id keys in Django were dead code)."""
    ct = ""

    if customer_id == 87:
        ct = d[25]
    elif customer_id == 54:
        ct = d[25]
    elif customer_id == 95:
        ct = d[25]
    elif customer_id == 111:
        ct = d[25]
    elif customer_id == 113:
        ct = d[25]

    elif customer_id == 57:
        ct = d[26]
    elif customer_id == 32:
        ct = d[26]
    elif customer_id == 33:
        ct = d[26]
    elif customer_id == 40:
        ct = d[26]

    elif customer_id == 74:
        ct = d[26]
    elif customer_id == 76:
        ct = d[26]

    elif customer_id == 89:
        ct = d[26]
    elif customer_id == 77:
        ct = d[26]
    elif customer_id == 93:
        ct = d[26]
    elif customer_id == 101:
        ct = d[26]
    elif customer_id == 112:
        ct = d[26]
    elif customer_id == 114:
        ct = d[26]
    elif customer_id == 115:
        ct = d[26]
    elif customer_id == 117:
        ct = d[26]
    elif customer_id == 118:
        ct = d[26]
    elif customer_id == 119:
        ct = d[26]

    elif customer_id == 42:
        ct = d[27]
    elif customer_id == 94:
        ct = d[27]
    elif customer_id == 97:
        ct = d[27]
    elif customer_id == 98:
        ct = d[27]

    elif customer_id == 72:
        if d[27]:
            ct = f"{d[26]} {d[27]}"
        else:
            ct = d[26]

    elif customer_id == 67:
        ct = d[20]
    elif customer_id == 43:
        ct = d[20]
    elif customer_id == 80:
        ct = d[20]
    elif customer_id == 96:
        ct = d[20]
    elif customer_id == 116:
        ct = d[20]
    elif customer_id == 120:
        ct = d[20]

    elif customer_id == 37:
        ct = d[20]
    elif customer_id == 50:
        ct = d[20]
    elif customer_id == 70:
        ct = d[20]
    elif customer_id == 88:
        if d[35]:
            ct = f"{d[20]} {d[35]}"
        else:
            ct = d[20]
    elif customer_id == 81:
        ct = d[20]
    elif customer_id == 91:
        ct = d[20]
    elif customer_id == 92:
        ct = d[20]
    elif customer_id == 99:
        ct = d[20]
    elif customer_id == 100:
        ct = d[20]
    elif customer_id == 102:
        ct = d[20]
    elif customer_id == 103:
        ct = d[20]
    elif customer_id == 104:
        ct = d[20]
    elif customer_id == 105:
        ct = d[20]
    elif customer_id == 106:
        ct = d[20]
    elif customer_id == 107:
        ct = d[20]
    elif customer_id == 108:
        ct = d[20]
    elif customer_id == 109:
        ct = d[20]
    elif customer_id == 110:
        ct = d[20]

    elif customer_id == 85:
        ct = d[30]
    elif customer_id == 47:
        ct = d[30]
    elif customer_id == 53:
        ct = d[30]
    elif customer_id == 69:
        ct = d[30]
    elif customer_id == 82:
        ct = d[30]
    elif customer_id == 51:
        ct = d[30]

    elif customer_id == 90:
        ct = d[36]

    elif customer_id == 34:
        ct = d[31]
    elif customer_id == 35:
        ct = d[31]
    elif customer_id == 36:
        ct = d[31]
    elif customer_id == 31:
        ct = d[31]
    elif customer_id == 48:
        ct = d[31]
    elif customer_id == 52:
        ct = d[31]

    elif customer_id == 29:
        ct = d[33]

    elif customer_id == 49:
        ct = d[32]

    elif customer_id == 38:
        ct = d[19]

    return ct


def build_rv_type(d: List[str]) -> str:
    rv_type = d[30]
    if d[34]:
        rv_type = d[34]
    if d[36]:
        rv_type = d[36]
    return rv_type


def inventory_rows_for_supabase(
    customer_id: int,
    pull_date: date,
    pull_date_time: datetime,
    data: List[List[str]],
    custom_make_dictionary: Dict[str, str],
    custom_type_dictionary: Dict[str, str],
    custom_condition_dictionary: Dict[str, str],
    custom_model_trim_dict: Dict[Tuple[str, str, str], Tuple[str, str]],
) -> List[Dict[str, Any]]:
    rows_out: List[Dict[str, Any]] = []
    pds = pull_date.isoformat()
    pdt = pull_date_time.isoformat()

    for d in data:
        rv_type = build_rv_type(d)

        custom_type = choose_custom_type(customer_id, d)
        custom_type_2 = normalise_custom_type(custom_type, custom_type_dictionary)

        condition = d[0]
        custom_condition = normalise_custom_condition(condition, custom_condition_dictionary)

        the_model = d[3]
        the_trim = d[19]
        the_title = d[17]

        custom_model, custom_trim = normalise_custom_model_trim(
            the_model, the_trim, the_title, custom_model_trim_dict
        )

        location = d[14].replace(",", "") if d[14] else ""

        row: Dict[str, Any] = {
            "customer_id": customer_id,
            "pull_date_time": pdt,
            "pull_date": pds,
            "condition": trunc(condition),
            "year": trunc(d[1]),
            "make": trunc(d[2]),
            "model": trunc(the_model),
            "vin": trunc(d[4]),
            "advertiser": trunc(d[5]),
            "color": trunc(d[6]),
            "description": trunc(d[7]),
            "doors": trunc(d[8]),
            "drivetrain": trunc(d[9]),
            "formatted_price": trunc(d[10]),
            "fuel_type": trunc(d[11]),
            "image_type": trunc(d[12]),
            "image_url": trunc(d[13]),
            "location": trunc(location),
            "mileage": trunc(d[15]),
            "price": trunc(d[16]),
            "title": trunc(the_title),
            "transmission": trunc(d[18]),
            "trim": trunc(the_trim),
            "type": trunc(d[20]),
            "url": trunc(d[21]),
            "vehicle_type": trunc(d[22]),
            "custom_label_0": trunc(d[25]),
            "custom_label_1": trunc(d[26]),
            "custom_label_2": trunc(d[27]),
            "custom_label_3": trunc(d[28]),
            "custom_label_4": trunc(d[29]),
            "custom_type": trunc(custom_type),
            "custom_make": trunc(choose_custom_make(d[2], custom_make_dictionary)),
            "rv_type": trunc(rv_type),
            "rv_category": trunc(d[31]),
            "rv_class": trunc(d[32]),
            "category": trunc(d[33]),
            "motorhome_class": trunc(d[35]),
            "custom_type_2": trunc(custom_type_2),
            "custom_condition": trunc(custom_condition),
            "custom_model": trunc(custom_model) if custom_model else None,
            "custom_trim": trunc(custom_trim) if custom_trim else None,
        }
        rows_out.append(row)
    return rows_out


def fetch_csv_rows(url: str) -> List[List[str]]:
    df = pd.read_csv(url, sep=",", low_memory=False)
    df = pd.DataFrame(df, columns=HOOT_CSV_COLUMNS)
    raw = df.to_numpy()
    return [normalize_row(list(row)) for row in raw]


def upsert_chunks(
    supabase: Client, table: str, rows: List[Dict[str, Any]], chunk_size: int, dry_run: bool
) -> int:
    if dry_run:
        return len(rows)
    total = 0
    for i in range(0, len(rows), chunk_size):
        chunk = rows[i : i + chunk_size]
        supabase.table(table).upsert(chunk, on_conflict="customer_id,pull_date,vin,url").execute()
        total += len(chunk)
    return total


def clients_for_hoot_import(
    supabase: Client, active_pull_only: bool, single_id: Optional[int] = None
) -> List[dict]:
    r = supabase.table("clients").select("id, full_name, inventory_api, active_pull, scrap_feed").execute()
    clients = r.data or []
    out = []
    for c in clients:
        api = c.get("inventory_api")
        if api is None or str(api).strip() == "":
            continue
        if single_id is not None and int(c["id"]) != single_id:
            continue
        if active_pull_only:
            if not c.get("active_pull") or c.get("scrap_feed"):
                continue
        out.append(c)
    return out


def print_import_diagnostics(supabase: Client, active_pull_only: bool) -> None:
    """Explain why 0 clients might run: empty inventory_api, RLS, or active_pull filter."""
    r = supabase.table("clients").select("id, full_name, inventory_api, active_pull, scrap_feed").execute()
    rows = r.data or []
    total = len(rows)
    with_url = sum(1 for c in rows if c.get("inventory_api") and str(c.get("inventory_api")).strip())
    if active_pull_only:
        eligible_flags = sum(
            1
            for c in rows
            if c.get("inventory_api")
            and str(c.get("inventory_api")).strip()
            and c.get("active_pull")
            and not c.get("scrap_feed")
        )
    else:
        eligible_flags = with_url

    print(f"clients rows visible to this key: {total}")
    print(f"clients with non-empty inventory_api (Hoot CSV URL): {with_url}")
    if active_pull_only:
        print(
            f"clients matching HOOT_ACTIVE_PULL_ONLY (active_pull & not scrap_feed & has URL): {eligible_flags}"
        )

    if total == 0:
        print(
            "\n*** No rows returned from public.clients. "
            "Use SUPABASE_SERVICE_ROLE_KEY in GitHub Actions (not the anon key). "
            "If using the service role and this persists, confirm clients exist in the project. ***\n"
        )
    elif with_url == 0:
        print(
            "\n*** No client has inventory_api set. "
            "In Supabase Table Editor or Client Master, set each dealer's inventory_api to the full Hoot CSV feed URL. ***\n"
        )
    elif active_pull_only and eligible_flags == 0 and with_url > 0:
        print(
            "\n*** HOOT_ACTIVE_PULL_ONLY=1 but no client has active_pull=true and scrap_feed=false with a URL. "
            "Adjust client flags or set HOOT_ACTIVE_PULL_ONLY=0 to import all clients that have inventory_api. ***\n"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Hoot CSV -> Supabase hoot_inventory")
    parser.add_argument("--dry-run", action="store_true", help="Parse and build rows but do not write")
    parser.add_argument("--client-id", type=int, default=None, help="Process only this client id")
    args = parser.parse_args()

    script_dir = os.path.dirname(os.path.abspath(__file__))
    load_dotenv(os.environ.get("DOTENV_PATH", os.path.join(script_dir, ".env")))

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        sys.exit(1)

    jwt_role = supabase_jwt_role(key)
    if jwt_role:
        print(f"API key JWT role: {jwt_role}")
    if jwt_role == "anon":
        print(
            "\n*** Wrong key: this is the ANON (public) API key. "
            "Row Level Security hides public.clients, so 0 rows are returned. ***\n"
            "Fix: Supabase Dashboard → Project Settings → API → copy **service_role** "
            "(secret) into GitHub Actions secret SUPABASE_SERVICE_ROLE_KEY.\n"
            "SQL Editor uses the database role `postgres`, which bypasses RLS — that is why SQL still shows data.\n",
            file=sys.stderr,
        )
        sys.exit(1)
    if jwt_role and jwt_role != "service_role":
        print(
            f"Warning: expected JWT role 'service_role' for server imports; got '{jwt_role}'.",
            file=sys.stderr,
        )

    active_pull_only = os.environ.get("HOOT_ACTIVE_PULL_ONLY", "").strip() in ("1", "true", "True", "yes")
    _chunk = (os.environ.get("HOOT_CHUNK_SIZE") or "").strip()
    chunk_size = int(_chunk) if _chunk else 300

    supabase: Client = create_client(url, key)

    now = datetime.now()
    pull_date = date.today()
    pull_date_time = now
    print("Start Hoot inventory import:", now)

    print_import_diagnostics(supabase, active_pull_only)

    clients = clients_for_hoot_import(supabase, active_pull_only, args.client_id)
    print(f"Clients selected for import: {len(clients)} (active_pull_only={active_pull_only})")

    custom_make_dictionary = get_custom_make_dictionary(supabase)
    custom_type_dictionary = get_custom_type_dictionary(supabase)
    custom_condition_dictionary = get_custom_condition_dictionary(supabase)
    custom_model_trim_dict = get_custom_model_trim_dict(supabase)

    print(f"Custom make map: {len(custom_make_dictionary)}")
    print(f"Custom type map: {len(custom_type_dictionary)}")
    print(f"Custom condition map: {len(custom_condition_dictionary)}")
    print(f"Custom model/trim map: {len(custom_model_trim_dict)}")

    grant_total = 0
    for c in clients:
        cid = int(c["id"])
        name = c.get("full_name") or ""
        api_url = str(c["inventory_api"]).strip()
        try:
            raw_rows = fetch_csv_rows(api_url)
            rows = inventory_rows_for_supabase(
                cid,
                pull_date,
                pull_date_time,
                raw_rows,
                custom_make_dictionary,
                custom_type_dictionary,
                custom_condition_dictionary,
                custom_model_trim_dict,
            )
            n = upsert_chunks(supabase, "hoot_inventory", rows, chunk_size, args.dry_run)
            grant_total += n
            print(f"customer: {name}-{cid}, rows: {n}, time: {datetime.now()}")
        except Exception:
            print(f"Error for customer:{name}, ID:{cid}, API URL:{api_url}")
            print(traceback.format_exc())

    print(f"Total Hoot rows processed: {grant_total}")
    print("End:", datetime.now())


if __name__ == "__main__":
    main()
