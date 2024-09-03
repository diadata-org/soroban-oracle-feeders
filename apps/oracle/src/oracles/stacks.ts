import { AnchorMode, broadcastTransaction, uintCV, stringAsciiCV, makeContractCall, listCV, tupleCV } from '@stacks/transactions';
import { StacksDevnet, StacksMainnet } from "@stacks/network";
import config, { ChainName } from '../config';
import { splitIntoFixedBatches } from '../utils';

let network: StacksMainnet;

if (config.chainName === ChainName.STACKS) {
  init();
}

export function init() {
  network = config.stacks.rpcUrl ? new StacksMainnet({ url: config.stacks.rpcUrl }) : new StacksDevnet();
}

export async function updateOracle(keys: string[], prices: number[]) {
  const date = Date.now();

  // Split keys and prices into batches
  const keyBatches = splitIntoFixedBatches(keys, config.stacks.maxBatchSize);
  const priceBatches = splitIntoFixedBatches(prices, config.stacks.maxBatchSize);

  for (let batchIndex = 0; batchIndex < keyBatches.length; batchIndex++) {
    const keyBatch = keyBatches[batchIndex];
    const priceBatch = priceBatches[batchIndex];

    const entries = keyBatch.map((key, index) => ({
      key: stringAsciiCV(key),
      value: uintCV(Math.floor(priceBatch[index] * 100_000_000)),
      timestamp: uintCV(date)
    }))

    const values = listCV(entries.map(tupleCV));

    const batchTxOptions = {
      contractAddress: config.stacks.contract,
      contractName: config.stacks.contractName,
      functionName: 'set-multiple-values',
      functionArgs: [values],
      senderKey: config.stacks.secretKey,
      network,
      anchorMode: AnchorMode.Any,
    };

    const transaction = await makeContractCall(batchTxOptions);

    let attempt = 0;
    const maxRetries = config.stacks.maxRetryAttempts;

    while (attempt < maxRetries) {
      try {
        const broadcastResponse = await broadcastTransaction(transaction, network);

        if (broadcastResponse.error) {
          throw new Error(`Transaction failed with error: ${broadcastResponse.error}`);
        }

        const txId = broadcastResponse.txid;
        console.log(`Batch ${batchIndex + 1} Transaction ID: ${txId}`);
        break; // Exit loop if transaction is successful
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
