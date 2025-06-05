import config, { ChainName } from '../config';
import { splitIntoFixedBatches } from '../utils';

/*
let provider: JSONRpcProvider;
let contract: IOP_NETContract;
let wallet: Wallet;
*/

if (config.chainName === ChainName.Midnight) {
  init();
}

export async function init() {

	console.log('Initializing Midnight Oracle');
	// setup wallet

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
