import { createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { keccak256 } from "viem";
import { canonicalJson } from "./canonical.js";
import type { DataRecord } from "./types.js";

const STORE_DIR = join(process.cwd(), "data", "store");

/**
 * Convergent encryption: the IV is derived from the plaintext, so identical records
 * always produce identical ciphertext and therefore an identical on-chain hash.
 * That equality is what lets the contract reject exact duplicates at the door
 * without anyone having to reveal the data. It also means equality is observable
 * by design — the accepted tradeoff for a content-addressed encrypted store.
 */
function deriveIv(plaintext: Buffer): Buffer {
  return createHash("sha256").update(plaintext).digest().subarray(0, 12);
}

export type StoredContent = { hash: `0x${string}`; uri: string; blob: Buffer };

export function encodeRecord(record: DataRecord, keyHex: string): StoredContent {
  const plaintext = Buffer.from(canonicalJson(record), "utf8");
  const key = Buffer.from(keyHex, "hex");
  const iv = deriveIv(plaintext);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const blob = Buffer.concat([iv, cipher.getAuthTag(), body]);
  const hash = keccak256(new Uint8Array(blob));
  return { hash, uri: `cas://${hash.slice(2)}`, blob };
}

export function decodeBlob(blob: Buffer, keyHex: string): DataRecord {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const body = blob.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(body), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as DataRecord;
}

export function putRecord(record: DataRecord, keyHex: string): StoredContent {
  const stored = encodeRecord(record, keyHex);
  mkdirSync(STORE_DIR, { recursive: true });
  writeFileSync(blobPath(stored.hash), stored.blob);
  return stored;
}

/** Reads by hash and verifies integrity before decrypting — a mismatch is a scoring gate, not a crash. */
export function getRecord(hash: string, keyHex: string): { record: DataRecord | null; hashMatches: boolean } {
  const path = blobPath(hash);
  if (!existsSync(path)) return { record: null, hashMatches: false };
  const blob = readFileSync(path);
  if (keccak256(new Uint8Array(blob)) !== hash.toLowerCase()) return { record: null, hashMatches: false };
  try {
    return { record: decodeBlob(blob, keyHex), hashMatches: true };
  } catch {
    return { record: null, hashMatches: false };
  }
}

function blobPath(hash: string): string {
  return join(STORE_DIR, `${hash.replace(/^0x/, "")}.bin`);
}
