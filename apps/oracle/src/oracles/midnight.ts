import { type Wallet } from '@midnight-ntwrk/wallet-api';
import {  getZswapNetworkId , getLedgerNetworkId} from '@midnight-ntwrk/midnight-js-network-id';
import { type Resource, WalletBuilder } from '@midnight-ntwrk/wallet';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { Transaction as ZswapTransaction, NetworkId } from '@midnight-ntwrk/zswap';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { type CoinInfo, Transaction, type TransactionId, nativeToken } from '@midnight-ntwrk/ledger';
import * as Rx from 'rxjs';

import {
  type BalancedTransaction,
  createBalancedTx,
  type FinalizedTxData,
  type MidnightProvider,
  type UnbalancedTransaction,
  type WalletProvider,
} from '@midnight-ntwrk/midnight-js-types';

import config, { ChainName } from '../config';
import { splitIntoFixedBatches } from '../utils';

const CounterPrivateStateId = 'counterPrivateState';

import { Counter, type CounterPrivateState, witnesses } from '../../dist/index';

import type { ImpureCircuitId, MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import type { DeployedContract, FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';

export type CounterCircuits = ImpureCircuitId<Counter.Contract<CounterPrivateState>>;
export type CounterProviders = MidnightProviders<CounterCircuits, typeof CounterPrivateStateId, CounterPrivateState>;
export type CounterContract = Counter.Contract<CounterPrivateState>;
export type DeployedCounterContract = DeployedContract<CounterContract> | FoundContract<CounterContract>;
export const counterContractInstance: CounterContract = new Counter.Contract(witnesses);

const buildWallet = async (): Promise<Wallet & Resource> => {
  console.log('Building wallet...');
  const wallet = await WalletBuilder.build(
    config.midnight.indexer,
    config.midnight.indexerWS,
    config.midnight.proofServer,
    config.midnight.node,
    config.midnight.secretKey || '',
    NetworkId.TestNet,
    'info',
  );

  console.log('Wallet built successfully');
  
  wallet.start();
  console.log('Wallet started successfully');
  const state = await Rx.firstValueFrom(wallet.state());
  let balance = state.balances[nativeToken()];
  console.log('Wallet state:', state);
  console.log('Balance:', balance);
  console.info(`Your wallet address is: ${state.address}`);
  if (balance === undefined || balance === 0n) {
    console.info(`Your wallet balance is: 0`);
    console.info(`Waiting to receive tokens...`);
    balance = await waitForFunds(wallet);
  }
  return wallet;
};

export const createWalletAndMidnightProvider = async (wallet: Wallet): Promise<WalletProvider & MidnightProvider> => {
  const state = await Rx.firstValueFrom(wallet.state());
  console.log('getLedgerNetworkId', getLedgerNetworkId());
  console.log('getZswapNetworkId', getZswapNetworkId());
  return {
    coinPublicKey: state.coinPublicKey,
    encryptionPublicKey: state.encryptionPublicKey,
    balanceTx(tx: UnbalancedTransaction, newCoins: CoinInfo[]): Promise<BalancedTransaction> {
      return wallet
        .balanceTransaction(
          ZswapTransaction.deserialize(tx.serialize(getLedgerNetworkId()), getZswapNetworkId()),
          newCoins,
        )
        .then((tx) => wallet.proveTransaction(tx))
        .then((zswapTx) => Transaction.deserialize(zswapTx.serialize(getZswapNetworkId()), getLedgerNetworkId()))
        .then(createBalancedTx);
    },
    submitTx(tx: BalancedTransaction): Promise<TransactionId> {
      return wallet.submitTransaction(tx);
    },
  };
};

const configureProviders = async (wallet: Wallet & Resource) => {
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(wallet);
  return {
    privateStateProvider: levelPrivateStateProvider<typeof CounterPrivateStateId>({
      privateStateStoreName: 'counter-private-state',
    }),
    publicDataProvider: indexerPublicDataProvider(config.midnight.indexer, config.midnight.indexerWS),
    zkConfigProvider: new NodeZkConfigProvider<'increment'>("/Users/luizsoares/protofire/soroban-oracle-feeders/apps/oracle/dist/managed/counter"),
    proofProvider: httpClientProofProvider(config.midnight.proofServer),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};

export const joinContract = async (
  providers: CounterProviders,
  contractAddress: string,
): Promise<DeployedCounterContract> => {
  
  try {
    const counterContract = await findDeployedContract(providers, {
      contractAddress,
      contract: counterContractInstance,
      privateStateId: 'counterPrivateState',
      initialPrivateState: { privateCounter: 0 },
    });
    return counterContract;
  } catch (error) {
    console.error('Error joining contract:', error);
    throw error;
  }
};

let counterContract: DeployedCounterContract;
let wallet: Wallet & Resource;
let providers: CounterProviders;

if (config.chainName === ChainName.Midnight) {
  init().catch(error => {
    console.error('Failed to initialize Midnight Oracle:', error);
    process.exit(1);
  });
}

export async function init() {
  debugger; // Breakpoint 5: Start of initialization
  console.log('Initializing Midnight Oracle');
  // Prepare wallet that will be used to send the transaction
  wallet = await buildWallet();
   
  providers = await configureProviders(wallet);
  
  // deployed contract
  counterContract = await joinContract(providers, config.midnight.contractAddress || '');
}

/**
 * Updates the Midnight Oracle with keys and prices in batches.
 *
 * @param keys - Array of keys (symbols, asset names, etc.)
 * @param prices - Array of corresponding prices
 */
export async function updateOracle(keys: string[], prices: number[]) {
  console.log('Updating Midnight oracle with:', keys, prices);
  console.log(' ** Incrementing...', providers);
  console.info('Incrementing...');
  console.log(counterContract);
  const finalizedTxData = await counterContract.callTx.increment();
  console.log('Incremented successfully');
  console.log(finalizedTxData);
  console.info(`Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`);
  console.info(finalizedTxData.public);

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

export const waitForFunds = (wallet: Wallet) =>
  Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(1_000),
      Rx.filter((state) => {
        console.log(' ** waitForFunds', state);
        // Let's allow progress only if wallet is synced
        const st = state.syncProgress?.synced;
        console.log(' ** waitForFunds', st);
        if(st){
          return true;
        }
        return false;
      }),
      Rx.map((s) => s.balances[nativeToken()] ?? 0n),
      Rx.filter((balance) => balance > 0n),
    ),
  );
