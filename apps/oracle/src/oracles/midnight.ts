import {
  MIDNIGHT_BATCH_SIZE,
  MidnightOracleClient,
  MidnightOracleValue,
  connectMidnightOracle,
} from '@repo/common';
import config, { ChainName } from '../config';
import { fillArray, splitIntoFixedBatches } from '../utils';

let client: Promise<MidnightOracleClient>;

if (config.chainName === ChainName.Midnight) {
  init();
}

export function init() {
  client = connectMidnightOracle(config.midnight);
}

export async function updateOracle(keys: string[], prices: number[]) {
  console.log('Updating oracle with:', keys, prices);

  const oracle = await client;
  const timestamp = BigInt(Date.now());

  const keyBatches = splitIntoFixedBatches(keys, MIDNIGHT_BATCH_SIZE);
  const priceBatches = splitIntoFixedBatches(prices, MIDNIGHT_BATCH_SIZE);

  const maxRetries = config.midnight.maxRetryAttempts;

  for (let batchIndex = 0; batchIndex < keyBatches.length; batchIndex++) {
    const batch = keyBatches[batchIndex].map((key, index): [string, MidnightOracleValue] => [
      key,
      { value: BigInt(Math.floor(priceBatches[batchIndex][index] * 100_000_000)), timestamp },
    ]);

    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const result = await oracle.setMultipleValues(
          fillArray(batch, MIDNIGHT_BATCH_SIZE, batch[batch.length - 1]),
        );
        console.log('batch update:', result);
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

  console.log('Oracle updated');
}
