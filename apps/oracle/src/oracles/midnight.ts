import config, { ChainName } from '../config';
import {
  splitIntoFixedBatches,
  type CounterContract,
  type CounterPrivateStateId,
  type CounterProviders,
  type DeployedCounterContract,
} from '../utils';

/** Midnight library imports */
import {
  getLedgerNetworkId,
  getZswapNetworkId,
  NetworkId,
  setNetworkId,
} from '@midnight-ntwrk/midnight-js-network-id';
import { Counter, witnesses } from '@repo/common';
import { Wallet } from '@midnight-ntwrk/wallet-api';
import { WalletBuilder, type Resource } from '@midnight-ntwrk/wallet';
import {
  type BalancedTransaction,
  createBalancedTx,
  type FinalizedTxData,
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

const contractConfig = {
  privateStateStoreName: 'counter-private-state',
  zkConfigPath:
    '/Users/luizsoares/protofire/soroban-oracle-feeders/apps/oracle/dist/managed/counter',
};

const { midnight } = config.chain;

export const counterContractInstance: CounterContract = new Counter.Contract(witnesses);

/** END Midnight library imports */

import * as Rx from 'rxjs';

let wallet: Wallet & Resource;
let providers: CounterProviders;
let counterContract: DeployedCounterContract;

/**
 * Builds a wallet from seed and waits for funds.
 * @returns A promise that resolves to the wallet.
 */
const buildWalletAndWaitForFunds = async (): Promise<Wallet & Resource> => {
  wallet = await WalletBuilder.build(
    midnight.indexer,
    midnight.indexerWS,
    midnight.proofServer,
    midnight.node,
    midnight.secretKey || '',
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

const configureProviders = async (wallet: Wallet & Resource) => {
  setNetworkId(NetworkId.TestNet);
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(wallet);
  const privateStateProvider = levelPrivateStateProvider<typeof CounterPrivateStateId>({
    privateStateStoreName: contractConfig.privateStateStoreName,
  });

  const publicDataProvider = indexerPublicDataProvider(midnight.indexer, midnight.indexerWS);
  return {
    privateStateProvider: privateStateProvider,
    publicDataProvider: publicDataProvider,
    zkConfigProvider: new NodeZkConfigProvider<'increment'>(contractConfig.zkConfigPath),
    proofProvider: httpClientProofProvider(midnight.proofServer),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};

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
            tx.serialize(parseInt(midnight.network, 10)),
            parseInt(midnight.network, 10),
          ),
          newCoins,
        )
        .then((tx) => wallet.proveTransaction(tx))
        .then((zswapTx) =>
          Transaction.deserialize(
            zswapTx.serialize(parseInt(midnight.network, 10)),
            parseInt(midnight.network, 10),
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
 * @param providers
 * @returns
 */
const joinContract = async (providers: CounterProviders): Promise<DeployedCounterContract> => {
  setNetworkId(NetworkId.TestNet);
  const counterContract = await findDeployedContract(providers, {
    contractAddress: '0200bda5903157a289a450f21f5902450e195fb319d8818cbb79bffc561286c01551',
    contract: counterContractInstance,
    privateStateId: 'counterPrivateState',
    initialPrivateState: { privateCounter: 0 },
  });
  console.log(
    `Joined contract at address: ${counterContract.deployTxData.public.contractAddress}`,
  );
  return counterContract;
};

if (config.chain.name === ChainName.Midnight) {
  setNetworkId(NetworkId.TestNet);
  init();
}

export async function init() {
  console.log('Initializing Midnight Oracle');
  console.log(getLedgerNetworkId());
  // setup wallet
  wallet = await buildWalletAndWaitForFunds();

  // setup providers join contract
  if (wallet !== null) {
    console.log('Initializing Providers');
    providers = await configureProviders(wallet);
    console.log('Providers initialized', providers);
    counterContract = await joinContract(providers);
    console.log('Contract joined', counterContract);
  }
}

/**
 * Updates the Midnight Oracle with keys and prices in batches.
 *
 * @param keys - Array of keys (symbols, asset names, etc.)
 * @param prices - Array of corresponding prices
 */
export async function updateOracle(keys: string[], prices: number[]) {
  console.log('Updating Midnight oracle with:', keys, prices);

  // Split into batches for large updates
  const keyBatches = splitIntoFixedBatches(keys, midnight.maxBatchSize);
  const priceBatches = splitIntoFixedBatches(prices, midnight.maxBatchSize);

  const maxRetries = midnight.maxRetryAttempts;

  for (let batchIndex = 0; batchIndex < keyBatches.length; batchIndex++) {
    const keyBatch = keyBatches[batchIndex];
    const priceBatch = priceBatches[batchIndex];

    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        // First transaction
        const firstTxBroadcast = await counterContract.callTx.increment();
        console.log(
          `Transaction ${firstTxBroadcast.public.txId} added in block ${firstTxBroadcast.public.blockHeight}`,
        );

        if (!firstTxBroadcast) {
          throw new Error('First transaction broadcast failed.');
        }

        // Second transaction
        const secondTxBroadcast = await counterContract.callTx.increment();
        console.log(
          `Transaction ${secondTxBroadcast.public.txId} added in block ${secondTxBroadcast.public.blockHeight}`,
        );

        if (!secondTxBroadcast) {
          throw new Error('Second transaction broadcast failed.');
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
