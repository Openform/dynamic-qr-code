/**
 * Shared validation for new accounts, used by public sign-up and by admins
 * creating accounts for clients.
 */

export const MIN_PASSWORD_LENGTH = 6;
const MAX_FIELD_LENGTH = 255; // matches the users table columns

/**
 * Validate and normalize new-account fields. Returns `{ email, name, password }`
 * on success or `{ error }` with a user-facing message.
 */
export function validateNewAccount({ email, password, name } = {}) {
  if (!email || !password || !name) {
    return { error: 'Email, password, and name are required' };
  }
  if (typeof email !== 'string' || !email.includes('@') || email.trim().length > MAX_FIELD_LENGTH) {
    return { error: 'Invalid email address' };
  }
  if (typeof name !== 'string' || name.trim() === '') {
    return { error: 'Email, password, and name are required' };
  }
  if (name.trim().length > MAX_FIELD_LENGTH) {
    return { error: `Name is too long (max ${MAX_FIELD_LENGTH} characters)` };
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  return { email: email.trim(), name: name.trim(), password };
}
