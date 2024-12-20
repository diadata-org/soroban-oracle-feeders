import { MAP_ENTRY_DEPOSIT, NodeProvider, stringToHex, web3 } from '@alephium/web3';
import { PrivateKeyWallet } from '@alephium/web3-wallet';
import { DIAOracle, DIAOracleInstance } from '@repo/common';
import config, { ChainName } from '../config';
import { splitIntoFixedBatches, fillArray } from '../utils';

let nodeProvider: NodeProvider;
let wallet: PrivateKeyWallet;
let oracle: DIAOracleInstance;

if (config.chainName === ChainName.Alephium) {
  init();
}

export function init() {
  nodeProvider = new NodeProvider(config.alephium.rpcUrl);
  web3.setCurrentNodeProvider(nodeProvider);

  wallet = new PrivateKeyWallet({
    privateKey: config.alephium.secretKey,
    keyType: undefined,
    nodeProvider: nodeProvider,
  });

  oracle = DIAOracle.at(config.alephium.contract);
}

export async function updateOracle(keys: string[], prices: number[]) {
  console.log('Updating oracle with:', keys, prices);

  const keyBatches = splitIntoFixedBatches(keys, config.alephium.maxBatchSize);
  const priceBatches = splitIntoFixedBatches(prices, config.alephium.maxBatchSize);

  const maxRetries = config.alephium.maxRetryAttempts;

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
              config.alephium.maxBatchSize,
              stringToHex(''),
            ),
            values: fillArray(
              priceBatch.map((price) => BigInt(Math.floor(price * 100_000_000))),
              config.alephium.maxBatchSize,
              0n,
            ),
            timestamps: fillArray([], config.alephium.maxBatchSize, BigInt(Date.now())),
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
