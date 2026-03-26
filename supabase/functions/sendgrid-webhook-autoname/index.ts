import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function eventTimestamp(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

function rowToInsert(row: Record<string, unknown>) {
  return {
    email: str(row.email),
    event: str(row.event),
    mc_auto_name: str(row.mc_auto_name),
    mc_auto_unique_id: str(row.mc_auto_unique_id),
    asm_group_id: str(row.asm_group_id),
    ip: str(row.ip),
    mc_auto_id: str(row.mc_auto_id),
    mc_auto_msg_id: str(row.mc_auto_msg_id),
    mc_auto_step_id: str(row.mc_auto_step_id),
    mc_pod_id: str(row.mc_pod_id),
    mc_stats: str(row.mc_stats),
    sg_event_id: str(row.sg_event_id),
    sg_message_id: str(row.sg_message_id),
    sg_template_id: str(row.sg_template_id),
    template_hash: str(row.template_hash),
    template_id: str(row.template_id),
    template_version_id: str(row.template_version_id),
    event_timestamp: eventTimestamp(row.timestamp),
    url: str(row.url),
    raw_payload: row as Record<string, unknown>,
  };
}

function isOpenOrClick(event: string): boolean {
  const e = event.trim().toLowerCase();
  return e === "open" || e === "click";
}

function hasMcAutoName(row: Record<string, unknown>): boolean {
  return str(row.mc_auto_name).trim() !== "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const secret =
    Deno.env.get("SENDGRID_WEBHOOK_AUTONAME_SECRET") ??
    Deno.env.get("SENDGRID_WEBHOOK_SECRET");
  if (secret) {
    const auth = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const headerSecret = req.headers.get("X-Webhook-Secret") ?? "";
    if (auth !== secret && headerSecret !== secret) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const rows: Record<string, unknown>[] = Array.isArray(body)
    ? body
    : body && typeof body === "object"
      ? [body as Record<string, unknown>]
      : [];

  if (rows.length === 0) {
    return jsonResponse({
      data: "[]",
      message: "captured successfully",
      inserted: 0,
      skipped: 0,
    });
  }

  const filtered = rows.filter((r) => isOpenOrClick(str(r.event)) && hasMcAutoName(r));

  if (filtered.length === 0) {
    return jsonResponse({
      data: JSON.stringify(body),
      message: "captured successfully",
      inserted: 0,
      skipped: rows.length,
    });
  }

  const payload = filtered.map((r) => rowToInsert(r));

  const { error } = await supabase.from("sendgrid_events_autoname").insert(payload);

  if (error) {
    console.error("sendgrid_events_autoname insert error:", error);
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({
    data: JSON.stringify(body),
    message: "captured successfully",
    inserted: filtered.length,
    skipped: rows.length - filtered.length,
  });
});
