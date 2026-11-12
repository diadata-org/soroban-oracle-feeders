// Midnight oracle client. The Midnight SDK leaves wallet sync, DUST fee balancing and provider wiring
// to the caller; this follows the DIA Midnight oracle repository (oracle-cli/src/api.ts and cli.ts),
// with each function naming the one it mirrors, so fixes there can be carried over.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as bip39 from 'bip39';
import * as Rx from 'rxjs';
import { WebSocket } from 'ws';
import type { WalletFacade, FacadeState } from '@midnight-ntwrk/wallet-sdk-facade';
import type { ZswapSecretKeys } from '@midnightntwrk/ledger-v9';
import type { WalletSeeds } from '@midnight-ntwrk/wallet-sdk-hd';
import type { UnshieldedKeystore } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import type * as OracleContract from './midnight/managed/oracle/contract';

// Mirrors `OracleValue` in oracle.compact
export type MidnightOracleValue = { value: bigint; timestamp: bigint };

// The oracle contract takes a fixed-width `Vector<10, [key, value]>` (Compact has no dynamic vectors
// as circuit arguments), so every batch update carries exactly this many entries.
export const MIDNIGHT_BATCH_SIZE = 10;

// Compiled output of `oracle.compact` (contract JS, prover/verifier keys and ZKIR), copied from
// contract/src/managed/oracle of the Midnight oracle repository. Resolved against `src` so it works
// from both `build` and ts-jest.
export const MIDNIGHT_ORACLE_ARTIFACTS = path.resolve(
  __dirname,
  '..',
  'src',
  'midnight',
  'managed',
  'oracle',
);

// common-types.ts: OraclePrivateStateId
const PRIVATE_STATE_ID = 'oraclePrivateState';

// tsc rewrites `import()` into `require()` when targeting CommonJS, but the Midnight SDK is ESM-only
// (most packages have no `require` export condition), so the native dynamic import is kept out of
// the compiler's reach.
const importEsm = new Function('specifier', 'return import(specifier)') as <T>(
  specifier: string,
) => Promise<T>;

export type MidnightOracleConfig = {
  networkId: string;
  indexerUrl: string;
  indexerWsUrl: string;
  nodeUrl: string;
  proofServerUrl: string;
  seed: string; // BIP-39 mnemonic or 32-byte hex seed
  contractAddress: string;
  privateStateDir: string;
  privateStatePassword: string;
  syncCacheDir?: string;
  syncTimeoutMs: number;
};

export type MidnightTxResult = {
  txId: string;
  blockHeight: number;
};

export type MidnightOracleClient = {
  setMultipleValues(batch: [string, MidnightOracleValue][]): Promise<MidnightTxResult>;
};

// common-types.ts: WalletKeys. Wallet SDK 2 starts its wallets from seeds, not key objects: each ledger
// version derives its own keys from the same seed, which lets the wallet read the chain across the fork.
type WalletKeys = {
  seeds: WalletSeeds;
  // Ledger 9 keys of the same seeds, for the public keys the contract providers hand out.
  shieldedSecretKeys: ZswapSecretKeys;
  unshieldedKeystore: UnshieldedKeystore;
};

// api.ts: SerializedWalletState (without `appliedId`, only used there for the chain-reset check)
type SerializedWalletState = {
  shielded: string;
  unshielded: string;
  dust: string;
};

async function loadSdk() {
  const [
    ledger,
    compactJs,
    contracts,
    proofProvider,
    publicDataProvider,
    privateStateProvider,
    zkConfigProvider,
    midnightTypes,
    midnightUtils,
    facade,
    shielded,
    unshielded,
    dust,
    hd,
    abstractions,
    oracle,
  ] = await Promise.all([
    importEsm<typeof import('@midnightntwrk/ledger-v9')>('@midnightntwrk/ledger-v9'),
    importEsm<typeof import('@midnight-ntwrk/compact-js')>('@midnight-ntwrk/compact-js'),
    importEsm<typeof import('@midnight-ntwrk/midnight-js-contracts')>(
      '@midnight-ntwrk/midnight-js-contracts',
    ),
    importEsm<typeof import('@midnight-ntwrk/midnight-js-http-client-proof-provider')>(
      '@midnight-ntwrk/midnight-js-http-client-proof-provider',
    ),
    importEsm<typeof import('@midnight-ntwrk/midnight-js-indexer-public-data-provider')>(
      '@midnight-ntwrk/midnight-js-indexer-public-data-provider',
    ),
    importEsm<typeof import('@midnight-ntwrk/midnight-js-level-private-state-provider')>(
      '@midnight-ntwrk/midnight-js-level-private-state-provider',
    ),
    importEsm<typeof import('@midnight-ntwrk/midnight-js-node-zk-config-provider')>(
      '@midnight-ntwrk/midnight-js-node-zk-config-provider',
    ),
    importEsm<typeof import('@midnight-ntwrk/midnight-js-types')>(
      '@midnight-ntwrk/midnight-js-types',
    ),
    importEsm<typeof import('@midnight-ntwrk/midnight-js-utils')>(
      '@midnight-ntwrk/midnight-js-utils',
    ),
    importEsm<typeof import('@midnight-ntwrk/wallet-sdk-facade')>(
      '@midnight-ntwrk/wallet-sdk-facade',
    ),
    importEsm<typeof import('@midnight-ntwrk/wallet-sdk-shielded')>(
      '@midnight-ntwrk/wallet-sdk-shielded',
    ),
    importEsm<typeof import('@midnight-ntwrk/wallet-sdk-unshielded-wallet')>(
      '@midnight-ntwrk/wallet-sdk-unshielded-wallet',
    ),
    importEsm<typeof import('@midnight-ntwrk/wallet-sdk-dust-wallet')>(
      '@midnight-ntwrk/wallet-sdk-dust-wallet',
    ),
    importEsm<typeof import('@midnight-ntwrk/wallet-sdk-hd')>('@midnight-ntwrk/wallet-sdk-hd'),
    importEsm<typeof import('@midnight-ntwrk/wallet-sdk-abstractions')>(
      '@midnight-ntwrk/wallet-sdk-abstractions',
    ),
    importEsm<typeof OracleContract>(
      pathToFileURL(path.join(MIDNIGHT_ORACLE_ARTIFACTS, 'contract', 'index.js')).href,
    ).catch((err: unknown) => {
      // The generated contract checks the runtime it was compiled for when it is loaded.
      throw new Error(
        `Could not load the oracle contract from ${MIDNIGHT_ORACLE_ARTIFACTS}: ${String(err)}. ` +
          'The feeder runs ledger 9 (compact-runtime 0.21.0): copy in contract/src/managed/oracle of ' +
          'the deployed contract, compiled with Compact toolchain 0.36.0.',
      );
    }),
  ]);

  return {
    ledger,
    compactJs,
    contracts,
    proofProvider,
    publicDataProvider,
    privateStateProvider,
    zkConfigProvider,
    midnightTypes,
    midnightUtils,
    facade,
    shielded,
    unshielded,
    dust,
    hd,
    abstractions,
    oracle,
  };
}

type Sdk = Awaited<ReturnType<typeof loadSdk>>;

// cli.ts: `bip39.mnemonicToSeedSync(mnemonic)`, or a raw hex seed as for GENESIS_MINT_WALLET_SEED
function toSeedBytes(seed: string): Uint8Array {
  const trimmed = seed.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }
  if (!bip39.validateMnemonic(trimmed)) {
    throw new Error('Midnight seed is neither a valid BIP-39 mnemonic nor a 32-byte hex seed');
  }
  return bip39.mnemonicToSeedSync(trimmed);
}

// cli.ts: deriveAllKeys. Same tree positions as before (account 0, address index 0; Zswap,
// NightExternal and Dust roles), so the wallet, its DUST and the contract's updater key are unchanged.
function deriveKeys(sdk: Sdk, masterSeed: Uint8Array, networkId: string): WalletKeys {
  const seeds = sdk.hd.WalletSeeds.fromMasterSeed(masterSeed);
  return {
    seeds,
    shieldedSecretKeys: sdk.ledger.ZswapSecretKeys.fromSeed(seeds.shielded),
    unshieldedKeystore: sdk.unshielded.createKeystore(
      { kind: 'schnorr', secret: seeds.unshielded },
      networkId,
    ),
  };
}

// api.ts: walletConfiguration + initWallet
async function initWallet(
  sdk: Sdk,
  config: MidnightOracleConfig,
  keys: WalletKeys,
  serialized?: SerializedWalletState,
): Promise<WalletFacade> {
  const { seeds } = keys;
  const wallet = await sdk.facade.WalletFacade.init({
    configuration: {
      networkId: config.networkId,
      // `forks` is left to the facade's default (ledger 9 from protocol version 2000000). Mainnet and
      // preprod report 1.x versions on their ledger 8 history and 2.x after the fork.
      costParameters: { feeBlocksMargin: 5 },
      relayURL: new URL(config.nodeUrl),
      provingServerUrl: new URL(config.proofServerUrl),
      indexerClientConnection: {
        indexerHttpUrl: config.indexerUrl,
        indexerWsUrl: config.indexerWsUrl,
      },
      txHistoryStorage: new sdk.abstractions.NoOpTransactionHistoryStorage(),
      // A fresh wallet replays the chain's whole shielded and DUST history. The SDK defaults apply it
      // in tiny throttled batches that exhaust the heap on a network with real history.
      batchUpdates: { size: 300_000, timeout: 100, spacing: 0 },
    },
    shielded: (c) =>
      serialized === undefined
        ? sdk.shielded.ShieldedWallet(c).startWithSeed(seeds.shielded)
        : sdk.shielded.ShieldedWallet(c).restore(serialized.shielded),
    unshielded: (c) =>
      serialized === undefined
        ? sdk.unshielded
            .UnshieldedWallet(c)
            .startWithPublicKey(sdk.unshielded.PublicKey.fromKeyStore(keys.unshieldedKeystore))
        : sdk.unshielded.UnshieldedWallet(c).restore(serialized.unshielded),
    dust: (c) =>
      serialized === undefined
        ? sdk.dust.DustWallet(c).startWithSeed(seeds.dust)
        : sdk.dust.DustWallet(c).restore(serialized.dust),
  });
  await wallet.start(seeds);
  return wallet;
}

// api.ts: dustBalance
function dustBalance(state: FacadeState): bigint {
  try {
    return state.dust.balance(new Date());
  } catch {
    return 0n; // throws while the DUST channel is still catching up
  }
}

// api.ts: channelProgress
function channelProgress(progress: {
  appliedIndex: bigint;
  highestRelevantWalletIndex: bigint;
  isStrictlyComplete: () => boolean;
}): string {
  if (progress.isStrictlyComplete()) {
    return 'synced';
  }
  const { appliedIndex: applied, highestRelevantWalletIndex: target } = progress;
  // The target is only known once the first progress update arrives from the indexer.
  if (target <= 0n) {
    return `${applied}/? `.trim();
  }
  const percent = Number((applied * 1000n) / target) / 10;
  return `${applied}/${target} (${percent.toFixed(1)}%)`;
}

// api.ts: syncSummary
function syncSummary(state: FacadeState): string {
  const unshielded = state.unshielded.progress.isStrictlyComplete()
    ? 'synced'
    : `applied ${state.unshielded.progress.appliedId}`;
  return (
    `unshielded=${unshielded}, shielded=${channelProgress(state.shielded.progress)}, ` +
    `dust=${channelProgress(state.dust.progress)}, dustBalance=${dustBalance(state)}`
  );
}

// api.ts: waitForSync + logSyncProgress (also waits for DUST, and gives up after `timeoutMs`)
async function waitForSync(wallet: WalletFacade, timeoutMs: number): Promise<FacadeState> {
  return Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(10_000, undefined, { leading: true, trailing: true }),
      Rx.tap((state) => {
        if (!state.isSynced) {
          console.log(`Waiting for funds. ${syncSummary(state)}`);
        }
      }),
      Rx.filter((state) => state.isSynced),
      Rx.timeout(timeoutMs),
    ),
  );
}

// The wallet SDK opens one indexer subscription per channel (shielded, unshielded, DUST) with
// `shouldRetry: () => false`, and runs each in a background fiber. When the indexer closes a socket
// (Blockfrost does this on long-lived connections), that channel's fiber dies and the channel stays
// frozen at its last applied state; nothing is rethrown to the caller. The socket wrapper below
// reports those closes, and the wallet is rebuilt from its own serialized state, so it resumes
// where it stopped rather than replaying the chain.
const indexerSocketDrops = new Rx.Subject<string>();
let indexerWsOrigin: string | undefined;

const redact = (url: string) => url.replace(/(project_id=)[^&]+/i, '$1***');

class IndexerAwareWebSocket extends WebSocket {
  constructor(address: any, protocols?: any, options?: any) {
    super(address, protocols, options);
    const url = String(address);
    this.on('error', (err) => console.error(`[ws] error ${redact(url)}: ${err.message}`));
    this.on('close', (code, reason) => {
      // 1000 is a normal closure, which is also what `wallet.stop()` sends.
      if (code === 1000) {
        return;
      }
      console.error(`[ws] close ${redact(url)} code=${code} reason=${reason.toString() || '-'}`);
      if (indexerWsOrigin && url.startsWith(indexerWsOrigin)) {
        indexerSocketDrops.next(url);
      }
    });
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function serializeWallet(wallet: WalletFacade): Promise<SerializedWalletState> {
  return {
    shielded: await wallet.shielded.serializeState(),
    unshielded: await wallet.unshielded.serializeState(),
    dust: await wallet.dust.serializeState(),
  };
}

// Stops the wallet and starts a new one from where it got to.
async function restartWallet(
  sdk: Sdk,
  config: MidnightOracleConfig,
  keys: WalletKeys,
  wallet: WalletFacade,
): Promise<WalletFacade> {
  const serialized = await serializeWallet(wallet);
  await wallet.stop().catch(() => undefined);
  return initWallet(sdk, config, keys, serialized);
}

// waitForSync, but rebuilds the wallet whenever an indexer socket drops before it is synced.
async function syncWallet(
  sdk: Sdk,
  config: MidnightOracleConfig,
  keys: WalletKeys,
  wallet: WalletFacade,
): Promise<WalletFacade> {
  const deadline = Date.now() + config.syncTimeoutMs;
  let restarts = 0;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`Midnight wallet did not sync within ${config.syncTimeoutMs / 1000}s`);
    }
    const outcome = await Promise.race([
      waitForSync(wallet, remaining).then(() => 'synced' as const),
      Rx.firstValueFrom(indexerSocketDrops).then(() => 'dropped' as const),
    ]);
    if (outcome === 'synced') {
      return wallet;
    }
    restarts++;
    const backoff = Math.min(60_000, 2_000 * 2 ** Math.min(restarts, 5));
    console.warn(`Indexer connection dropped, resuming wallet sync in ${backoff / 1000}s`);
    await sleep(backoff);
    wallet = await restartWallet(sdk, config, keys, wallet);
  }
}

// api.ts: buildWalletAndWaitForFunds (restore from the sync cache, else build from scratch)
async function buildWallet(
  sdk: Sdk,
  config: MidnightOracleConfig,
  keys: WalletKeys,
  cacheFile?: string,
): Promise<WalletFacade> {
  if (cacheFile && fs.existsSync(cacheFile)) {
    let wallet: WalletFacade | undefined;
    try {
      console.log(`Restoring Midnight wallet state from ${cacheFile}`);
      const serialized = JSON.parse(fs.readFileSync(cacheFile, 'utf-8')) as SerializedWalletState;
      wallet = await initWallet(sdk, config, keys, serialized);
      return await syncWallet(sdk, config, keys, wallet);
    } catch (err: unknown) {
      console.error('Could not restore Midnight wallet state, syncing from scratch:', err);
      await wallet?.stop().catch(() => undefined);
    }
  }

  const wallet = await initWallet(sdk, config, keys);
  return syncWallet(sdk, config, keys, wallet);
}

export async function connectMidnightOracle(
  config: MidnightOracleConfig,
): Promise<MidnightOracleClient> {
  for (const [name, value] of Object.entries({
    MIDNIGHT_INDEXER_URL: config.indexerUrl,
    MIDNIGHT_INDEXER_WS_URL: config.indexerWsUrl,
    MIDNIGHT_NODE_URL: config.nodeUrl,
    MIDNIGHT_CONTRACT: config.contractAddress,
    MIDNIGHT_SEED: config.seed,
  })) {
    if (!value) {
      throw new Error(`${name} is not set`);
    }
  }
  // api.ts: the indexer client subscribes over websockets through apollo, which expects `ws`.
  (globalThis as any).WebSocket = IndexerAwareWebSocket;
  indexerWsOrigin = new URL(config.indexerWsUrl).origin.replace(/^http/, 'ws');

  const sdk = await loadSdk();
  const keys = deriveKeys(sdk, toSeedBytes(config.seed), config.networkId);
  const address = String(keys.unshieldedKeystore.getBech32Address());
  console.log(`Midnight wallet address: ${address}`);

  // cli.ts: cacheFilename. Scoped by network and wallet, so a snapshot from one chain or seed is
  // never restored onto another.
  const cacheFile = config.syncCacheDir
    ? path.join(config.syncCacheDir, `wallet-${config.networkId}-${address.slice(-12)}.json`)
    : undefined;

  // api.ts: saveState
  const saveState = async (w: WalletFacade) => {
    if (!cacheFile) {
      return;
    }
    const serialized = await serializeWallet(w);
    await fs.promises.mkdir(path.dirname(cacheFile), { recursive: true });
    await fs.promises.writeFile(cacheFile, JSON.stringify(serialized));
  };

  // `let`: the providers below always use the current wallet, which is replaced after a drop.
  let wallet = await buildWallet(sdk, config, keys, cacheFile);
  await saveState(wallet).catch((err) =>
    console.error('Failed to save Midnight wallet state:', err),
  );

  // Drops after the initial sync are handled before the next transaction.
  let needsResync = false;
  indexerSocketDrops.subscribe(() => {
    needsResync = true;
  });
  const ensureSynced = async () => {
    if (!needsResync) {
      return;
    }
    needsResync = false;
    console.warn('Indexer connection dropped since the last update, resyncing wallet');
    wallet = await syncWallet(sdk, config, keys, await restartWallet(sdk, config, keys, wallet));
  };

  const state = await Rx.firstValueFrom(wallet.state());
  const dust = dustBalance(state);
  console.log(`Midnight wallet synced, DUST balance: ${dust}`);
  if (dust === 0n) {
    console.error('Midnight wallet has no DUST, oracle updates cannot pay fees');
  }

  // Each wallet step logs its duration and fails after a timeout, so a stuck transaction shows
  // where it stopped and the caller's retry logic takes over instead of waiting forever.
  const step = async <T>(name: string, timeoutMs: number, run: () => Promise<T>): Promise<T> => {
    const started = Date.now();
    console.log(`[tx] ${name}...`);
    let timer: NodeJS.Timeout | undefined;
    try {
      const result = await Promise.race([
        run(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`${name} timed out after ${timeoutMs / 1000}s`)),
            timeoutMs,
          );
        }),
      ]);
      console.log(`[tx] ${name} done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
      return result;
    } finally {
      clearTimeout(timer);
    }
  };

  // api.ts: createWalletAndMidnightProvider. Midnight.js 5 hands transactions over as era-tagged
  // handles and the wallet facade keeps handles of its own; the two meet as bytes. Both providers serve
  // ledger 9 only, the only ledger the networks accept. The facade signs with the seeds it was started
  // from, so balancing takes no secret keys. Fee balancing is the SDK's own again: wallet SDK 2 fixed
  // the DUST fee loop (midnight-wallet#741) that this file used to work around.
  const ttlMs = 60 * 60 * 1000; // ttlOneHour
  const walletProvider = sdk.midnightTypes.createLedger9WalletProvider({
    getCoinPublicKey: () => keys.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => keys.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(tx, ttl) {
      console.log(
        `[tx] DUST available for fees: ${dustBalance(await Rx.firstValueFrom(wallet.state()))}`,
      );
      const unbound = wallet.adoptTransaction(tx.serialize(), 'Unbound');
      const recipe = await step('balancing fees', 5 * 60_000, () =>
        wallet.balanceUnboundTransaction(unbound, { ttl: ttl ?? new Date(Date.now() + ttlMs) }),
      );
      return step('proving fee payment', 10 * 60_000, () => wallet.finalizeRecipe(recipe));
    },
  });
  const midnightProvider = sdk.midnightTypes.createLedger9MidnightProvider((tx) =>
    step('submitting and waiting for finalization', 10 * 60_000, () =>
      wallet.submitTransaction(wallet.adoptTransaction(tx.serialize(), 'Finalized')),
    ),
  );

  // api.ts: configureProviders. Default ('require') integrity mode: Compact 0.36 writes a manifest
  // next to the keys, and every key and ZKIR is checked against it before use.
  const zkConfigProvider = new sdk.zkConfigProvider.NodeZkConfigProvider(
    MIDNIGHT_ORACLE_ARTIFACTS,
  );
  const providers = sdk.midnightUtils.createMidnightProviders({
    privateStateProvider: sdk.privateStateProvider.levelPrivateStateProvider({
      midnightDbName: config.privateStateDir,
      privateStateStoreName: 'oracle-private-state',
      privateStoragePasswordProvider: () => config.privateStatePassword,
      accountId: 'oracle-feeder',
    }),
    publicDataProvider: sdk.publicDataProvider.indexerPublicDataProvider({
      queryURL: config.indexerUrl,
      subscriptionURL: config.indexerWsUrl,
    }),
    zkConfigProvider,
    proofProvider: sdk.proofProvider.httpClientProofProvider({
      url: config.proofServerUrl,
      zkConfigProvider,
    }),
    walletProvider,
    midnightProvider,
    config: { networkId: config.networkId, ttlSeconds: ttlMs / 1000 },
  });

  // api.ts: compiledOracleContract
  const { CompiledContract } = sdk.compactJs;
  const compiledContract = CompiledContract.make('Oracle', sdk.oracle.Contract).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets(MIDNIGHT_ORACLE_ARTIFACTS),
  );

  // api.ts: joinContract
  const contract = await sdk.contracts.findDeployedContract(providers as any, {
    contractAddress: config.contractAddress,
    compiledContract: compiledContract as any,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: {},
  });
  console.log(`Joined Midnight oracle contract at ${config.contractAddress}`);

  return {
    // api.ts: setMultipleValues, then saveState so a restart resumes from the latest sync point
    async setMultipleValues(batch) {
      if (batch.length !== MIDNIGHT_BATCH_SIZE) {
        throw new Error(`Midnight batch must have exactly ${MIDNIGHT_BATCH_SIZE} entries`);
      }
      await ensureSynced();
      console.log('[tx] proving set_multiple_values...');
      const finalized = await (contract.callTx as any).set_multiple_values(batch);
      try {
        await saveState(wallet);
      } catch (err: unknown) {
        console.error('Failed to save Midnight wallet state:', err);
      }
      return {
        txId: String(finalized.public.txId),
        blockHeight: Number(finalized.public.blockHeight),
      };
    },
  };
}
