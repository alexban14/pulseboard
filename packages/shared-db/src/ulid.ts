import { ulid } from 'ulidx';

/**
 * Generates a new ULID string.
 * ULIDs are lexicographically sortable, time-ordered unique identifiers.
 * Format: 26 characters, Crockford Base32 (e.g., "01ARZ3NDEKTSV4RRFFQ69G5FAV")
 *
 * Benefits over UUID v4:
 * - Monotonically increasing → better B-tree index performance
 * - First 48 bits encode millisecond timestamp → naturally sortable by creation time
 * - Same 128-bit entropy as UUID
 */
export function newId(): string {
  return ulid();
}
