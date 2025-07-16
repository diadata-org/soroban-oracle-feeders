import config, { ChainName } from '../config';
import {
  splitIntoFixedBatches,
  type OracleContract,
  type OraclePrivateStateId,
  type OracleProviders,
  type DeployedOracleContract,
  OracleCircuits,
} from '../utils';
import path from 'path';

/** Midnight library imports */
import {
  getLedgerNetworkId,
  getZswapNetworkId,
  NetworkId,
  setNetworkId,
} from '@midnight-ntwrk/midnight-js-network-id';
import { Oracle, witnesses } from '@repo/common';
import { Wallet } from '@midnight-ntwrk/wallet-api';
import { WalletBuilder, type Resource } from '@midnight-ntwrk/wallet';
import {
  type BalancedTransaction,
  createBalancedTx,
  type MidnightProvider,
  type UnbalancedTransaction,
  type WalletProvider,
} from '@midnight-ntwrk/midnight-js-types';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import {
  type CoinInfo,
  nativeToken,
  Transaction,
  type TransactionId,
} from '@midnight-ntwrk/ledger';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { Transaction as ZswapTransaction } from '@midnight-ntwrk/zswap';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import type { OracleValue } from '@repo/common';

const contractConfig = {
  privateStateStoreName: 'OraclePrivateState',
  zkConfigPath: path.join(process.cwd(), 'src/midnight_src'),
};

export const oracleContractInstance: OracleContract = new Oracle.Contract(witnesses);

/** END Midnight library imports */

import * as Rx from 'rxjs';

let wallet: Wallet & Resource;
let providers: OracleProviders;
let oracleContract: DeployedOracleContract;

/**
 * Builds a wallet from seed and waits for funds.
 * @returns A promise that resolves to the wallet.
 */
const buildWalletAndWaitForFunds = async (): Promise<Wallet & Resource> => {
  const entropy = bip39.mnemonicToEntropy(config.midnight.seed, wordlist);
  const seed = Buffer.from(entropy).toString('hex');

  wallet = await WalletBuilder.build(
    config.midnight.indexer,
    config.midnight.indexerWS,
    config.midnight.proofServer,
    config.midnight.node,
    seed,
    getZswapNetworkId(),
    'info',
  );

  wallet.start();

  console.log('Wallet started');
  const state = await Rx.firstValueFrom(wallet.state());
  console.log(`Your wallet address is: ${state.address}`);
  let balance = state.balances[nativeToken()];
  console.log('Balance: ', balance);
  if (balance === undefined || balance === 0n) {
    console.log('Waiting for funds');
    balance = await waitForFunds(wallet);
    console.log('Funds received');
  }
  return wallet;
};

/**
 * Waits for funds to be received in the wallet.
 * @param wallet - The wallet to wait for funds.
 * @returns A promise that resolves to the wallet.
 */
const waitForFunds = (wallet: Wallet) =>
  Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(10_000),
      Rx.tap((state) => {
        const applyGap = state.syncProgress?.lag.applyGap ?? 0n;
        const sourceGap = state.syncProgress?.lag.sourceGap ?? 0n;
        console.log(
          `Waiting for funds. Backend lag: ${sourceGap}, wallet lag: ${applyGap}, transactions=${state.transactionHistory.length}`,
        );
      }),
      Rx.filter((state) => {
        // Let's allow progress only if wallet is synced
        return state.syncProgress?.synced === true;
      }),
      Rx.map((s) => s.balances[nativeToken()] ?? 0n),
      Rx.filter((balance) => balance > 0n),
    ),
  );

/**
 * Configures the providers for the Midnight Oracle.
 * @param wallet - The wallet to configure the providers.
 * @returns A promise that resolves to the providers.
 */
const configureProviders = async (wallet: Wallet & Resource) => {
  setNetworkId(NetworkId.TestNet);
  console.log('Configuring providers');
  console.log(contractConfig.zkConfigPath);
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(wallet);
  const privateStateProvider = levelPrivateStateProvider<typeof OraclePrivateStateId>({
    privateStateStoreName: contractConfig.privateStateStoreName,
  });

  const publicDataProvider = indexerPublicDataProvider(
    config.midnight.indexer,
    config.midnight.indexerWS,
  );
  return {
    privateStateProvider: privateStateProvider,
    publicDataProvider: publicDataProvider,
    zkConfigProvider: new NodeZkConfigProvider<OracleCircuits>(contractConfig.zkConfigPath),
    proofProvider: httpClientProofProvider(config.midnight.proofServer),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};

/**
 * Creates a wallet and a Midnight provider.
 * @param wallet - The wallet to create the wallet and Midnight provider.
 * @returns A promise that resolves to the wallet and Midnight provider.
 */
const createWalletAndMidnightProvider = async (
  wallet: Wallet,
): Promise<WalletProvider & MidnightProvider> => {
  setNetworkId(NetworkId.TestNet);
  const state = await Rx.firstValueFrom(wallet.state());
  return {
    coinPublicKey: state.coinPublicKey,
    encryptionPublicKey: state.encryptionPublicKey,
    balanceTx(tx: UnbalancedTransaction, newCoins: CoinInfo[]): Promise<BalancedTransaction> {
      return wallet
        .balanceTransaction(
          ZswapTransaction.deserialize(
            tx.serialize(parseInt(config.midnight.network, 10)),
            parseInt(config.midnight.network, 10),
          ),
          newCoins,
        )
        .then((tx) => wallet.proveTransaction(tx))
        .then((zswapTx) =>
          Transaction.deserialize(
            zswapTx.serialize(parseInt(config.midnight.network, 10)),
            parseInt(config.midnight.network, 10),
          ),
        )
        .then(createBalancedTx);
    },
    submitTx(tx: BalancedTransaction): Promise<TransactionId> {
      return wallet.submitTransaction(tx);
    },
  };
};

/**
 * Instantiate contract deployed
 * @param providers - The providers to instantiate the contract.
 * @returns A promise that resolves to the deployed contract.
 */
const joinContract = async (providers: OracleProviders): Promise<DeployedOracleContract> => {
  setNetworkId(NetworkId.TestNet);
  const oracleContract = await findDeployedContract(providers, {
    contractAddress: config.midnight.contractAddress || '',
    contract: oracleContractInstance,
    privateStateId: 'OraclePrivateState',
    initialPrivateState: { privateKeys: [], privateOracleUpdater: '' },
  });
  console.log(`Joined contract at address: ${oracleContract.deployTxData.public.contractAddress}`);
  return oracleContract;
};

if (config.chain.name === ChainName.Midnight) {
  setNetworkId(NetworkId.TestNet);
  init();
}

/**
 * Initializes the Midnight Oracle.
 */
export async function init() {
  console.log('Initializing Midnight Oracle');
  // setup wallet
  wallet = await buildWalletAndWaitForFunds();

  // setup providers and join contract
  if (wallet !== null) {
    console.log('Initializing Providers');
    providers = await configureProviders(wallet);
    console.log('Providers initialized');
    oracleContract = await joinContract(providers);
    console.log('Contract joined');
  }
}

/**
 * Updates the Midnight Oracle with keys and prices in batches.
 *
 * @param keys - Array of keys (symbols, asset names, etc.)
 * @param prices - Array of corresponding prices
 */
export async function update(keys: string[], prices: number[]) {
  console.log('Updating Midnight oracle with:', keys, prices);

  // Split into batches for large updates
  const keyBatches = splitIntoFixedBatches(keys, config.midnight.maxBatchSize);
  const priceBatches = splitIntoFixedBatches(prices, config.midnight.maxBatchSize);

  const maxRetries = config.midnight.maxRetryAttempts;

  for (let batchIndex = 0; batchIndex < keyBatches.length; batchIndex++) {
    const now = () => BigInt(Math.floor(Date.now() / 1000));
    const keyBatch = keyBatches[batchIndex];
    const priceBatch = priceBatches[batchIndex];

    let attempt = 0;
    // now prepare a batch of key, price and timestamp
    const batch = keyBatch.map(
      (key, index) =>
        [
          key,
          {
            value: BigInt(Math.floor(priceBatch[index])), // Convert to bigint with 6 decimal precision
            timestamp: now(),
          } as OracleValue,
        ] as [string, OracleValue],
    );

    while (attempt < maxRetries) {
      try {
        // First transaction
        // If batch is the size of the maxBatchSize (10), it should call set_multiple_values.
        // If not, it should call set_value for each key, price and timestamp.
        let firstTxBroadcast;
        if (batch.length === config.midnight.maxBatchSize) {
          const batchTxBroadcast = await oracleContract.callTx.set_multiple_values(batch);

          if (!batchTxBroadcast) {
            throw new Error('Batch transaction broadcast failed.');
          }

          console.log(
            `Transaction ${batchTxBroadcast.public.txId} added in block ${batchTxBroadcast.public.blockHeight}`,
          );
        } else {
          console.log("It's not possible to batch value. It will update individually.");

          for (let i = 0; i < batch.length; i++) {
            const firstTxBroadcast = await oracleContract.callTx.set_value(
              batch[i][0],
              batch[i][1],
            );

            if (!firstTxBroadcast) {
              throw new Error('First transaction broadcast failed.');
            }

            console.log(
              `Transaction ${firstTxBroadcast.public.txId} added in block ${firstTxBroadcast.public.blockHeight}`,
            );
          }
        }
        // await confirmation
        console.log(`Batch ${batchIndex} update successful.`);
        break;
      } catch (error) {
        attempt++;
        console.error(`Transaction failed. Attempt ${attempt} of ${maxRetries}. Error:`, error);

        // Switch to the backup node on the first failure if available
        if (attempt >= maxRetries) {
          console.error('Max retry attempts reached. Transaction failed.');
          throw error;
        }
      }
    }
  }

  console.log('Midnight Oracle updated.');
}
