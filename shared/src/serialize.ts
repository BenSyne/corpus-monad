/**
 * BigInt-safe JSON. viem returns bigints for chain values and JSON.stringify throws
 * on them, which would 500 the scorer's state API on its first request.
 */
export function jsonStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}

/** Numeric fields cross the API as strings; normalize before comparing to chain values. */
export function toNumber(value: string | number | bigint): number {
  return typeof value === "number" ? value : Number(value);
}
