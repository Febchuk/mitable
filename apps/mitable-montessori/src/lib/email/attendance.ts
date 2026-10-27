import { getSchoolBranding } from "@/lib/branding/school";

export type AttendanceEmail = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  reply_to?: string;
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!
  );
}

/** Build once and persist the exact payload so provider retries are identical. */
export function renderAttendanceEmail(input: {
  to: string;
  studentName: string;
  schoolName: string;
  classroomName: string;
  date: string;
  status: "present" | "absent";
  comment: string | null;
  arrivalTime: string | null;
  departureTime: string | null;
  halfDay: boolean;
  appUrl: string;
}): AttendanceEmail {
  const brand = getSchoolBranding(input.schoolName);
  const day = new Date(`${input.date}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const lines = [
    `${input.studentName} was marked ${input.status} in ${input.classroomName} on ${day}.`,
    ...(input.status === "present"
      ? [
          ...(input.halfDay ? ["Half-day attendance."] : []),
          ...(input.arrivalTime ? [`Arrival: ${input.arrivalTime.slice(0, 5)}.`] : []),
          ...(input.departureTime ? [`Pickup: ${input.departureTime.slice(0, 5)}.`] : []),
        ]
      : []),
    ...(input.comment ? [input.comment] : []),
  ];
  const contact = brand
    ? `Questions? Contact the Head of Learning at ${brand.contactEmail}.`
    : `Questions? Please contact ${input.schoolName}.`;
  return {
    from: process.env.RESEND_FROM?.trim() || "Mitable <noreply@mitable.ai>",
    to: [input.to],
    subject: `${input.studentName}'s attendance — ${day}`,
    text: [input.schoolName, "Attendance update", ...lines, "", contact].join("\n"),
    html: `<!doctype html><html lang="en"><body style="margin:0;padding:24px;background:#FBF7EF;color:#2A2723;font-family:Arial,sans-serif"><div style="max-width:520px;margin:auto;padding:28px;background:#fff;border:1px solid #E8DFD0;border-radius:16px">${brand ? `<img src="${escapeHtml(input.appUrl + brand.logoPath)}" alt="${escapeHtml(brand.name)}" width="144" style="display:block;max-width:144px;height:auto;margin-bottom:20px" />` : ""}<p>${escapeHtml(input.schoolName)}</p><h1 style="font-size:22px">Attendance update</h1>${lines.map((line) => `<p style="line-height:1.5;white-space:pre-wrap">${escapeHtml(line)}</p>`).join("")}<hr style="border:0;border-top:1px solid #E8DFD0" /><p style="font-size:13px">${escapeHtml(contact)}</p></div></body></html>`,
    ...(brand ? { reply_to: brand.contactEmail } : {}),
  };
}

export async function sendAttendanceEmail(payload: AttendanceEmail, deliveryId: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("Email service is not configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `attendance/${deliveryId}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
  // Provider response bodies can contain recipient details; keep errors private.
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
  const result = (await response.json()) as { id?: string };
  if (!result.id) throw new Error("Email provider did not confirm acceptance");
  return result.id;
}
