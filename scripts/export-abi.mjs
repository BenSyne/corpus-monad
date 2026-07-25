// Copies the ABIs the TypeScript packages need out of the forge build artifacts,
// so nothing at runtime has to know where Foundry puts its output.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function abiOf(contract) {
  const artifact = JSON.parse(readFileSync(join(root, "contracts", "out", `${contract}.sol`, `${contract}.json`), "utf8"));
  return artifact.abi;
}

const out = `// Generated from the Foundry build by scripts/export-abi.mjs — do not edit.
export const corpusAbi = ${JSON.stringify(abiOf("Corpus"), null, 2)} as const;

export const corpusFactoryAbi = ${JSON.stringify(abiOf("CorpusFactory"), null, 2)} as const;
`;

mkdirSync(join(root, "shared", "src"), { recursive: true });
writeFileSync(join(root, "shared", "src", "abi.ts"), out);
console.log("wrote shared/src/abi.ts");
