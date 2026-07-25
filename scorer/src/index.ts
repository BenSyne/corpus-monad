import { makeClients } from "./chain.js";
import { loadState } from "./state.js";
import { startStateApi } from "./stateApi.js";
import { Watcher } from "./watcher.js";

async function main() {
  const clients = makeClients();
  const head = Number(await clients.publicClient.getBlockNumber());
  const state = loadState(clients.corpus, clients.deployment.deployBlock, head);

  console.log(`[scorer] watching ${clients.corpus} on ${clients.deployment.network} from block ${state.lastProcessedBlock}`);

  const watcher = new Watcher(clients, state);
  await watcher.bootstrap();
  watcher.start();
  const server = startStateApi(clients, state);

  const shutdown = () => {
    watcher.stop();
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[scorer] fatal:", err);
  process.exit(1);
});
