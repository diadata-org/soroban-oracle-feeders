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
import type { DustSecretKey, ZswapSecretKeys } from '@midnight-ntwrk/ledger-v8';
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
  // Resync when the wallet has not received an indexer update for this long; 0 disables.
  staleResyncMs?: number;
};

export type MidnightTxResult = {
  txId: string;
  blockHeight: number;
};

export type MidnightOracleClient = {
  setMultipleValues(batch: [string, MidnightOracleValue][]): Promise<MidnightTxResult>;
};

// common-types.ts: WalletKeys
type WalletKeys = {
  shieldedSecretKeys: ZswapSecretKeys;
  dustSecretKey: DustSecretKey;
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
    networkId,
    zkConfigProvider,
    facade,
    shielded,
    unshielded,
    dust,
    dustV1,
    hd,
    abstractions,
    effect,
    oracle,
  ] = await Promise.all([
    importEsm<typeof import('@midnight-ntwrk/ledger-v8')>('@midnight-ntwrk/ledger-v8'),
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
    importEsm<typeof import('@midnight-ntwrk/midnight-js-network-id')>(
      '@midnight-ntwrk/midnight-js-network-id',
    ),
    importEsm<typeof import('@midnight-ntwrk/midnight-js-node-zk-config-provider')>(
      '@midnight-ntwrk/midnight-js-node-zk-config-provider',
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
    // Types by file path: the CommonJS `moduleResolution` here ignores the package's `./v1` export.
    importEsm<typeof import('@midnight-ntwrk/wallet-sdk-dust-wallet/dist/v1/index.js')>(
      '@midnight-ntwrk/wallet-sdk-dust-wallet/v1',
    ),
    importEsm<typeof import('@midnight-ntwrk/wallet-sdk-hd')>('@midnight-ntwrk/wallet-sdk-hd'),
    importEsm<typeof import('@midnight-ntwrk/wallet-sdk-abstractions')>(
      '@midnight-ntwrk/wallet-sdk-abstractions',
    ),
    // The same `effect` instance the wallet SDK uses, for the `Either` the dust wallet expects.
    importEsm<typeof import('effect')>('effect'),
    importEsm<typeof OracleContract>(
      pathToFileURL(path.join(MIDNIGHT_ORACLE_ARTIFACTS, 'contract', 'index.js')).href,
    ),
  ]);

  return {
    ledger,
    compactJs,
    contracts,
    proofProvider,
    publicDataProvider,
    privateStateProvider,
    networkId,
    zkConfigProvider,
    facade,
    shielded,
    unshielded,
    dust,
    dustV1,
    hd,
    abstractions,
    effect,
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

// cli.ts: deriveAllKeys
function deriveKeys(sdk: Sdk, seed: Uint8Array): WalletKeys {
  const { HDWallet, Roles } = sdk.hd;
  const generated = HDWallet.fromSeed(seed);
  if (generated.type !== 'seedOk') {
    throw new Error('Error generating Midnight HD wallet');
  }
  const derivation = generated.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  generated.hdWallet.clear();
  if (derivation.type !== 'keysDerived') {
    throw new Error('Error deriving Midnight wallet keys');
  }
  return {
    unshieldedKeystore: sdk.unshielded.createKeystore(
      derivation.keys[Roles.NightExternal],
      sdk.networkId.getNetworkId(),
    ),
    shieldedSecretKeys: sdk.ledger.ZswapSecretKeys.fromSeed(derivation.keys[Roles.Zswap]),
    dustSecretKey: sdk.ledger.DustSecretKey.fromSeed(derivation.keys[Roles.Dust]),
  };
}

// The SDK's default DUST coin selection is smallest-first. With several small DUST coins, the
// first balancing pass picks the smallest ones, the extra inputs push the fee past what they cover,
// and `computeBalancingRecipe` (wallet-sdk-dust-wallet <= 4.x) then loops forever inside a
// synchronous `Effect.runSync`, blocking the event loop (midnight-wallet#741, unmerged). Picking
// the largest coin first covers the fee in one pass, so the loop converges.
type DustCoin = { type: string; value: bigint };
const largestDustFirst = <T extends DustCoin>(coins: readonly T[], tokenType: string) =>
  coins
    .filter((coin) => coin.type === tokenType)
    .reduce<
      T | undefined
    >((best, coin) => (!best || coin.value > best.value ? coin : best), undefined);

// wallet-sdk-dust-wallet <= 4.x computes the DUST fee in `computeBalancingRecipe` with an
// unbounded loop run through a synchronous `Effect.runSync` (midnight-wallet#741, unmerged). Every
// pass after the first is seeded with a positive fee that the balancer reads as a surplus, so it
// selects no coin and repeats forever, blocking the event loop. It also happens with a single,
// ample DUST coin when the first pass selects nothing. This replaces that method with a bounded
// loop: select coins (largest first) until they cover the fee, dry-run the balancing transaction
// to get the real fee, and repeat with that fee if the selection does not cover it.
const MAX_FEE_PASSES = 8;

function makeBoundedFeeTransacting(sdk: Sdk) {
  const { Either } = sdk.effect;
  const Base: any = sdk.dustV1.Transacting.TransactingCapabilityImplementation;

  class BoundedFeeTransacting extends Base {
    constructor(...args: any[]) {
      super(...args);
    }

    computeBalancingRecipe(
      secretKey: unknown,
      state: unknown,
      transactions: readonly any[],
      ttl: Date,
      currentTime: Date,
      ledgerParams: unknown,
    ) {
      try {
        const self = this as any;
        const baseFee = transactions.reduce<bigint>(
          (total, tx) => total + self.calculateFee(tx, ledgerParams),
          0n,
        );
        const imbalance = transactions.reduce<bigint>(
          (total, tx) => total + Base.feeImbalance(tx, self.calculateFee(tx, ledgerParams)),
          0n,
        );
        const coins: { token: unknown; value: bigint }[] = [
          ...self.getCoins().getAvailableCoinsWithGeneratedDust(state, currentTime),
        ].sort((a, b) => (b.value > a.value ? 1 : b.value < a.value ? -1 : 0));
        console.log(
          `[tx] DUST fee: base fee ${baseFee}, dust imbalance ${imbalance}, ${coins.length} coin(s)`,
        );

        // A negative imbalance is the outstanding deficit; otherwise fall back to the full fee.
        let required = imbalance < 0n ? -imbalance : baseFee;
        for (let pass = 1; pass <= MAX_FEE_PASSES; pass++) {
          const inputs: { token: unknown; value: bigint }[] = [];
          let coverage = 0n;
          for (const coin of coins) {
            if (coverage >= required && inputs.length > 0) {
              break;
            }
            inputs.push({ token: coin.token, value: coin.value });
            coverage += coin.value;
          }
          if (coverage < required) {
            return Either.left(
              new Error(`Insufficient DUST: fee needs ${required}, wallet has ${coverage}`),
            );
          }
          const fee: bigint = self.dryRunFee(
            inputs,
            transactions,
            secretKey,
            state,
            ttl,
            currentTime,
            ledgerParams,
          );
          console.log(
            `[tx] DUST fee pass ${pass}: ${inputs.length} input(s) covering ${coverage}, fee ${fee}`,
          );
          if (fee <= coverage) {
            // Take the fee from the inputs in order (distributeFeeAcrossInputs in the SDK).
            let remaining = fee;
            const recipeInputs = inputs.map((input) => {
              const take = remaining >= input.value ? input.value : remaining;
              remaining -= take;
              return { ...input, value: take };
            });
            return Either.right({ fee, recipeInputs });
          }
          required = fee;
        }
        return Either.left(new Error(`DUST fee did not converge after ${MAX_FEE_PASSES} passes`));
      } catch (err: unknown) {
        return Either.left(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  return (config: any, getContext: () => any) =>
    new BoundedFeeTransacting(
      config.networkId,
      config.costParameters,
      () => getContext().coinSelection,
      () => getContext().coinsAndBalancesCapability,
      () => getContext().keysCapability,
    );
}

let loggedDustBalancing = false;
function dustWallet(sdk: Sdk, configuration: any) {
  if (!loggedDustBalancing) {
    loggedDustBalancing = true;
    console.log('DUST fee balancing: bounded (works around midnight-wallet#741)');
  }
  const builder = new sdk.dustV1.V1Builder()
    .withDefaults()
    .withCoinSelection(() => largestDustFirst as any)
    .withTransacting(makeBoundedFeeTransacting(sdk) as any);
  return sdk.dustV1.CustomDustWallet(configuration, builder as any);
}

// api.ts: walletConfiguration + initWallet
async function initWallet(
  sdk: Sdk,
  config: MidnightOracleConfig,
  keys: WalletKeys,
  serialized?: SerializedWalletState,
): Promise<WalletFacade> {
  const wallet = await sdk.facade.WalletFacade.init({
    configuration: {
      networkId: sdk.networkId.getNetworkId(),
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
        ? sdk.shielded.ShieldedWallet(c).startWithSecretKeys(keys.shieldedSecretKeys)
        : sdk.shielded.ShieldedWallet(c).restore(serialized.shielded),
    unshielded: (c) =>
      serialized === undefined
        ? sdk.unshielded
            .UnshieldedWallet(c)
            .startWithPublicKey(sdk.unshielded.PublicKey.fromKeyStore(keys.unshieldedKeystore))
        : sdk.unshielded.UnshieldedWallet(c).restore(serialized.unshielded),
    dust: (c) =>
      serialized === undefined
        ? dustWallet(sdk, c).startWithSecretKey(
            keys.dustSecretKey,
            sdk.ledger.LedgerParameters.initialParameters().dust,
          )
        : dustWallet(sdk, c).restore(serialized.dust),
  });
  await wallet.start(keys.shieldedSecretKeys, keys.dustSecretKey);
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
    `unshielded=${unshielded}, shielded=${channelProgress(state.shielded.state.progress)}, ` +
    `dust=${channelProgress(state.dust.state.progress)}, dustBalance=${dustBalance(state)}`
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
  onWallet?: (wallet: WalletFacade) => void,
  timeoutMs: number = config.syncTimeoutMs,
): Promise<WalletFacade> {
  const deadline = Date.now() + timeoutMs;
  let restarts = 0;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`Midnight wallet did not sync within ${timeoutMs / 1000}s`);
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
    onWallet?.(wallet);
  }
}

// Keeps a long-running wallet in sync. The wallet's indexer subscriptions die silently when the
// host sleeps or the network drops, and the SDK never reconnects them, so a wallet can sit on stale
// state for days and then try to spend DUST it no longer has. A watchdog ticks every
// `watchdogMs` and runs `resync` when:
//  - something called `flag` (an indexer socket closed abnormally),
//  - its own timer fired late, i.e. the process was suspended (laptop sleep, paused container),
//  - `noteUpdate` was not called for `staleResyncMs` (0 disables this check).
// Resyncs, saves and transactions share one lock, so the wallet is never swapped mid-transaction,
// and a transaction first resyncs if needed and then runs `catchUp`. A failed resync keeps its
// reason, so the next tick or transaction tries again.
export function createSyncSupervisor(options: {
  resync: (reason: string) => Promise<void>;
  catchUp: () => Promise<void>;
  save: () => Promise<void>;
  staleResyncMs: number;
  watchdogMs?: number;
  saveEveryMs?: number;
}) {
  const watchdogMs = options.watchdogMs ?? 30_000;
  const saveEveryMs = options.saveEveryMs ?? 10 * 60_000;
  // A timer due every `watchdogMs` that fires this late means the process was frozen.
  const suspendGapMs = 3 * watchdogMs;

  let lock: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(run: () => Promise<T>): Promise<T> => {
    const result = lock.then(run, run);
    lock = result.catch(() => undefined);
    return result;
  };

  let flagged: string | undefined;
  let lastUpdateAt = Date.now();
  let lastTickAt = Date.now();
  let lastSaveAt = Date.now();

  const pendingReason = (): string | undefined => {
    if (flagged) {
      return flagged;
    }
    // Covers a transaction that starts right after wake-up, before the watchdog has ticked.
    const overdue = Date.now() - lastTickAt;
    if (overdue > suspendGapMs) {
      return `process was suspended for about ${Math.round(overdue / 1000)}s`;
    }
    const silent = Date.now() - lastUpdateAt;
    if (options.staleResyncMs > 0 && silent > options.staleResyncMs) {
      return `no wallet updates for ${Math.round(silent / 1000)}s`;
    }
    return undefined;
  };

  // Runs under the lock.
  const resyncIfNeeded = async () => {
    const reason = pendingReason();
    if (!reason) {
      return;
    }
    flagged = undefined;
    try {
      await options.resync(reason);
      flagged = undefined; // a drop during the resync was handled by it
      lastUpdateAt = Date.now();
    } catch (err: unknown) {
      flagged = `previous resync failed (${reason})`;
      throw err;
    }
  };

  let busy = false;
  const timer = setInterval(() => {
    // Measured outside the lock, so waiting behind a long transaction is not mistaken for sleep.
    const now = Date.now();
    const gap = now - lastTickAt;
    lastTickAt = now;
    if (gap > suspendGapMs) {
      flagged ??= `process was suspended for about ${Math.round(gap / 1000)}s`;
    }
    if (busy) {
      return;
    }
    busy = true;
    void exclusive(async () => {
      await resyncIfNeeded();
      if (Date.now() - lastSaveAt > saveEveryMs) {
        lastSaveAt = Date.now();
        await options.save();
      }
    })
      .catch((err: unknown) => console.error('Midnight wallet resync failed, will retry:', err))
      .finally(() => {
        busy = false;
      });
  }, watchdogMs);

  return {
    flag(reason: string) {
      flagged ??= reason;
    },
    noteUpdate() {
      lastUpdateAt = Date.now();
    },
    transaction<T>(run: () => Promise<T>): Promise<T> {
      return exclusive(async () => {
        await resyncIfNeeded();
        await options.catchUp();
        flagged = undefined;
        const result = await run();
        lastSaveAt = Date.now(); // the transaction saves the wallet itself
        return result;
      });
    },
    stop() {
      clearInterval(timer);
    },
  };
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
  // api.ts: the indexer client subscribes over websockets through apollo, which expects `ws`.
  (globalThis as any).WebSocket = IndexerAwareWebSocket;
  indexerWsOrigin = new URL(config.indexerWsUrl).origin.replace(/^http/, 'ws');

  const sdk = await loadSdk();
  sdk.networkId.setNetworkId(config.networkId);

  const keys = deriveKeys(sdk, toSeedBytes(config.seed));
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

  // Background sync supervisor (see createSyncSupervisor). Every new wallet is watched for
  // updates, so a silent one is noticed.
  let updates: Rx.Subscription | undefined;
  const useWallet = (next: WalletFacade) => {
    wallet = next;
    updates?.unsubscribe();
    supervisor.noteUpdate();
    updates = next.state().subscribe({
      next: () => supervisor.noteUpdate(),
      error: () => undefined, // reported through the socket wrapper
    });
  };

  const RESYNC_TIMEOUT_MS = 15 * 60_000;
  const supervisor = createSyncSupervisor({
    staleResyncMs: config.staleResyncMs ?? 15 * 60_000,
    // Resume the wallet from its own serialized state: seconds, no replay of the chain.
    resync: async (reason) => {
      console.warn(`Resyncing Midnight wallet: ${reason}`);
      const started = Date.now();
      let serialized: SerializedWalletState | undefined;
      try {
        serialized = await serializeWallet(wallet);
      } catch (err: unknown) {
        console.error('Could not serialize the running wallet, using the sync cache:', err);
        serialized =
          cacheFile && fs.existsSync(cacheFile)
            ? (JSON.parse(fs.readFileSync(cacheFile, 'utf-8')) as SerializedWalletState)
            : undefined;
      }
      await wallet.stop().catch(() => undefined);
      useWallet(await initWallet(sdk, config, keys, serialized));
      useWallet(await syncWallet(sdk, config, keys, wallet, useWallet, RESYNC_TIMEOUT_MS));
      await saveState(wallet).catch((err) =>
        console.error('Failed to save Midnight wallet state:', err),
      );
      const synced = await Rx.firstValueFrom(wallet.state());
      console.log(
        `Midnight wallet resynced in ${((Date.now() - started) / 1000).toFixed(1)}s. ${syncSummary(synced)}`,
      );
    },
    // Before a transaction: make sure every channel has caught up (returns at once if it has).
    catchUp: async () => {
      useWallet(await syncWallet(sdk, config, keys, wallet, useWallet, RESYNC_TIMEOUT_MS));
    },
    // Keep the sync cache fresh, so a restart resumes from minutes ago rather than the last tx.
    save: () => saveState(wallet),
  });
  indexerSocketDrops.subscribe(() => supervisor.flag('indexer connection dropped'));
  useWallet(wallet);

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

  // api.ts: createWalletAndMidnightProvider
  const walletProvider = {
    getCoinPublicKey: () => keys.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => keys.shieldedSecretKeys.encryptionPublicKey,
    // Same steps as WalletFacade.balanceUnboundTransaction, run one by one so the log shows which
    // one stops. A step that blocks the event loop cannot time out, so its "done" line is missing.
    async balanceTx(tx: Parameters<WalletFacade['balanceUnboundTransaction']>[0], ttl?: Date) {
      const txTtl = ttl ?? new Date(Date.now() + 60 * 60 * 1000); // ttlOneHour

      const { dust } = await Rx.firstValueFrom(wallet.state());
      const available = [...dust.availableCoins].sort((a, b) =>
        b.generatedNow > a.generatedNow ? 1 : b.generatedNow < a.generatedNow ? -1 : 0,
      );
      console.log(
        `[tx] DUST coins: ${available.length} available, ${dust.pendingCoins.length} pending; ` +
          `largest: ${
            available
              .slice(0, 5)
              .map((c) => c.generatedNow)
              .join(', ') || '-'
          }`,
      );

      const shieldedBalancing = await step('shielded balancing', 5 * 60_000, () =>
        wallet.shielded.balanceTransaction(keys.shieldedSecretKeys, tx as any),
      );
      const balancedUnshielded = await step('unshielded balancing', 5 * 60_000, () =>
        wallet.unshielded.balanceUnboundTransaction(tx),
      );
      const baseTx: any = balancedUnshielded ?? tx;
      const feeBalancing = await step('DUST fee balancing', 5 * 60_000, () =>
        wallet.dust.balanceTransactions(
          keys.dustSecretKey,
          shieldedBalancing ? [baseTx, shieldedBalancing as any] : [baseTx],
          txTtl,
        ),
      );
      const balancingTransaction =
        shieldedBalancing && feeBalancing
          ? (shieldedBalancing as any).merge(feeBalancing)
          : (shieldedBalancing ?? feeBalancing);
      if (!balancingTransaction && !balancedUnshielded) {
        throw new Error('No balancing transaction was created. Please check your transaction.');
      }
      const recipe = {
        type: 'UNBOUND_TRANSACTION',
        baseTransaction: baseTx,
        balancingTransaction: balancingTransaction ?? undefined,
      } as Parameters<WalletFacade['finalizeRecipe']>[0];
      return step('proving fee payment', 10 * 60_000, () => wallet.finalizeRecipe(recipe));
    },
    submitTx: (tx: Parameters<WalletFacade['submitTransaction']>[0]) =>
      step('submitting and waiting for finalization', 10 * 60_000, () =>
        wallet.submitTransaction(tx),
      ),
  };

  // api.ts: configureProviders
  const zkConfigProvider = new sdk.zkConfigProvider.NodeZkConfigProvider(
    MIDNIGHT_ORACLE_ARTIFACTS,
  );
  const providers = {
    privateStateProvider: sdk.privateStateProvider.levelPrivateStateProvider({
      midnightDbName: config.privateStateDir,
      privateStateStoreName: 'oracle-private-state',
      privateStoragePasswordProvider: () => config.privateStatePassword,
      accountId: 'oracle-feeder',
    }),
    publicDataProvider: sdk.publicDataProvider.indexerPublicDataProvider(
      config.indexerUrl,
      config.indexerWsUrl,
    ),
    zkConfigProvider,
    proofProvider: sdk.proofProvider.httpClientProofProvider(
      config.proofServerUrl,
      zkConfigProvider,
    ),
    walletProvider,
    midnightProvider: walletProvider,
  };

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
    setMultipleValues(batch) {
      if (batch.length !== MIDNIGHT_BATCH_SIZE) {
        throw new Error(`Midnight batch must have exactly ${MIDNIGHT_BATCH_SIZE} entries`);
      }
      return supervisor.transaction(async () => {
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
      });
    },
  };
}
