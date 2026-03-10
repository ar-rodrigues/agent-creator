import nodemailer from "nodemailer";

const getTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST and SMTP_PORT in your environment.",
    );
  }

  return nodemailer.createTransport({
    host,
    port: Number(port),
    secure: port === "465",
    auth: user && pass ? {user, pass} : undefined,
  });
};

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendMail({
  to,
  subject,
  html,
  text,
}: SendMailOptions): Promise<{ok: boolean; error?: string}> {
  const from = process.env.MAIL_FROM || "noreply@localhost";

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from,
      to,
      subject,
      html,
      text: text ?? html.replace(/<[^>]*>/g, ""),
    });
    return {ok: true};
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send email";
    return {ok: false, error: message};
  }
}
