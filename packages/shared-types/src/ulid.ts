import { z } from 'zod';

/**
 * Zod schema for validating ULID strings.
 * ULIDs are 26 characters, Crockford Base32 encoded.
 */
export const ulidSchema = z
  .string()
  .length(26)
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/i, 'Invalid ULID format');

/** Shorthand for ULID ID fields */
export const id = () => ulidSchema;

/** Shorthand for nullable ULID ID fields */
export const nullableId = () => ulidSchema.nullable().default(null);
