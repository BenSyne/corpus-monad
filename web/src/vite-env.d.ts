/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public RPC the hosted dashboard should read from. */
  readonly VITE_RPC_URL?: string;
  /** Publicly reachable scorer API; omit and the dashboard runs in chain-only mode. */
  readonly VITE_SCORER_API?: string;
  readonly VITE_CORPUS_ADDRESS?: string;
  readonly VITE_CHAIN_ID?: string;
  readonly VITE_EXPLORER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
