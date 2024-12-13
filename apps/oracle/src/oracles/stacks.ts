import {
  AnchorMode,
  broadcastTransaction,
  uintCV,
  stringAsciiCV,
  makeContractCall,
  listCV,
  tupleCV,
} from '@stacks/transactions';
import { StacksDevnet, StacksMainnet, StacksTestnet } from '@stacks/network';
import config, { ChainName } from '../config';
import { splitIntoFixedBatches } from '../utils';

let network: StacksMainnet;
let backupNetwork: StacksMainnet | undefined;

const setNetwork = (url?: string): StacksMainnet => {
  if (!url) return new StacksDevnet();
  if (url.includes('testnet')) return new StacksTestnet({ url });
  return new StacksMainnet({ url });
};

if (config.chainName === ChainName.STACKS) {
  init();
}

export function init() {
  network = setNetwork(config.stacks.rpcUrl);

  if (config.stacks.backupRpcUrl) {
    backupNetwork = setNetwork(config.stacks.backupRpcUrl);
  }
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
      timestamp: uintCV(date),
    }));

    const values = listCV(entries.map(tupleCV));

    let attempt = 0;
    const maxRetries = config.stacks.maxRetryAttempts;
    let useBackup = false;

    while (attempt < maxRetries) {
      try {
        const batchTxOptions = {
          contractAddress: config.stacks.contract,
          contractName: config.stacks.contractName,
          functionName: 'set-multiple-values',
          functionArgs: [values],
          senderKey: config.stacks.secretKey,
          network: useBackup && backupNetwork ? backupNetwork : network, // Use backup if needed
          anchorMode: AnchorMode.Any,
        };

        const transaction = await makeContractCall(batchTxOptions);
        const broadcastResponse = await broadcastTransaction(transaction, batchTxOptions.network);

        if (broadcastResponse.error) {
          throw new Error(`Transaction failed with error: ${broadcastResponse.error}`);
        }

        const txId = broadcastResponse.txid;
        console.log(`Batch ${batchIndex + 1} Transaction ID: ${txId}`);
        break; // Exit loop if transaction is successful
      } catch (error) {
        attempt++;
        console.error(`Transaction failed. Attempt ${attempt} of ${maxRetries}. Error:`, error);

        if (attempt === 1 && backupNetwork) {
          console.error('Switching to backup node.');
          useBackup = true;
        }

        if (attempt >= maxRetries) {
          console.error('Max retry attempts reached. Transaction failed.');
          throw error;
        }
      }
    }
  }

  console.log('Oracle updated');
}
