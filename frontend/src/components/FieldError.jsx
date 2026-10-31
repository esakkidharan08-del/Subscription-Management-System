export default function FieldError({ error, field }) {
  const messages = error?.fields?.[field];
  if (!messages?.length) return null;
  return (
    <ul className="field-error">
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}
