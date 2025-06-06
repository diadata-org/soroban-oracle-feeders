import config, { ChainName } from '../config';
import { splitIntoFixedBatches } from '../utils';

/** Midnight library imports */
import { Wallet } from '@midnight-ntwrk/wallet-api';
import { WalletBuilder, type Resource } from '@midnight-ntwrk/wallet';
import { getLedgerNetworkId, getZswapNetworkId, NetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { nativeToken } from '@midnight-ntwrk/zswap';

import * as Rx from 'rxjs';


let wallet: Wallet & Resource;

/**
 * Builds a wallet from seed and waits for funds.
 * @returns A promise that resolves to the wallet.
 */
const buildWalletAndWaitForFunds = async (): Promise<Wallet & Resource> => {
  setNetworkId(NetworkId.TestNet);
  return (async () => {
    
    wallet = await WalletBuilder.build(
      config.midnight.indexer,
      config.midnight.indexerWS,
      config.midnight.proofServer,
      config.midnight.node,
      config.midnight.secretKey || '',
      getZswapNetworkId(),
      'info'
    );
    wallet.start();

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
  setNetworkId(NetworkId.TestNet);
  init();
}

export async function init() {

	console.log('Initializing Midnight Oracle');
	console.log(getLedgerNetworkId())
  // setup wallet
	wallet = await buildWalletAndWaitForFunds();


  // initialize the wallet
  //wallet = await buildWalletAndWaitForFunds();

	// setup provider

	// setup contract
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
  const keyBatches = splitIntoFixedBatches(keys, config.midnight.maxBatchSize);
  const priceBatches = splitIntoFixedBatches(prices, config.midnight.maxBatchSize);

  const maxRetries = config.midnight.maxRetryAttempts;

  for (let batchIndex = 0; batchIndex < keyBatches.length; batchIndex++) {
    const keyBatch = keyBatches[batchIndex];
    const priceBatch = priceBatches[batchIndex];

    let attempt = 0;

    while (attempt < maxRetries) {
      try {

				// First transaction
        const firstTxBroadcast = null;

        /*if (!firstTxBroadcast || !firstTxBroadcast.success) {
          throw new Error('First transaction broadcast failed.');
        }

				// Second transaction
        const secondTxBroadcast = null;
        if (!secondTxBroadcast || !secondTxBroadcast.success) {
          throw new Error('Second transaction broadcast failed.');
        }*/

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
