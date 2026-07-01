import type { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { CheckIn, Client } from "@/lib/metrics";
import {
  buildDigest,
  digestSubject,
  renderDigestHtml,
  renderDigestSlack,
  renderDigestText,
} from "@/lib/digest";

// A background job, never cached, always run fresh on the server.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/digest — builds the twice-weekly check-in digest and sends it to
// email (Resend) and Slack. Triggered by Vercel Cron (see vercel.json), which
// sends `Authorization: Bearer <CRON_SECRET>`. Also accepts `?secret=<CRON_SECRET>`
// so it can be tested from a browser. Email/Slack are each optional: if a
// provider isn't configured, it's skipped rather than failing, so you can wire
// them up one at a time.
export async function GET(request: NextRequest) {
  // CRON_SECRET is required: without it the endpoint would be open to anyone.
  // Setting it in Vercel also makes Vercel Cron send it automatically as a
  // Bearer token. The `?secret=` form is only for a manual browser test.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response("Digest not configured: set CRON_SECRET.", { status: 503 });
  }
  const auth = request.headers.get("authorization");
  const q = request.nextUrl.searchParams.get("secret");
  if (auth !== `Bearer ${secret}` && q !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const [clientsRes, checkInsRes] = await Promise.all([
    supabase.from("clients").select("*"),
    supabase.from("check_ins").select("*"),
  ]);
  if (clientsRes.error) {
    return Response.json({ ok: false, error: clientsRes.error.message }, { status: 500 });
  }
  if (checkInsRes.error) {
    return Response.json({ ok: false, error: checkInsRes.error.message }, { status: 500 });
  }

  const digest = buildDigest(
    (clientsRes.data ?? []) as Client[],
    (checkInsRes.data ?? []) as CheckIn[]
  );

  // Absolute URL for the "Open the dashboard" link. Set NEXT_PUBLIC_APP_URL to
  // your custom domain; otherwise fall back to Vercel's production URL.
  const prodUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? (prodUrl ? `https://${prodUrl}` : undefined);

  const delivery: Record<string, string> = {};

  // --- Email via Resend (optional) ---
  if (process.env.RESEND_API_KEY && process.env.DIGEST_EMAIL_TO) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.DIGEST_EMAIL_FROM ?? "BetterTimes <onboarding@resend.dev>",
          to: process.env.DIGEST_EMAIL_TO.split(",").map((s) => s.trim()),
          subject: digestSubject(digest),
          html: renderDigestHtml(digest, appUrl),
          text: renderDigestText(digest, appUrl),
        }),
      });
      delivery.email = res.ok ? "sent" : `error ${res.status}: ${await res.text()}`;
    } catch (e) {
      delivery.email = `error: ${(e as Error).message}`;
    }
  } else {
    delivery.email = "skipped (RESEND_API_KEY / DIGEST_EMAIL_TO not set)";
  }

  // --- Slack via Incoming Webhook (optional) ---
  if (process.env.SLACK_WEBHOOK_URL) {
    try {
      const res = await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(renderDigestSlack(digest, appUrl)),
      });
      delivery.slack = res.ok ? "sent" : `error ${res.status}: ${await res.text()}`;
    } catch (e) {
      delivery.slack = `error: ${(e as Error).message}`;
    }
  } else {
    delivery.slack = "skipped (SLACK_WEBHOOK_URL not set)";
  }

  return Response.json({
    ok: true,
    overdue: digest.overdue.length,
    recentTickets: digest.recentTickets.length,
    delivery,
  });
}
