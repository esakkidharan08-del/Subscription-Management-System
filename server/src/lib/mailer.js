// Console mailer keeps the app usable offline. Swap in an SMTP mailer with the same send() shape.
export const consoleMailer = {
  async send({ to, subject, text }) {
    console.log(`\n[mail] to: ${to}\n[mail] subject: ${subject}\n${text}\n`);
  },
};
