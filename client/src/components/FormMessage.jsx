// Shows the general error from a failed request. Field errors render next to their inputs.
export default function FormMessage({ error }) {
  if (!error) return null;
  const hasFieldErrors = Object.keys(error.fields ?? {}).length > 0;
  return <p className="form-error">{hasFieldErrors ? 'Please fix the highlighted fields' : error.message}</p>;
}
