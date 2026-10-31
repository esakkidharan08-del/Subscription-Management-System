import { passwordField } from 'shared/validation/auth.js';

// Parsing an empty string fails every rule, which gives the full list of messages
// straight from the shared schema instead of a second copy here.
const ALL_RULES = passwordField.safeParse('').error.issues.map((issue) => issue.message);

export default function PasswordChecklist({ value }) {
  const result = passwordField.safeParse(value);
  const failing = new Set(result.success ? [] : result.error.issues.map((issue) => issue.message));

  return (
    <ul className="password-rules" aria-label="Password rules">
      {ALL_RULES.map((rule) => {
        const met = value.length > 0 && !failing.has(rule);
        return (
          <li key={rule} className={met ? 'rule-met' : undefined}>
            <span aria-hidden="true">{met ? '✓' : '•'}</span>{' '}
            {rule.replace(/^Password (must be|needs) /, '')}
          </li>
        );
      })}
    </ul>
  );
}
