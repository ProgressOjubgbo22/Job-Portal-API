const nodemailer = require("nodemailer");
const logger = require("../config/logger");

// This is the original transporter/sending logic from utils/email.js,
// relocated here so it runs inside the background worker process instead
// of inline on the request/response cycle. utils/email.js now enqueues
// jobs onto the "email" BullMQ queue; workers/email.worker.js imports the
// functions below to actually deliver them.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const deliverEmail = async ({ to, subject, html, text }) => {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
    text,
  });
  logger.info(`Email sent to ${to}: "${subject}"`);
};

const buildVerificationEmail = (to, token) => {
  const link = `${process.env.CLIENT_URL}/verify-email?token=${token}`;
  return {
    to,
    subject: "Verify your Job Portal account",
    html: `<p>Welcome! Please verify your email by clicking the link below:</p>
           <p><a href="${link}">${link}</a></p>
           <p>This link expires in 24 hours.</p>`,
  };
};

const buildPasswordResetEmail = (to, token) => {
  const link = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
  return {
    to,
    subject: "Reset your Job Portal password",
    html: `<p>You requested a password reset. Click the link below to set a new password:</p>
           <p><a href="${link}">${link}</a></p>
           <p>If you did not request this, please ignore this email. This link expires in 1 hour.</p>`,
  };
};

const buildRecruiterInviteEmail = (to, token, companyName) => {
  const link = `${process.env.CLIENT_URL}/recruiter/accept-invitation?token=${token}`;
  return {
    to,
    subject: `You've been invited to join ${companyName} on Job Portal`,
    html: `<p>You have been invited to join <strong>${companyName}</strong> as a recruiter.</p>
           <p>Click the link below to set your password and activate your account:</p>
           <p><a href="${link}">${link}</a></p>`,
  };
};

const EMAIL_BUILDERS = {
  generic: (payload) => payload,
  verification: ({ to, token }) => buildVerificationEmail(to, token),
  passwordReset: ({ to, token }) => buildPasswordResetEmail(to, token),
  recruiterInvite: ({ to, token, companyName }) => buildRecruiterInviteEmail(to, token, companyName),
};

module.exports = { deliverEmail, EMAIL_BUILDERS };
