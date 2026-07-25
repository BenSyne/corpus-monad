import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { CorpusConfig, DataRecord, Deployment } from "./types.js";

const ROOT = process.cwd();

export function loadCorpusConfig(): CorpusConfig {
  return JSON.parse(readFileSync(join(ROOT, "data", "seed", "corpus-config.json"), "utf8")) as CorpusConfig;
}

export function loadSeedRecords(folder: "honest" | "attack"): { name: string; record: DataRecord }[] {
  const dir = join(ROOT, "data", "seed", folder);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ name: f.replace(/\.json$/, ""), record: JSON.parse(readFileSync(join(dir, f), "utf8")) as DataRecord }));
}

export function loadDeployment(network = process.env.NETWORK ?? "local"): Deployment {
  const path = join(ROOT, "shared", "deployments", `${network}.json`);
  if (!existsSync(path)) {
    throw new Error(`No deployment found for "${network}". Run: pnpm deploy:local`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as Deployment;
}
