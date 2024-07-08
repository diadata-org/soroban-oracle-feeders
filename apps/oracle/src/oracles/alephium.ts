import { MAP_ENTRY_DEPOSIT, NodeProvider, stringToHex, web3 } from '@alephium/web3';
import { PrivateKeyWallet } from '@alephium/web3-wallet';
import { DIAOracle, DIAOracleInstance } from '@repo/common';
import config, { ChainName } from '../config';
import { splitIntoFixedBatches, fillArray } from '../utils';

let nodeProvider: NodeProvider;
let wallet: PrivateKeyWallet;
let oracle: DIAOracleInstance;

if (config.chainName === ChainName.ALEPHIUM) {
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

  for (const ketBatchIndex in keyBatches) {
    const keyBatch = keyBatches[ketBatchIndex];
    const priceBatch = priceBatches[ketBatchIndex];

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
  }

  console.log('Oracle updated');
}
