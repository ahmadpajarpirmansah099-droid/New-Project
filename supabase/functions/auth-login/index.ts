import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const PUBLISHABLE_KEY =
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ??
  "";
const SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SECRET_KEY") ??
  "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function maskEmail(value: string) {
  const [local = "", domain = ""] = value.trim().toLowerCase().split("@");
  if (!domain || !local) return "email tidak valid";
  const maskedDomain = domain.split(".")
    .map((part) => part.length <= 1 ? "*" : part[0] + "***")
    .join(".");
  return local[0] + "***@" + maskedDomain;
}

async function logAttempt(event: {
  event_type: "login_failed" | "login_error";
  attempted_email_hint: string;
  reason_code: string;
  http_status: number;
}) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("Monitoring log unavailable: server credentials are missing.");
    return;
  }

  const response = await fetch(SUPABASE_URL + "/rest/v1/user_monitoring_activity", {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: "Bearer " + SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      event_type: event.event_type,
      attempted_email_hint: event.attempted_email_hint,
      source: "password",
      reason_code: event.reason_code,
      metadata: { auth_http_status: event.http_status },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("Monitoring log insert failed:", response.status, detail.slice(0, 300));
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  if (!SUPABASE_URL || !PUBLISHABLE_KEY) {
    console.error("Auth proxy is missing its Supabase URL or publishable key.");
    return jsonResponse({ error: "auth_service_unavailable" }, 503);
  }

  let input: { email?: unknown; password?: unknown };
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_request" }, 400);
  }

  const email = typeof input.email === "string" ? input.email.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (!email || !password || email.length > 320 || password.length > 1024) {
    return jsonResponse({ error: "invalid_request" }, 400);
  }

  let authResponse: Response;
  try {
    authResponse = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: {
        apikey: PUBLISHABLE_KEY,
        Authorization: "Bearer " + PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
  } catch (error) {
    console.error("Supabase Auth request failed:", error);
    await logAttempt({
      event_type: "login_error",
      attempted_email_hint: maskEmail(email),
      reason_code: "auth_service_unreachable",
      http_status: 0,
    });
    return jsonResponse({ error: "auth_service_unavailable" }, 503);
  }

  const responseText = await authResponse.text();
  let authPayload: Record<string, unknown> = {};
  try {
    authPayload = responseText ? JSON.parse(responseText) : {};
  } catch {
    authPayload = {};
  }

  if (!authResponse.ok) {
    const status = authResponse.status;
    const isServiceError = status >= 500;
    await logAttempt({
      event_type: isServiceError ? "login_error" : "login_failed",
      attempted_email_hint: maskEmail(email),
      reason_code: status === 429
        ? "rate_limited"
        : isServiceError
        ? "auth_service_error"
        : "credentials_rejected",
      http_status: status,
    });

    return jsonResponse(
      { error: status === 429 ? "rate_limited" : isServiceError ? "auth_service_unavailable" : "invalid_credentials" },
      status === 429 ? 429 : isServiceError ? 503 : 401,
    );
  }

  return jsonResponse(authPayload, 200);
});