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
    hd,
    abstractions,
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
    importEsm<typeof import('@midnight-ntwrk/wallet-sdk-hd')>('@midnight-ntwrk/wallet-sdk-hd'),
    importEsm<typeof import('@midnight-ntwrk/wallet-sdk-abstractions')>(
      '@midnight-ntwrk/wallet-sdk-abstractions',
    ),
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
        ? sdk.dust
            .DustWallet(c)
            .startWithSecretKey(
              keys.dustSecretKey,
              sdk.ledger.LedgerParameters.initialParameters().dust,
            )
        : sdk.dust.DustWallet(c).restore(serialized.dust),
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

// api.ts: waitForSync (also waits for DUST, and gives up after `timeoutMs`)
async function waitForSync(wallet: WalletFacade, timeoutMs: number): Promise<FacadeState> {
  return Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(10_000, undefined, { leading: true, trailing: true }),
      Rx.tap((state) => {
        if (!state.isSynced) {
          console.log(`Midnight wallet syncing, DUST balance: ${dustBalance(state)}`);
        }
      }),
      Rx.filter((state) => state.isSynced),
      Rx.timeout(timeoutMs),
    ),
  );
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
      await waitForSync(wallet, config.syncTimeoutMs);
      return wallet;
    } catch (err: unknown) {
      console.error('Could not restore Midnight wallet state, syncing from scratch:', err);
      await wallet?.stop().catch(() => undefined);
    }
  }

  const wallet = await initWallet(sdk, config, keys);
  await waitForSync(wallet, config.syncTimeoutMs);
  return wallet;
}

export async function connectMidnightOracle(
  config: MidnightOracleConfig,
): Promise<MidnightOracleClient> {
  // api.ts: the indexer client subscribes over websockets through apollo, which expects `ws`.
  // @ts-expect-error: `ws` is not a drop-in type for the DOM WebSocket
  globalThis.WebSocket = WebSocket;

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

  const wallet = await buildWallet(sdk, config, keys, cacheFile);

  // api.ts: syncFailed. A failed sync can leave local state inconsistent with the chain; persisting
  // it produces transactions the node rejects, so the cache is no longer written.
  let syncFailed = false;
  wallet.state().subscribe({
    error: (err: unknown) => {
      syncFailed = true;
      console.error('Midnight wallet sync error:', err);
    },
  });

  const state = await Rx.firstValueFrom(wallet.state());
  const dust = dustBalance(state);
  console.log(`Midnight wallet synced, DUST balance: ${dust}`);
  if (dust === 0n) {
    console.error('Midnight wallet has no DUST, oracle updates cannot pay fees');
  }

  // api.ts: createWalletAndMidnightProvider
  const walletProvider = {
    getCoinPublicKey: () => keys.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => keys.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(tx: Parameters<WalletFacade['balanceUnboundTransaction']>[0], ttl?: Date) {
      const recipe = await wallet.balanceUnboundTransaction(tx, keys, {
        ttl: ttl ?? new Date(Date.now() + 60 * 60 * 1000), // ttlOneHour
      });
      return wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx: Parameters<WalletFacade['submitTransaction']>[0]) =>
      wallet.submitTransaction(tx),
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

  // api.ts: saveState
  const saveState = async () => {
    if (!cacheFile || syncFailed) {
      return;
    }
    const serialized: SerializedWalletState = {
      shielded: await wallet.shielded.serializeState(),
      unshielded: await wallet.unshielded.serializeState(),
      dust: await wallet.dust.serializeState(),
    };
    await fs.promises.mkdir(path.dirname(cacheFile), { recursive: true });
    await fs.promises.writeFile(cacheFile, JSON.stringify(serialized));
  };

  return {
    // api.ts: setMultipleValues, then saveState so a restart resumes from the latest sync point
    async setMultipleValues(batch) {
      if (batch.length !== MIDNIGHT_BATCH_SIZE) {
        throw new Error(`Midnight batch must have exactly ${MIDNIGHT_BATCH_SIZE} entries`);
      }
      const finalized = await (contract.callTx as any).set_multiple_values(batch);
      try {
        await saveState();
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
