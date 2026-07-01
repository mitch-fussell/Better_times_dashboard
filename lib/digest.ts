// The twice-weekly check-in digest: turns the same "who needs attention" logic
// the dashboard uses (buildHealth) into a plain-data summary, plus renderers for
// email (HTML + text) and Slack. Deliberately reuses lib/metrics so the digest
// and the on-screen "Needs attention" box can never disagree about who's overdue.

import { buildHealth, type CheckIn, type Client } from "./metrics";

// One overdue client. daysOver is null when the client has never been contacted
// (the most urgent case), otherwise days past their own cadence.
export interface DigestOverdue {
  name: string;
  cadence: number;
  daysOver: number | null;
}

// A client with at least one reactive check-in ("ticket") in the last 30 days.
export interface DigestTicket {
  name: string;
  count: number;
}

export interface Digest {
  overdue: DigestOverdue[];
  recentTickets: DigestTicket[];
  totalClients: number;
}

export function buildDigest(clients: Client[], checkIns: CheckIn[], now = new Date()): Digest {
  // Churned clients are excluded everywhere else, so exclude them here too.
  const active = clients.filter((c) => c.status !== "churned");
  const health = buildHealth(active, checkIns, now);

  const overdue: DigestOverdue[] = health
    .filter((h) => h.overdue)
    .map((h) => ({
      name: h.client.name,
      cadence: h.client.cadence_days,
      daysOver: h.daysSince === null ? null : h.daysSince - h.client.cadence_days,
    }))
    .sort((a, b) => {
      // Never-contacted first, then most days over.
      const av = a.daysOver === null ? Infinity : a.daysOver;
      const bv = b.daysOver === null ? Infinity : b.daysOver;
      return bv - av;
    });

  const recentTickets: DigestTicket[] = health
    .filter((h) => h.recentReactive > 0)
    .map((h) => ({ name: h.client.name, count: h.recentReactive }))
    .sort((a, b) => b.count - a.count);

  return { overdue, recentTickets, totalClients: active.length };
}

export function digestSubject(d: Digest): string {
  if (d.overdue.length === 0) return "Client check-in digest — all clear ✅";
  const n = d.overdue.length;
  return `Client check-in digest — ${n} overdue`;
}

function overdueLabel(c: DigestOverdue): string {
  if (c.daysOver === null) return `never contacted (cadence ${c.cadence}d)`;
  const unit = c.daysOver === 1 ? "day" : "days";
  return `${c.daysOver} ${unit} over (cadence ${c.cadence}d)`;
}

// ---------- Plain-text (email fallback + logs) ----------

export function renderDigestText(d: Digest, appUrl?: string): string {
  const lines: string[] = ["BetterTimes — client check-in digest", ""];

  if (d.overdue.length === 0 && d.recentTickets.length === 0) {
    lines.push("✅ All clear — every active client is within cadence and no recent tickets.");
  }

  if (d.overdue.length) {
    lines.push(`⚠️  Overdue (${d.overdue.length})`);
    for (const c of d.overdue) lines.push(`   • ${c.name} — ${overdueLabel(c)}`);
    lines.push("");
  }

  if (d.recentTickets.length) {
    lines.push(`🎫  Recent tickets · last 30 days (${d.recentTickets.length})`);
    for (const c of d.recentTickets) {
      lines.push(`   • ${c.name} — ${c.count} ${c.count === 1 ? "ticket" : "tickets"}`);
    }
    lines.push("");
  }

  lines.push(`${d.overdue.length} of ${d.totalClients} active clients need attention.`);
  if (appUrl) lines.push(`Open the dashboard: ${appUrl}`);
  return lines.join("\n");
}

// ---------- HTML email ----------

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderDigestHtml(d: Digest, appUrl?: string): string {
  const row = (name: string, detail: string, accent: string) =>
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:600;color:#0f172a">${esc(name)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;white-space:nowrap;color:${accent};font-weight:600">${esc(detail)}</td>
    </tr>`;

  const section = (title: string, rows: string) =>
    `<h2 style="margin:24px 0 8px;font-size:14px;color:#334155">${esc(title)}</h2>
     <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>`;

  const parts: string[] = [];

  if (d.overdue.length === 0 && d.recentTickets.length === 0) {
    parts.push(
      `<p style="margin:16px 0;padding:12px 14px;background:#ecfdf5;border-radius:8px;color:#065f46;font-size:14px">✅ All clear — every active client is within cadence and there are no recent tickets.</p>`
    );
  }

  if (d.overdue.length) {
    const rows = d.overdue
      .map((c) =>
        row(c.name, c.daysOver === null ? "Never contacted" : `${c.daysOver}d over · ${c.cadence}d cadence`, "#dc2626")
      )
      .join("");
    parts.push(section(`⚠️ Overdue (${d.overdue.length})`, rows));
  }

  if (d.recentTickets.length) {
    const rows = d.recentTickets
      .map((c) => row(c.name, `${c.count} ${c.count === 1 ? "ticket" : "tickets"}`, "#b45309"))
      .join("");
    parts.push(section(`🎫 Recent tickets · last 30 days (${d.recentTickets.length})`, rows));
  }

  const cta = appUrl
    ? `<p style="margin:24px 0 0"><a href="${esc(appUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600">Open the dashboard</a></p>`
    : "";

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
    <h1 style="font-size:18px;margin:0 0 4px">Client check-in digest</h1>
    <p style="margin:0;color:#64748b;font-size:13px">${d.overdue.length} of ${d.totalClients} active clients need attention</p>
    ${parts.join("")}
    ${cta}
  </div>`;
}

// ---------- Slack (Incoming Webhook payload) ----------

type SlackBlock = Record<string, unknown>;

// Slack requires &, <, > escaped in mrkdwn text.
function slackEsc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Slack section text tops out at 3000 chars; split long lists across blocks.
function chunkLines(lines: string[], max = 2800): string[] {
  const chunks: string[] = [];
  let cur = "";
  for (const line of lines) {
    if (cur.length + line.length + 1 > max) {
      if (cur) chunks.push(cur);
      cur = line;
    } else {
      cur = cur ? `${cur}\n${line}` : line;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export function renderDigestSlack(d: Digest, appUrl?: string): { text: string; blocks: SlackBlock[] } {
  const blocks: SlackBlock[] = [
    { type: "header", text: { type: "plain_text", text: "Client check-in digest", emoji: true } },
  ];

  if (d.overdue.length === 0 && d.recentTickets.length === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: ":white_check_mark: *All clear* — every active client is within cadence and no recent tickets.",
      },
    });
  }

  if (d.overdue.length) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `:warning: *Overdue (${d.overdue.length})*` },
    });
    const lines = d.overdue.map((c) => `• *${slackEsc(c.name)}* — ${overdueLabel(c)}`);
    for (const chunk of chunkLines(lines)) {
      blocks.push({ type: "section", text: { type: "mrkdwn", text: chunk } });
    }
  }

  if (d.recentTickets.length) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `:ticket: *Recent tickets · last 30 days (${d.recentTickets.length})*` },
    });
    const lines = d.recentTickets.map(
      (c) => `• *${slackEsc(c.name)}* — ${c.count} ${c.count === 1 ? "ticket" : "tickets"}`
    );
    for (const chunk of chunkLines(lines)) {
      blocks.push({ type: "section", text: { type: "mrkdwn", text: chunk } });
    }
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: appUrl
          ? `${d.overdue.length} of ${d.totalClients} active clients need attention · <${appUrl}|Open the dashboard>`
          : `${d.overdue.length} of ${d.totalClients} active clients need attention`,
      },
    ],
  });

  return { text: digestSubject(d), blocks };
}
