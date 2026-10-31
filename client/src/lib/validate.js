// Runs a shared schema in the browser and returns errors in the same shape the
// API sends ({ fields: { name: [messages] } }), so FieldError shows either one.
// The server still checks everything; this only saves a round trip.
export function checkLocally(schema, values) {
  const result = schema.safeParse(values);
  if (result.success) return null;

  const fields = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || 'body';
    (fields[key] ??= []).push(issue.message);
  }
  return { message: 'Please fix the highlighted fields', fields };
}
