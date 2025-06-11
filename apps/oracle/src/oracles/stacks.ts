import axios from 'axios';
import {
  AnchorMode,
  broadcastTransaction,
  uintCV,
  stringAsciiCV,
  makeContractCall,
  listCV,
  tupleCV,
  estimateContractFunctionCall,
  getAddressFromPrivateKey,
  TransactionVersion,
} from '@stacks/transactions';
import { StacksDevnet, StacksMainnet, StacksTestnet } from '@stacks/network';
import type { TransactionResults } from '@stacks/stacks-blockchain-api-types';
import config, { ChainName } from '../config';
import { splitIntoFixedBatches } from '../utils';

const { stacks } = config.chain;

let network: StacksMainnet;
let backupNetwork: StacksMainnet | undefined;

function setNetwork(url?: string): StacksMainnet {
  if (!url) return new StacksDevnet();
  if (url.includes('testnet')) return new StacksTestnet({ url });
  return new StacksMainnet({ url });
}

if (config.chain.name === ChainName.Stacks) {
  init();
}

export function init() {
  network = setNetwork(stacks.rpcUrl);

  if (stacks.backupRpcUrl) {
    backupNetwork = setNetwork(stacks.backupRpcUrl);
  }
}

export async function updateOracle(keys: string[], prices: number[]) {
  const date = Date.now();

  // Split keys and prices into batches
  const keyBatches = splitIntoFixedBatches(keys, stacks.maxBatchSize);
  const priceBatches = splitIntoFixedBatches(prices, stacks.maxBatchSize);

  const version = network.isMainnet() ? TransactionVersion.Mainnet : TransactionVersion.Testnet;
  const address = getAddressFromPrivateKey(stacks.secretKey, version);

  let nonce = await getAccountNonce(address);
  let useBackup = false;

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
    const maxRetries = stacks.maxRetryAttempts;

    while (attempt < maxRetries) {
      try {
        const batchTxOptions = {
          contractAddress: stacks.contract,
          contractName: stacks.contractName,
          functionName: 'set-multiple-values',
          functionArgs: [values],
          senderKey: stacks.secretKey,
          network: useBackup && backupNetwork ? backupNetwork : network, // Use backup if needed
          anchorMode: AnchorMode.Any,
          nonce,
        };

        const contractCall = await makeContractCall(batchTxOptions);
        const estimatedFee = await estimateContractFunctionCall(contractCall);

        let fee = (estimatedFee * stacks.feeRate) / 100n;
        if (attempt > 0) {
          const rate = 100n + BigInt(attempt) * 10n;
          fee = (fee * rate) / 100n;
        }

        const signedTransaction = await makeContractCall({ ...batchTxOptions, fee });
        const broadcastResponse = await broadcastTransaction(
          signedTransaction,
          batchTxOptions.network,
        );

        if (broadcastResponse.error) {
          throw new Error(`Transaction failed with error: ${broadcastResponse.reason}`);
        }

        const txId = broadcastResponse.txid;
        console.log(`Batch ${batchIndex + 1} Transaction ID: ${txId}`);
        nonce += 1n;
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

async function getAccountNonce(address: string) {
  const query = new URLSearchParams();
  query.set('from_address', address);
  query.set('limit', '1');
  query.set('sort_by', 'burn_block_time');
  query.set('order', 'desc');
  query.set('unanchored', 'false');

  const res = await axios(`${stacks.rpcUrl}/extended/v1/tx?${query}`);
  const body = res.data as TransactionResults;

  if (body.total) {
    return BigInt(body.results[0].nonce + 1);
  }
  return 0n;
}
