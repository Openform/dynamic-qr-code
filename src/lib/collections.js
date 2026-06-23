/**
 * Shared validation for collection names, used by the collections API routes.
 */

export const MAX_NAME_LENGTH = 60;

// Blocked so a user-created collection can't be confused with the implicit
// "Default Collection" (codes with no collection_id).
const RESERVED_NAMES = new Set(['default', 'default collection']);

/**
 * Validate and normalize a collection name. Returns `{ name }` on success or
 * `{ error }` with a user-facing message.
 */
export function validateCollectionName(raw) {
  if (typeof raw !== 'string') {
    return { error: 'Collection name is required.' };
  }
  const name = raw.trim();
  if (!name) {
    return { error: 'Collection name is required.' };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return { error: `Collection name must be ${MAX_NAME_LENGTH} characters or fewer.` };
  }
  if (RESERVED_NAMES.has(name.toLowerCase())) {
    return { error: '“Default” is reserved for the built-in collection. Choose another name.' };
  }
  return { name };
}
