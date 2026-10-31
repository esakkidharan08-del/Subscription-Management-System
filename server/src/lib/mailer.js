// Development mail goes to the console so password reset works without internet.
// A real transport only needs to provide the same send() signature.

const consoleMailer = {
  async send({ to, subject, text }) {
    console.log(`\n--- mail to ${to} ---\n${subject}\n\n${text}\n---------------------\n`);
  },
};

let activeMailer = consoleMailer;

export function setMailer(mailer) {
  activeMailer = mailer;
}

export function sendMail(message) {
  return activeMailer.send(message);
}
