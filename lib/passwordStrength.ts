// Client-side password strength + minimum-policy evaluation.
//
// Used on NEW password entry only (admin registration, employee onboarding,
// future password reset). It never runs on the login screen, so existing
// accounts with older/weaker passwords are unaffected and can still sign in.
//
// Authoritative enforcement should also be enabled server-side in the Supabase
// Auth dashboard (min length + leaked-password protection); this module is the
// in-app UX layer that guides users toward a strong password before submit.

export const MIN_PASSWORD_LENGTH = 8;

export type PasswordScore = 0 | 1 | 2 | 3 | 4;

export type PasswordStrength = {
  /** 0 (empty) … 4 (strong) — drives the visual meter. */
  score: PasswordScore;
  /** Short human label for the current score. */
  label: 'Empty' | 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  /** True when the password satisfies the minimum policy below. */
  acceptable: boolean;
  /** Human-readable requirements not yet met (for inline hints). */
  unmet: string[];
};

type Checks = {
  length: boolean;
  lower: boolean;
  upper: boolean;
  digit: boolean;
  symbol: boolean;
};

function runChecks(pw: string): Checks {
  return {
    length: pw.length >= MIN_PASSWORD_LENGTH,
    lower: /[a-z]/.test(pw),
    upper: /[A-Z]/.test(pw),
    digit: /[0-9]/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
  };
}

/**
 * Minimum policy: at least MIN_PASSWORD_LENGTH characters AND at least 3 of the
 * 4 character classes (lowercase / uppercase / number / symbol). This blocks
 * "just a random word" while staying flexible about which classes are used.
 */
export function evaluatePassword(pw: string): PasswordStrength {
  if (!pw) {
    return { score: 0, label: 'Empty', acceptable: false, unmet: [`At least ${MIN_PASSWORD_LENGTH} characters`] };
  }

  const c = runChecks(pw);
  const classes = [c.lower, c.upper, c.digit, c.symbol].filter(Boolean).length;
  const acceptable = c.length && classes >= 3;

  const unmet: string[] = [];
  if (!c.length) unmet.push(`At least ${MIN_PASSWORD_LENGTH} characters`);
  if (classes < 3) unmet.push('Mix upper, lower, numbers & symbols');

  // Sub-minimum length is always "Too short" regardless of character variety.
  if (!c.length) {
    return { score: 1, label: 'Too short', acceptable, unmet };
  }

  // Length OK — score on character-class variety, with a bonus for longer
  // passwords. Never report better than "Weak" until the policy is met.
  let score: PasswordScore;
  let label: PasswordStrength['label'];
  if (classes <= 2) {
    score = 2;
    label = 'Weak';
  } else if (classes === 3) {
    score = pw.length >= 12 ? 4 : 3;
    label = score === 4 ? 'Strong' : 'Good';
  } else {
    score = 4;
    label = 'Strong';
  }

  return { score, label, acceptable, unmet };
}
