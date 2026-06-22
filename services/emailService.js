import nodemailer from 'nodemailer';

/**
 * Send password reset email using SMTP credentials
 * @param {string} email - Destination email address
 * @param {string} resetUrl - Reset link containing secure token
 */
export const sendResetEmail = async (email, resetUrl) => {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  // Logging token locally in console for development fallback
  console.log(`\n========================================\n[EMAIL DEV LOG] Reset link for ${email}:\n${resetUrl}\n========================================\n`);

  if (!host || !user || !pass) {
    console.warn('WARNING: SMTP email credentials are not fully configured in your .env file. The reset link has been printed to the server logs above.');
    return { success: true, loggedToConsole: true };
  }

  const transporter = nodemailer.createTransport({
    host,
    port: parseInt(port),
    secure: parseInt(port) === 465,
    auth: {
      user,
      pass,
    },
  });

  const mailOptions = {
    from: `"GitHub Clone Support" <${user}>`,
    to: email,
    subject: 'Reset your GitHub Clone Password',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #d0d7de; border-radius: 6px;">
        <h2 style="font-size: 24px; font-weight: 600; color: #24292f; margin-bottom: 16px;">Reset your password</h2>
        <p style="font-size: 16px; color: #57606a; line-height: 1.5; margin-bottom: 24px;">
          We received a request to reset your GitHub Clone account password. Click the button below to choose a new password. This link is valid for 1 hour.
        </p>
        <div style="margin-bottom: 24px;">
          <a href="${resetUrl}" style="background-color: #2da44e; color: white; text-decoration: none; padding: 12px 24px; font-size: 16px; font-weight: 600; border-radius: 6px; display: inline-block;">
            Reset password
          </a>
        </div>
        <p style="font-size: 14px; color: #57606a; line-height: 1.5;">
          If you did not make this request, you can safely ignore this email.
        </p>
        <hr style="border: 0; border-top: 1px solid #d0d7de; margin: 24px 0;" />
        <p style="font-size: 12px; color: #8b949e; line-height: 1.5;">
          This link will expire in 1 hour. If it expires, please submit a new request.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  return { success: true };
};
