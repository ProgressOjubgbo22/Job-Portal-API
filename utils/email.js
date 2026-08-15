const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
      text,
    });
  } catch (err) {
    // Do not crash the request flow because of a transient email failure;
    // log it so it can be investigated / retried.
    console.error(`Failed to send email to ${to}: ${err.message}`);
  }
};

const sendVerificationEmail = (to, token) => {
  const link = `${process.env.CLIENT_URL}/verify-email?token=${token}`;
  return sendEmail({
    to,
    subject: "Verify your Job Portal account",
    html: `<p>Welcome! Please verify your email by clicking the link below:</p>
           <p><a href="${link}">${link}</a></p>
           <p>This link expires in 24 hours.</p>`,
  });
};

const sendPasswordResetEmail = (to, token) => {
  const link = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
  return sendEmail({
    to,
    subject: "Reset your Job Portal password",
    html: `<p>You requested a password reset. Click the link below to set a new password:</p>
           <p><a href="${link}">${link}</a></p>
           <p>If you did not request this, please ignore this email. This link expires in 1 hour.</p>`,
  });
};

const sendRecruiterInviteEmail = (to, token, companyName) => {
  const link = `${process.env.CLIENT_URL}/recruiter/accept-invitation?token=${token}`;
  return sendEmail({
    to,
    subject: `You've been invited to join ${companyName} on Job Portal`,
    html: `<p>You have been invited to join <strong>${companyName}</strong> as a recruiter.</p>
           <p>Click the link below to set your password and activate your account:</p>
           <p><a href="${link}">${link}</a></p>`,
  });
};

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendRecruiterInviteEmail,
};
