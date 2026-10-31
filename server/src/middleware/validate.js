// Replaces req.body with the parsed result, so handlers only ever see
// trimmed, typed and defaulted values.
export function validateBody(schema) {
  return (req, res, next) => {
    req.body = schema.parse(req.body ?? {});
    next();
  };
}
