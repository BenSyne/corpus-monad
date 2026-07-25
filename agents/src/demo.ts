import { formatEther } from "viem";
import { loadSeedRecords, corpusAbi } from "@corpus/shared";
import {
  makeAgent, publicClient, corpusAddress, submissionStatus, waitForVerdict, reportBlocked,
} from "./lib/agent.js";

const FAST = process.argv.includes("--fast");
const ASSERT = process.argv.includes("--assert");

const honestA = makeAgent("honestA");
const honestB = makeAgent("honestB");
const copycat = makeAgent("copycat");
const slopbot = makeAgent("slopbot");
const buyer = makeAgent("buyer");

const pause = (ms: number) => (FAST ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));
const say = (line = "") => console.log(line);

async function read<T>(fn: string, args: readonly unknown[] = []): Promise<T> {
  return (await publicClient.readContract({
    address: corpusAddress, abi: corpusAbi, functionName: fn as never, args: args as never,
  })) as T;
}

async function main() {
  const failures: string[] = [];
  const expect = (ok: boolean, what: string) => {
    if (ok) say(`   ✓ ${what}`);
    else { say(`   ✗ ${what}`); failures.push(what); }
  };

  const startBalances = {
    copycat: await copycat.balance(),
    slopbot: await slopbot.balance(),
  };

  say("\n════════════════════════════════════════════════════════════");
  say("  CORPUS — data royalties for the agent economy");
  say(`  corpus ${corpusAddress}`);
  say("════════════════════════════════════════════════════════════\n");

  // ─── Act 1: honest agents contribute ──────────────────────────────────────
  say("① Two agents contribute red-team evaluation records.\n");
  const honest = loadSeedRecords("honest");
  const acceptedIds: number[] = [];

  for (const [index, { name, record }] of honest.entries()) {
    const agent = index % 2 === 0 ? honestA : honestB;
    const { contentHash } = await agent.submit(record);
    const id = Number(await read<bigint>("submissionCount")) - 1;
    say(`   ${agent.role} → #${id} ${name} ${contentHash.slice(0, 10)}…`);
    const verdict = await waitForVerdict(id);
    if (verdict.status === 1) {
      acceptedIds.push(id);
      say(`      minted ${verdict.score} → ${(verdict.score / 1000).toFixed(3)} shares`);
    } else {
      say(`      rejected`);
    }
    await pause(300);
  }
  expect(acceptedIds.length === honest.length, `all ${honest.length} honest records accepted`);

  // ─── Act 2: four attacks ──────────────────────────────────────────────────
  say("\n② Attackers try four different ways to farm the rewards.\n");
  const attacks = loadSeedRecords("attack");
  const gates: Record<string, string> = {};

  // (a) verbatim copy — rejected by the contract itself
  const verbatim = attacks.find((a) => a.name.includes("verbatim"))!;
  say("   copycat → resubmits an accepted record, byte for byte");
  let blockedAtDoor = false;
  try {
    await copycat.submit(verbatim.record);
  } catch (err) {
    blockedAtDoor = String(err).includes("DuplicateContent");
    const { encodeRecord } = await import("@corpus/shared");
    const { config } = await import("./lib/agent.js");
    const stored = encodeRecord(verbatim.record, config.contentKeyHex);
    await reportBlocked(stored.hash, copycat.address, "DuplicateContent");
    say("      ⛔ BLOCKED AT THE DOOR — the chain rejected it, no bond taken");
  }
  expect(blockedAtDoor, "verbatim duplicate reverts on-chain");
  await pause(600);

  // (b,c,d) the rest get bonded, then judged
  for (const attack of attacks.filter((a) => !a.name.includes("verbatim"))) {
    const agent = attack.name.includes("slop") || attack.name.includes("gibberish") ? slopbot : copycat;
    const label = attack.name.replace(/^\d+-/, "");
    say(`   ${agent.role} → submits the ${label} variant`);
    await agent.submit(attack.record);
    const id = Number(await read<bigint>("submissionCount")) - 1;
    const verdict = await waitForVerdict(id);
    const detail = await fetchDetail(id);
    gates[label] = detail?.gate ?? "unknown";
    say(`      ⛔ SLASHED — ${detail?.reason ?? "rejected"}`);
    expect(verdict.status === 2, `${label} was rejected`);
    await pause(400);
  }

  expect(gates["padded"] === "padded-copy", "padded copy caught by containment");
  expect(gates["paraphrase"] === "near-dup", "paraphrase caught by similarity");
  expect(gates["slop"] === "off-topic", "off-topic filler caught by scope");
  expect(gates["gibberish"] === "low-coherence", "gibberish caught by coherence");

  // ─── Act 3: a buyer pays ──────────────────────────────────────────────────
  say("\n③ A lab buys 30 days of access to the corpus.\n");
  await buyer.buyAccess();
  const price = await read<bigint>("accessPrice");
  say(`   buyer paid ${formatEther(price)} MON`);

  const timestamp = Date.now();
  const { accessMessage } = await import("../../scorer/src/stateApi.js");
  const { deployment } = await import("./lib/agent.js");
  const message = accessMessage(corpusAddress, deployment.chainId, timestamp);
  const signature = await buyer.wallet.signMessage({ account: buyer.account, message });
  const manifestUrl =
    `http://127.0.0.1:8787/manifest?address=${buyer.address}&timestamp=${timestamp}&signature=${signature}`;
  const manifest = (await (await fetch(manifestUrl)).json()) as { records?: unknown[]; error?: string };
  say(`   manifest returned ${manifest.records?.length ?? 0} records + the decryption key`);
  expect(manifest.records?.length === acceptedIds.length, "buyer receives every accepted record");

  // ─── Act 4: everyone gets paid ────────────────────────────────────────────
  say("\n④ Contributors claim. This is the whole point.\n");
  const protocolCredit = await read<bigint>("creditsOf", ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"]);
  const curatorCredit = await read<bigint>("creditsOf", ["0x14dC79964da2C08b23698B3D3cc7Ca32193d9955"]);

  for (const agent of [honestA, honestB]) {
    const before = await agent.balance();
    await agent.claimAll();
    const after = await agent.balance();
    const shares = await read<bigint>("balanceOf", [agent.address]);
    say(`   ${agent.role}  ${(Number(shares) / 1e18).toFixed(2)} shares  →  claimed ${formatEther(after - before)} MON`);
    expect(after > before, `${agent.role} was paid`);
  }

  const copycatEnd = await copycat.balance();
  const slopbotEnd = await slopbot.balance();
  const copycatPnl = copycatEnd - startBalances.copycat;
  const slopbotPnl = slopbotEnd - startBalances.slopbot;
  say(`\n   copycat  0.00 shares  →  net ${formatEther(copycatPnl)} MON`);
  say(`   slopbot  0.00 shares  →  net ${formatEther(slopbotPnl)} MON`);
  expect(copycatPnl < 0n, "copycat finished net negative");
  expect(slopbotPnl < 0n, "slopbot finished net negative");
  expect((await read<bigint>("balanceOf", [copycat.address])) === 0n, "copycat holds no shares");
  expect((await read<bigint>("balanceOf", [slopbot.address])) === 0n, "slopbot holds no shares");

  expect(protocolCredit === price / 10n, "protocol took exactly 10%");
  expect(curatorCredit === (price * 2n) / 10n, "curator took exactly 20%");

  // Solvency: the contract must still cover everything it owes.
  const contractBalance = await publicClient.getBalance({ address: corpusAddress });
  say(`\n   contract still holds ${formatEther(contractBalance)} MON against outstanding claims`);

  say("\n────────────────────────────────────────────────────────────");
  say("  Every reward you just saw is a royalty backed by that");
  say("  purchase and those forfeited bonds. Junk earned nothing.");
  say("────────────────────────────────────────────────────────────\n");

  if (ASSERT) {
    if (failures.length > 0) {
      say(`DEMO ASSERTIONS FAILED (${failures.length}):`);
      failures.forEach((f) => say(`  - ${f}`));
      process.exit(1);
    }
    say("ALL DEMO ASSERTIONS PASSED");
  }
}

async function fetchDetail(id: number): Promise<{ gate: string; reason: string } | null> {
  try {
    const state = (await (await fetch("http://127.0.0.1:8787/state")).json()) as {
      details: { id: number; gate: string; reason: string }[];
    };
    return state.details.find((d) => Number(d.id) === id) ?? null;
  } catch {
    return null;
  }
}

main().catch((err) => {
  console.error("\ndemo failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
