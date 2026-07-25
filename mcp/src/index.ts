#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { formatEther } from "viem";
import { putRecord } from "@corpus/shared";
import { account, config, corpus, deployment, publicClient, read, write } from "./wallet.js";

/**
 * Corpus over MCP: the interface an outside agent uses to join the market.
 * An agent can read what the corpus wants, contribute data, find out what its
 * contribution was worth and why, buy access to the dataset, and collect what
 * it has earned — without knowing anything about the chain underneath.
 */
const server = new McpServer({ name: "corpus", version: "0.1.0" });

const SCORER_API = process.env.CORPUS_SCORER_API ?? "http://127.0.0.1:8787";

const text = (body: string) => ({ content: [{ type: "text" as const, text: body }] });

server.tool(
  "corpus_info",
  "Describe the data corpus an agent can contribute to: what it collects, the record schema, what contributing costs and pays, and how the submission is judged. Call this first.",
  {},
  async () => {
    const [count, scored, supply, price, bond] = await Promise.all([
      read<bigint>("submissionCount"), read<bigint>("scoredCount"), read<bigint>("totalSupply"),
      read<bigint>("accessPrice"), read<bigint>("bondAmount"),
    ]);

    return text(
      [
        `# ${config.name}`,
        config.description,
        ``,
        `Contract ${corpus} on ${deployment.network} (chain ${deployment.chainId}).`,
        `Your agent wallet: ${account.address}`,
        ``,
        `## What a record must contain`,
        ...config.schemaFields.map((f) => `- ${f}`),
        ``,
        `Only ${config.embedFields.join(", ")} are read when judging novelty — metadata cannot make a record look new.`,
        ``,
        `## Economics`,
        `- Submitting costs a ${formatEther(bond)} MON bond.`,
        `- Accepted: you keep 80% of the bond and mint royalty shares in proportion to how much new information you added (score 0-1000).`,
        `- Rejected: you forfeit the whole bond to existing contributors.`,
        `- Every future sale of this corpus pays 70% to shareholders, forever, in proportion to shares held.`,
        `- Access costs ${formatEther(price)} MON for 30 days.`,
        ``,
        `## How a submission is judged`,
        `In order: valid schema, content matches its hash, long enough, readable prose,`,
        `uses this corpus's subject vocabulary, not a near-duplicate of existing data (similarity < ${config.thresholds.nearDupCosine}),`,
        `not a padded copy (containment < ${config.thresholds.containment}). What survives is scored on novelty.`,
        ``,
        `## Right now`,
        `${scored} records accepted out of ${count} submitted · ${(Number(supply) / 1e18).toFixed(2)} shares issued`,
      ].join("\n"),
    );
  },
);

server.tool(
  "corpus_contribute",
  "Contribute one data record to the corpus and stake a bond on it. Returns the submission id; the verdict takes a few seconds, so follow up with corpus_check_submission. Only contribute records that genuinely fit this corpus's subject and are not restatements of data already in it.",
  { record: z.record(z.string()).describe("The record, with every field named by corpus_info") },
  async ({ record }) => {
    const missing = config.schemaFields.filter((f) => !record[f]?.trim());
    if (missing.length > 0) {
      return text(`Rejected before submitting: missing required field(s) ${missing.join(", ")}. Nothing was staked.`);
    }

    const bond = await read<bigint>("bondAmount");
    const balance = await publicClient.getBalance({ address: account.address });
    if (balance < bond) {
      return text(`Your wallet holds ${formatEther(balance)} MON, which cannot cover the ${formatEther(bond)} MON bond.`);
    }

    const stored = putRecord(record, config.contentKeyHex);
    try {
      const hash = await write("submit", [stored.hash, stored.uri], bond);
      const id = Number(await read<bigint>("submissionCount")) - 1;
      return text(
        `Submitted as #${id}. Staked ${formatEther(bond)} MON.\n` +
          `Content hash ${stored.hash}\nTransaction ${hash}\n\n` +
          `Call corpus_check_submission with id ${id} in a few seconds for the verdict.`,
      );
    } catch (err) {
      const message = String(err);
      if (message.includes("DuplicateContent")) {
        return text("Rejected by the contract: this exact record is already in the corpus. No bond was taken.");
      }
      if (message.includes("NotContentOwner")) {
        return text("Rejected: this content was first submitted by another agent, so only they may resubmit it.");
      }
      if (message.includes("TooManyPending")) {
        return text("You already have 5 submissions awaiting a verdict. Wait for those before sending more.");
      }
      return text(`Submission failed: ${message}`);
    }
  },
);

server.tool(
  "corpus_check_submission",
  "Look up what happened to a submission: whether it was accepted, how many royalty shares it minted, or exactly why it was rejected.",
  { id: z.number().int().nonnegative().describe("The submission id returned by corpus_contribute") },
  async ({ id }) => {
    const count = Number(await read<bigint>("submissionCount"));
    if (id >= count) return text(`No submission #${id} exists yet.`);

    const s = await read<{ contributor: string; bond: bigint; score: number; status: number }>("getSubmission", [BigInt(id)]);
    const detail = await fetchDetail(id);
    const status = Number(s.status);

    if (status === 0) return text(`#${id} is still being judged. Check again in a moment.`);

    if (status === 1) {
      const shares = (Number(s.score) / 1000).toFixed(3);
      return text(
        `#${id} ACCEPTED with a novelty score of ${s.score}/1000.\n` +
          `You minted ${shares} royalty shares and got ${formatEther((s.bond * 80n) / 100n)} MON of your bond back.\n` +
          (detail ? `Scorer: ${detail.reason}\n` : "") +
          `Those shares now earn a share of every future sale of this corpus.`,
      );
    }

    if (status === 2) {
      return text(
        `#${id} REJECTED — you forfeited the ${formatEther(s.bond)} MON bond to the existing contributors.\n` +
          (detail ? `Reason: ${detail.reason}\n` : "") +
          `Contribute something the corpus does not already have, and that fits its subject.`,
      );
    }

    return text(`#${id} expired without a verdict; the bond was returned.`);
  },
);

server.tool(
  "corpus_my_earnings",
  "Report this agent's position: royalty shares held, what is claimable now, and what has been lost to rejected submissions.",
  {},
  async () => {
    const [shares, supply, claimable, credits, withdrawn, balance] = await Promise.all([
      read<bigint>("balanceOf", [account.address]),
      read<bigint>("totalSupply"),
      read<bigint>("withdrawableDividendOf", [account.address]),
      read<bigint>("creditsOf", [account.address]),
      read<bigint>("withdrawnDividends", [account.address]),
      publicClient.getBalance({ address: account.address }),
    ]);

    const share = supply > 0n ? (Number(shares) / Number(supply)) * 100 : 0;
    return text(
      [
        `Agent ${account.address}`,
        `Royalty shares: ${(Number(shares) / 1e18).toFixed(3)} (${share.toFixed(1)}% of the corpus)`,
        `Claimable now: ${formatEther(claimable + credits)} MON`,
        `Already collected: ${formatEther(withdrawn)} MON`,
        `Wallet balance: ${formatEther(balance)} MON`,
        ``,
        claimable + credits > 0n
          ? `Call corpus_claim_earnings to collect.`
          : `Nothing to collect yet — shares pay out when someone buys access.`,
      ].join("\n"),
    );
  },
);

server.tool(
  "corpus_claim_earnings",
  "Collect this agent's royalties and any returned bonds. Pays out to the agent's own wallet.",
  {},
  async () => {
    const before = await publicClient.getBalance({ address: account.address });
    const results: string[] = [];
    for (const fn of ["claimDividends", "withdrawCredits"] as const) {
      try {
        await write(fn);
        results.push(fn === "claimDividends" ? "royalties" : "returned bonds");
      } catch {
        // Nothing owed on that track.
      }
    }
    if (results.length === 0) return text("Nothing to claim right now.");
    const after = await publicClient.getBalance({ address: account.address });
    return text(`Collected ${results.join(" and ")}. Wallet went from ${formatEther(before)} to ${formatEther(after)} MON.`);
  },
);

server.tool(
  "corpus_buy_access",
  "Purchase 30 days of read access to the corpus. Costs MON and pays the contributors who built it. Ask the user before spending their funds.",
  {},
  async () => {
    const price = await read<bigint>("accessPrice");
    const scored = Number(await read<bigint>("scoredCount"));
    if (scored === 0) return text("This corpus has no accepted data yet, so access cannot be purchased.");
    try {
      const hash = await write("buyAccess", [], price);
      return text(
        `Bought 30 days of access for ${formatEther(price)} MON.\n` +
          `70% went to the ${scored} contributors, 20% to the curator, 10% to the protocol.\n` +
          `Transaction ${hash}\nUse corpus_read_data to fetch the records.`,
      );
    } catch (err) {
      return text(`Purchase failed: ${String(err)}`);
    }
  },
);

server.tool(
  "corpus_read_data",
  "Read the corpus records. Requires active paid access.",
  {},
  async () => {
    const hasAccess = await read<boolean>("hasAccess", [account.address]);
    if (!hasAccess) return text("This agent has no active access. Call corpus_buy_access first.");

    const timestamp = Date.now();
    const message = `Corpus access request\ncorpus: ${corpus}\nchainId: ${deployment.chainId}\ntimestamp: ${timestamp}`;
    const { walletClient } = await import("./wallet.js");
    const signature = await walletClient.signMessage({ account, message });

    try {
      const url = `${SCORER_API}/manifest?address=${account.address}&timestamp=${timestamp}&signature=${signature}`;
      const res = await fetch(url);
      const data = (await res.json()) as { records?: unknown[]; error?: string };
      if (data.error) return text(`Could not fetch records: ${data.error}`);
      return text(`${data.records?.length ?? 0} records:\n\n${JSON.stringify(data.records, null, 2)}`);
    } catch {
      return text("The corpus data service is unreachable. The chain is fine; the record store is offline.");
    }
  },
);

server.tool(
  "corpus_recent_activity",
  "Show the most recent submissions to the corpus and how each was judged — useful for understanding what this corpus accepts before contributing.",
  { limit: z.number().int().min(1).max(25).default(8).describe("How many recent submissions to show") },
  async ({ limit }) => {
    const count = Number(await read<bigint>("submissionCount"));
    if (count === 0) return text("No submissions yet — this corpus is empty.");

    const start = Math.max(0, count - limit);
    const page = await read<{ contributor: string; score: number; status: number }[]>("getSubmissions", [
      BigInt(start), BigInt(limit),
    ]);

    const lines = await Promise.all(
      page.map(async (s, i) => {
        const id = start + i;
        const detail = await fetchDetail(id);
        const verdict =
          Number(s.status) === 1 ? `accepted (${s.score}/1000)` : Number(s.status) === 2 ? "rejected" : "pending";
        const who = s.contributor.toLowerCase() === account.address.toLowerCase() ? "you" : `${s.contributor.slice(0, 8)}…`;
        return `#${id} ${verdict} — ${who}${detail ? ` — ${detail.reason}` : ""}`;
      }),
    );

    return text(`Last ${page.length} of ${count} submissions:\n\n${lines.reverse().join("\n")}`);
  },
);

async function fetchDetail(id: number): Promise<{ reason: string; gate: string } | null> {
  try {
    const res = await fetch(`${SCORER_API}/state`);
    const data = (await res.json()) as { details: { id: number; reason: string; gate: string }[] };
    return data.details.find((d) => Number(d.id) === id) ?? null;
  } catch {
    return null;
  }
}

await server.connect(new StdioServerTransport());
