import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

async function digest(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function authorized(req: Request, expected: string) {
  const provided = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return provided.length > 20 && await digest(provided) === await digest(expected);
}

function expoError(value: any) {
  return String(value?.details?.error ?? value?.message ?? "ExpoPushError").slice(0, 200);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const dispatchSecret = Deno.env.get("PUSH_DISPATCH_SECRET") ?? "";
  const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN") ?? "";
  if (!dispatchSecret || !expoAccessToken) return json({ error: "Push dispatcher is not configured" }, 503);
  if (!await authorized(req, dispatchSecret)) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const expoHeaders = {
    Authorization: `Bearer ${expoAccessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
  };

  let receiptsChecked = 0;
  const { data: receipts, error: receiptListError } = await admin.rpc("list_pending_push_receipts", { batch_limit: 1000 });
  if (receiptListError) return json({ error: "Push receipts could not be claimed" }, 503);
  const receiptRows = receipts ?? [];
  if (receiptRows.length > 0) {
    const receiptResponse = await fetch(EXPO_RECEIPTS_URL, {
      method: "POST",
      headers: expoHeaders,
      body: JSON.stringify({ ids: receiptRows.map((row: any) => row.ticket_id) }),
    });
    if (receiptResponse.ok) {
      const receiptData = await receiptResponse.json();
      for (const row of receiptRows) {
        const receipt = receiptData?.data?.[row.ticket_id];
        if (!receipt) continue;
        await admin.rpc("record_push_receipt", {
          target_job: row.job_id,
          delivery_status: String(receipt.status ?? "error"),
          error_code: receipt.status === "ok" ? null : expoError(receipt),
        });
        receiptsChecked += 1;
      }
    }
  }

  const { data: jobs, error: claimError } = await admin.rpc("claim_due_push_jobs", { batch_limit: 100 });
  if (claimError) return json({ error: "Push jobs could not be claimed", receipts_checked: receiptsChecked }, 503);
  const rows = jobs ?? [];
  if (rows.length === 0) return json({ claimed: 0, ticketed: 0, receipts_checked: receiptsChecked });

  const messages = rows.map((row: any) => ({
    to: row.expo_push_token,
    title: "TalkTwo",
    body: "You have a new message.",
    sound: "default",
    priority: "high",
    channelId: "messages",
    data: { kind: "message_available" },
  }));

  let sendData: any;
  try {
    const response = await fetch(EXPO_SEND_URL, { method: "POST", headers: expoHeaders, body: JSON.stringify(messages) });
    sendData = await response.json();
    if (!response.ok) throw new Error(expoError(sendData?.errors?.[0] ?? sendData));
  } catch (error) {
    const code = error instanceof Error ? error.message : "ExpoPushUnavailable";
    for (const row of rows) {
      await admin.rpc("record_push_ticket", { target_job: row.job_id, provider_ticket: null, error_code: code });
    }
    return json({ error: "Expo push service unavailable", claimed: rows.length, receipts_checked: receiptsChecked }, 502);
  }

  const tickets = Array.isArray(sendData?.data) ? sendData.data : [];
  let ticketed = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const ticket = tickets[index];
    const ok = ticket?.status === "ok" && typeof ticket?.id === "string";
    await admin.rpc("record_push_ticket", {
      target_job: rows[index].job_id,
      provider_ticket: ok ? ticket.id : null,
      error_code: ok ? null : expoError(ticket),
    });
    if (ok) ticketed += 1;
  }
  return json({ claimed: rows.length, ticketed, receipts_checked: receiptsChecked });
});
