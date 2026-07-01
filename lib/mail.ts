import nodemailer from "nodemailer";

type EventMailInput = { title: string; date: string; time: string; recipients: string[] };

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

export function renderEventEmail({ title, date, time }: EventMailInput) {
  const safeTitle = escapeHtml(title);
  const displayDate = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${date}T00:00:00`));
  return `<!doctype html><html lang="vi"><body style="margin:0;background:#f3f4f6;font-family:Arial;color:#111827"><table width="100%" style="padding:32px 16px"><tr><td align="center"><table width="100%" style="max-width:620px;background:white;border-radius:18px;overflow:hidden;border:1px solid #e5e7eb"><tr><td style="background:linear-gradient(90deg,#4A90E2,#9013FE);padding:24px 28px;color:white"><div style="font-size:13px;text-transform:uppercase;font-weight:700">Thông báo lịch công tác</div><h1 style="font-size:24px;margin:10px 0 0">${safeTitle}</h1></td></tr><tr><td style="padding:28px"><p>Kính gửi đồng chí, hệ thống gửi thông tin cuộc họp:</p><p><b>Nội dung:</b> ${safeTitle}</p><p><b>Ngày:</b> ${displayDate}</p><p><b>Thời gian:</b> ${escapeHtml(time)}</p><p>Đề nghị đồng chí sắp xếp tham dự đúng lịch.</p></td></tr></table></td></tr></table></body></html>`;
}

export async function sendEventEmail(input: EventMailInput) {
  const smtpEmail = process.env.SMTP_EMAIL;
  const smtpPassword = process.env.SMTP_PASSWORD;
  if (!smtpEmail || !smtpPassword || input.recipients.length === 0) return { sent: 0, skipped: true };
  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: smtpEmail, pass: smtpPassword } });
  await transporter.sendMail({ from: `"Lịch công tác cơ quan" <${smtpEmail}>`, to: input.recipients, subject: `Thông báo lịch họp: ${input.title.replace(/[\r\n]/g, " ")}`, html: renderEventEmail(input) });
  return { sent: input.recipients.length, skipped: false };
}
