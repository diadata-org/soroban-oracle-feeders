import { Wallet } from '@midnight-ntwrk/wallet-api';
import { type CoinInfo, nativeToken, Transaction, type TransactionId } from '@midnight-ntwrk/ledger';
import { Transaction as ZswapTransaction } from '@midnight-ntwrk/zswap';
import { type Resource } from '@midnight-ntwrk/wallet';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';

import {
  type BalancedTransaction,
  createBalancedTx,
  type FinalizedTxData,
  type MidnightProvider,
  type UnbalancedTransaction,
  type WalletProvider,
} from '@midnight-ntwrk/midnight-js-types';

import type { ImpureCircuitId, MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import type { DeployedContract, FoundContract } from '@midnight-ntwrk/midnight-js-contracts';

// Import the Midnight Contract.
// Here it is importing the Counter Contract for example
import { Counter, type CounterPrivateState, witnesses } from '@repo/common';

import * as Rx from 'rxjs';

import config, { ChainName } from '../config';
import { splitIntoFixedBatches } from '../utils';

/**************************************************** */
/************  Specific to Counter Contract  ************/

const CounterPrivateStateId = 'counterPrivateState';

const contractConfig = {
  privateStateStoreName: 'counter-private-state',
  zkConfigPath: 'a/a/Users/luizsoares/protofire/soroban-oracle-feeders/apps/oracle/dist/managed/counter'
};

const counterContractInstance: CounterContract = new Counter.Contract(witnesses);
type CounterCircuits = ImpureCircuitId<Counter.Contract<CounterPrivateState>>;
type CounterProviders = MidnightProviders<CounterCircuits, typeof CounterPrivateStateId, CounterPrivateState>;
type CounterContract = Counter.Contract<CounterPrivateState>;
type DeployedCounterContract = DeployedContract<CounterContract> | FoundContract<CounterContract>;

/**************************************************** */
/************  END Specific to Counter Contract  ************/

const buildWalletAndWaitForFunds = async (): Promise<Wallet & Resource> => {
  
  return (async () => {
    
    const { getWallet } = require('./wallet-wrapper');
    const mod = await getWallet();
    let wallet: Wallet & Resource;
    wallet = await mod.WalletBuilder.build(
      config.midnight.indexer,
      config.midnight.indexerWS,
      config.midnight.proofServer,
      config.midnight.node,
      config.midnight.secretKey || '',
      parseInt(config.midnight.network, 10),
      'info'
    );

    wallet.start();
    console.log("Wallet started")
    const state = await Rx.firstValueFrom(wallet.state());
    console.log(`Your wallet address is: ${state.address}`);
    let balance = state.balances[nativeToken()];
    console.log("Balance: ",balance)
    if (balance === undefined || balance === 0n) {
      console.log("Waiting for funds")
      balance = await waitForFunds(wallet);
      console.log("Funds received")
    }
    return wallet;
  })();
};

let wallet: Wallet & Resource;
let counterContract: DeployedCounterContract;

const joinContract = async (
  providers: CounterProviders
): Promise<DeployedCounterContract> => {
  console.log(" **** config.midnight.contractAddress", config.midnight.contractAddress)
  const counterContract = await findDeployedContract(providers, {
    contractAddress: config.midnight.contractAddress || '0200bda5903157a289a450f21f5902450e195fb319d8818cbb79bffc561286c01551',
    contract: counterContractInstance,
    privateStateId: 'counterPrivateState',
    initialPrivateState: { privateCounter: 0 },
  });
  console.log(`Joined contract at address: ${counterContract.deployTxData.public.contractAddress}`);
  return counterContract;
};


export async function init() {
  console.log('Initializing Midnight Oracle');
  // initialize the wallet
  wallet = await buildWalletAndWaitForFunds();

  // join contract
  if (wallet !== null) {
    const providers = await configureProviders(wallet);
    counterContract = await joinContract(providers)
    console.log(counterContract)
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

  console.log(" **** counterContract", counterContract)
  const maxRetries = config.midnight.maxRetryAttempts;

  // Split into batches for large updates
  const keyBatches = splitIntoFixedBatches(keys, config.midnight.maxBatchSize);
  const priceBatches = splitIntoFixedBatches(prices, config.midnight.maxBatchSize);

  for (let batchIndex = 0; batchIndex < keyBatches.length; batchIndex++) {
    const keyBatch = keyBatches[batchIndex];
    const priceBatch = priceBatches[batchIndex];

    let attempt = 0;

    while (attempt < maxRetries) {
      try {

        // prepare price data
        const finalizedTxData = await counterContract.callTx.increment();
        console.log(`Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`);
  
        // send raw transaction

        //await waitForTransaction(secondTxBroadcast.result || '');
        console.log(`Batch ${batchIndex} update successful.`);
        break;
      } catch (error) {
        attempt++;
        console.error(`Transaction failed. Attempt ${attempt} of ${maxRetries}. Error:`, error);

        if (attempt >= maxRetries) {
          console.error('Max retry attempts reached. Transaction failed.');
          throw error;
        }
      }
    }
  }

  console.log('Midnight Oracle updated.');
}

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

if (config.chainName === ChainName.Midnight) {
  init().catch(error => {
    console.error('Failed to initialize Midnight Oracle:', error);
    process.exit(1);
  });
}


const configureProviders = async (wallet: Wallet & Resource) => {
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(wallet);
  const privateStateProvider = levelPrivateStateProvider<typeof CounterPrivateStateId>({
    privateStateStoreName: contractConfig.privateStateStoreName,
  });

  const { getIndexerPublicDataProvider } = require('./wallet-wrapper');
  const mod = await getIndexerPublicDataProvider();
  const publicDataProvider = mod.indexerPublicDataProvider(config.midnight.indexer, config.midnight.indexerWS);

  return {
    privateStateProvider: privateStateProvider,
    publicDataProvider: publicDataProvider,
    zkConfigProvider: new NodeZkConfigProvider<'increment'>(contractConfig.zkConfigPath),
    proofProvider: httpClientProofProvider(config.midnight.proofServer),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
}

export const createWalletAndMidnightProvider = async (wallet: Wallet): Promise<WalletProvider & MidnightProvider> => {
  const state = await Rx.firstValueFrom(wallet.state());
  return {
    coinPublicKey: state.coinPublicKey,
    encryptionPublicKey: state.encryptionPublicKey,
    balanceTx(tx: UnbalancedTransaction, newCoins: CoinInfo[]): Promise<BalancedTransaction> {
      return wallet
        .balanceTransaction(
          ZswapTransaction.deserialize(tx.serialize(parseInt(config.midnight.network, 10)), parseInt(config.midnight.network, 10)),
          newCoins,
        )
        .then((tx) => wallet.proveTransaction(tx))
        .then((zswapTx) => Transaction.deserialize(zswapTx.serialize(parseInt(config.midnight.network, 10)), parseInt(config.midnight.network, 10)))
        .then(createBalancedTx);
    },
    submitTx(tx: BalancedTransaction): Promise<TransactionId> {
      return wallet.submitTransaction(tx);
    },
  };
};
