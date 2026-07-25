import type { DataRecord } from "@corpus/shared";

/** Returns null when the record satisfies the corpus schema, or a human-readable reason. */
export function validateSchema(record: DataRecord, requiredFields: readonly string[]): string | null {
  for (const field of requiredFields) {
    const value = record[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      return `missing or empty required field "${field}"`;
    }
  }
  return null;
}
