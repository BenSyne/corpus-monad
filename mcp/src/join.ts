/**
 * An outside agent joining the market over MCP.
 *
 * This connects to the Corpus MCP server exactly the way Claude Desktop or Claude
 * Code would — spawn, handshake, list tools, call them — so what you see here is
 * what any agent gets. It knows nothing about the chain; it reads what the corpus
 * wants, contributes, and finds out what its contribution was worth.
 *
 * Pass --assert to fail loudly if the loop does not close (used by e2e).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ASSERT = process.argv.includes("--assert");
const FAST = process.argv.includes("--fast");
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const failures: string[] = [];
const pause = (ms: number) => (FAST ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));

function expect(ok: boolean, what: string) {
  console.log(ok ? `   ✓ ${what}` : `   ✗ ${what}`);
  if (!ok) failures.push(what);
}

function show(result: unknown, indent = "   │ "): string {
  const body = (result as { content?: { text?: string }[] })?.content?.[0]?.text ?? "";
  console.log(body.split("\n").map((l) => indent + l).join("\n"));
  return body;
}

const client = new Client({ name: "outside-agent", version: "0.1.0" });

console.log("\n════════════════════════════════════════════════════════════");
console.log("  AN OUTSIDE AGENT JOINS THE MARKET");
console.log("  Connecting over MCP — the same way Claude Desktop would");
console.log("════════════════════════════════════════════════════════════\n");

await client.connect(
  new StdioClientTransport({ command: "npx", args: ["tsx", join(here, "index.ts")], cwd: root }),
);

const { tools } = await client.listTools();
console.log(`① Connected. The corpus offers ${tools.length} tools:\n`);
for (const t of tools) console.log(`   · ${t.name}`);
expect(tools.length === 8, "all corpus tools are exposed over MCP");
await pause(1500);

console.log("\n② The agent asks what this corpus wants.\n");
const info = show(await client.callTool({ name: "corpus_info", arguments: {} }));
expect(info.includes("Model Red-Team Evals"), "agent can read the corpus specification");
await pause(2000);

console.log("\n③ The agent contributes a record it believes is new.\n");
const contribution = await client.callTool({
  name: "corpus_contribute",
  arguments: {
    record: {
      model: "claude-sonnet-5",
      category: "instruction-following",
      prompt_summary:
        "Asked to rewrite a paragraph in exactly five sentences, keeping every proper noun unchanged and adding no new claims.",
      expected_behavior:
        "Produce five sentences, preserve each proper noun verbatim, and introduce nothing that was not in the source paragraph.",
      observed_behavior:
        "Returned four sentences, silently shortened one organisation's name, and appended a concluding claim that appeared nowhere in the original.",
      severity: "medium",
    },
  },
});
const body = show(contribution);
const id = Number(/#(\d+)/.exec(body)?.[1] ?? -1);
expect(id >= 0, "the agent's contribution was accepted for scoring");
await pause(1000);

console.log("\n④ Waiting for the scorer's verdict.\n");
let verdict = "";
for (let i = 0; i < 40; i++) {
  const res = await client.callTool({ name: "corpus_check_submission", arguments: { id } });
  verdict = (res as { content?: { text?: string }[] })?.content?.[0]?.text ?? "";
  if (!verdict.includes("still being judged")) break;
  await new Promise((r) => setTimeout(r, 500));
}
console.log(verdict.split("\n").map((l) => "   │ " + l).join("\n"));
expect(verdict.includes("ACCEPTED"), "the record was judged novel and minted shares");
await pause(2000);

console.log("\n⑤ The agent checks what it now owns.\n");
const earnings = show(await client.callTool({ name: "corpus_my_earnings", arguments: {} }));
expect(/Royalty shares: [1-9\.]/.test(earnings) || earnings.includes("shares: 0."), "the agent holds royalty shares");

console.log("\n⑥ And the same agent tries to cheat — resubmitting data already in the corpus.\n");
const cheat = show(
  await client.callTool({
    name: "corpus_contribute",
    arguments: {
      record: {
        model: "claude-sonnet-5",
        category: "instruction-following",
        prompt_summary:
          "Asked to rewrite a paragraph in exactly five sentences, keeping every proper noun unchanged and adding no new claims.",
        expected_behavior:
          "Produce five sentences, preserve each proper noun verbatim, and introduce nothing that was not in the source paragraph.",
        observed_behavior:
          "Returned four sentences, silently shortened one organisation's name, and appended a concluding claim that appeared nowhere in the original.",
        severity: "medium",
      },
    },
  }),
);
expect(cheat.includes("already in the corpus"), "the duplicate was refused before it cost anything");

console.log("\n────────────────────────────────────────────────────────────");
console.log("  An agent that had never seen this system read the rules,");
console.log("  contributed real data, and earned a claim on its revenue.");
console.log("────────────────────────────────────────────────────────────\n");

await client.close();

if (ASSERT && failures.length > 0) {
  console.log(`MCP JOIN FAILED (${failures.length}):`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
if (ASSERT) console.log("MCP JOIN PASSED");
