import type { AirtableCompany, ClientStats } from "./types";
import { markAlertSent } from "./airtable";
import { postSlack } from "./slack";

function sameCalendarMonth(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth()
  );
}

interface AlertOutcome {
  companyName: string;
  sent: boolean;
  reason: string;
}

/**
 * Post a Slack alert if the client is critical AND we haven't already alerted
 * this calendar month.
 */
export async function checkAndAlert(
  company: AirtableCompany,
  stats: ClientStats,
  now: Date = new Date()
): Promise<AlertOutcome> {
  if (stats.health !== "critical") {
    return {
      companyName: company.name,
      sent: false,
      reason: `status=${stats.health}`,
    };
  }

  if (company.lastAlertSent) {
    const last = new Date(company.lastAlertSent);
    if (!Number.isNaN(last.getTime()) && sameCalendarMonth(last, now)) {
      return {
        companyName: company.name,
        sent: false,
        reason: "alert already sent this month",
      };
    }
  }

  const baseUrl = process.env.DASHBOARD_BASE_URL || "";
  const link = baseUrl
    ? `${baseUrl}/clients/${company.recordId}`
    : `(${company.recordId})`;

  const text =
    `:rotating_light: *Duodeal usage drop — ${company.name}*\n` +
    `${stats.healthReason}\n` +
    `• This month: *${stats.dealsThisMonth}* deal(s) (day ${stats.dayOfMonth}/${stats.daysInMonth})\n` +
    `• Projected EOM: *${stats.projectedThisMonth.toFixed(1)}*\n` +
    `• Last month: ${stats.dealsLastMonth}\n` +
    `• 3-month avg: ${stats.avgTrailing3mo.toFixed(1)}\n` +
    (company.customerSuccess
      ? `• CSM: ${company.customerSuccess}\n`
      : "") +
    (link ? `<${link}|View client>` : "");

  await postSlack(text);
  await markAlertSent(company.recordId, now);

  return {
    companyName: company.name,
    sent: true,
    reason: "alert sent",
  };
}
