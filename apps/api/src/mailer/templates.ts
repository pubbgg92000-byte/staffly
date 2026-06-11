/**
 * Centralized Staffly email templates.
 *
 * Each template returns `{ subject, html, text }`. Keep these dependency-free
 * (simple string interpolation) — no MJML/Handlebars needed yet. The HTML is a
 * minimal branded shell; the plain-text fallback carries the same information
 * for clients that don't render HTML.
 *
 * User-supplied values are HTML-escaped before interpolation into the HTML
 * body to avoid markup injection from names / titles.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const BRAND = "Staffly";
const BRAND_COLOR = "#4f46e5";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Branded HTML shell. `bodyHtml` is assumed already-escaped/trusted markup. */
function shell(
  headline: string,
  bodyHtml: string,
  cta?: { label: string; url: string },
): string {
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
         <tr><td style="border-radius:6px;background:${BRAND_COLOR};">
           <a href="${esc(cta.url)}" style="display:inline-block;padding:12px 20px;color:#ffffff;font-weight:600;text-decoration:none;font-size:14px;">${esc(cta.label)}</a>
         </td></tr>
       </table>`
    : "";
  return `<!doctype html>
<html><body style="margin:0;background:#f1f5f9;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="font-size:18px;font-weight:700;color:${BRAND_COLOR};margin-bottom:16px;">${BRAND}</div>
    <div style="background:#ffffff;border-radius:12px;padding:24px;">
      <h1 style="font-size:20px;margin:0 0 12px;">${esc(headline)}</h1>
      ${bodyHtml}
      ${button}
    </div>
    <p style="font-size:12px;color:#64748b;margin-top:16px;">Sent by ${BRAND}. If this wasn't you, you can ignore this email.</p>
  </div>
</body></html>`;
}

export function inviteEmail(args: {
  orgName: string;
  inviteUrl: string;
}): RenderedEmail {
  const subject = `You're invited to ${args.orgName} on ${BRAND}`;
  const html = shell(
    `You're invited to ${esc(args.orgName)}`,
    `<p style="font-size:14px;line-height:1.5;">You've been invited to join <strong>${esc(args.orgName)}</strong> on ${BRAND}. Click below to set up your account.</p>`,
    { label: "Accept invitation", url: args.inviteUrl },
  );
  const text = `You're invited to ${args.orgName} on ${BRAND}.\n\nAccept your invitation:\n${args.inviteUrl}\n`;
  return { subject, html, text };
}

export function passwordResetEmail(args: { resetUrl: string }): RenderedEmail {
  const subject = `Reset your ${BRAND} password`;
  const html = shell(
    "Reset your password",
    `<p style="font-size:14px;line-height:1.5;">We received a request to reset your ${BRAND} password. This link expires shortly. If you didn't request it, ignore this email.</p>`,
    { label: "Reset password", url: args.resetUrl },
  );
  const text = `Reset your ${BRAND} password:\n${args.resetUrl}\n\nIf you didn't request this, ignore this email.\n`;
  return { subject, html, text };
}

export function welcomeEmail(args: {
  displayName: string;
  orgName: string;
  portalUrl: string;
}): RenderedEmail {
  const subject = `Welcome to ${args.orgName} on ${BRAND}`;
  const html = shell(
    `Welcome, ${esc(args.displayName)}!`,
    `<p style="font-size:14px;line-height:1.5;">Your account at <strong>${esc(args.orgName)}</strong> is ready. Sign in to view your dashboard, attendance, and leave.</p>`,
    { label: "Open Staffly", url: args.portalUrl },
  );
  const text = `Welcome, ${args.displayName}!\n\nYour account at ${args.orgName} is ready.\nSign in: ${args.portalUrl}\n`;
  return { subject, html, text };
}

export function leaveDecisionEmail(args: {
  displayName: string;
  decision: "approved" | "rejected";
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  comment?: string | null;
}): RenderedEmail {
  const verb = args.decision === "approved" ? "approved" : "rejected";
  const subject = `Your leave request was ${verb}`;
  const range =
    args.startDate === args.endDate
      ? args.startDate
      : `${args.startDate} – ${args.endDate}`;
  const commentHtml = args.comment
    ? `<p style="font-size:14px;line-height:1.5;"><strong>Note:</strong> ${esc(args.comment)}</p>`
    : "";
  const html = shell(
    `Leave ${verb}`,
    `<p style="font-size:14px;line-height:1.5;">Hi ${esc(args.displayName)}, your <strong>${esc(args.leaveTypeName)}</strong> request for <strong>${esc(range)}</strong> was <strong>${verb}</strong>.</p>${commentHtml}`,
  );
  const text = `Hi ${args.displayName}, your ${args.leaveTypeName} request for ${range} was ${verb}.${
    args.comment ? `\nNote: ${args.comment}` : ""
  }\n`;
  return { subject, html, text };
}

export function announcementEmail(args: {
  title: string;
  orgName: string;
  portalUrl: string;
}): RenderedEmail {
  const subject = `[${args.orgName}] ${args.title}`;
  const html = shell(
    args.title,
    `<p style="font-size:14px;line-height:1.5;">A new announcement was published at <strong>${esc(args.orgName)}</strong>. Open ${BRAND} to read it.</p>`,
    { label: "View announcement", url: args.portalUrl },
  );
  const text = `New announcement at ${args.orgName}: ${args.title}\n\nView it: ${args.portalUrl}\n`;
  return { subject, html, text };
}
