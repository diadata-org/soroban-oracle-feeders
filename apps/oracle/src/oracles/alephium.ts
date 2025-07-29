import { MAP_ENTRY_DEPOSIT, NodeProvider, stringToHex, web3 } from '@alephium/web3';
import { PrivateKeyWallet } from '@alephium/web3-wallet';
import { DIAOracle, DIAOracleInstance } from '@repo/common';
import config, { ChainName } from '../config.js';
import { splitIntoFixedBatches, fillArray } from '../utils.js';

let nodeProvider: NodeProvider;
let wallet: PrivateKeyWallet;
let oracle: DIAOracleInstance;

const { alephium } = config.chain;

if (config.chain.name === ChainName.Alephium) {
  init();
}

export function init() {
  nodeProvider = new NodeProvider(alephium.rpcUrl);
  web3.setCurrentNodeProvider(nodeProvider);

  wallet = new PrivateKeyWallet({
    privateKey: alephium.secretKey,
    keyType: undefined,
    nodeProvider: nodeProvider,
  });

  oracle = DIAOracle.at(alephium.contract);
}

export async function update(keys: string[], prices: number[]) {
  console.log('Updating oracle with:', keys, prices);

  const keyBatches = splitIntoFixedBatches(keys, alephium.maxBatchSize);
  const priceBatches = splitIntoFixedBatches(prices, alephium.maxBatchSize);

  const maxRetries = alephium.maxRetryAttempts;

  for (const ketBatchIndex in keyBatches) {
    const keyBatch = keyBatches[ketBatchIndex];
    const priceBatch = priceBatches[ketBatchIndex];

    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const result = await oracle.transact.setMultipleValues({
          args: {
            keys: fillArray(
              keyBatch.map((key) => stringToHex(key)),
              alephium.maxBatchSize,
              stringToHex(''),
            ),
            values: fillArray(
              priceBatch.map((price) => BigInt(Math.floor(price * 100_000_000))),
              alephium.maxBatchSize,
              0n,
            ),
            timestamps: fillArray([], alephium.maxBatchSize, BigInt(Date.now())),
            batchSize: BigInt(keyBatch.length),
          },
          signer: wallet,
          attoAlphAmount: MAP_ENTRY_DEPOSIT * BigInt(keyBatch.length),
        });

        console.log('batch update:', result);
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
