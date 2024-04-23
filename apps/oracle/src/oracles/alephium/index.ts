import { NodeProvider, stringToHex, web3 } from '@alephium/web3';
import { PrivateKeyWallet } from '@alephium/web3-wallet';

import { splitIntoFixedBatches, fillArray } from './utils';
import { DIAOracle, SetMultipleValues } from './artifacts/ts';
import config from '../../config';

export async function updateOracle(keys: string[], prices: number[]) {
  console.log('Updating oracle with:', keys, prices);

  const nodeProvider = new NodeProvider(config.alephium.rpcUrl);
  web3.setCurrentNodeProvider(nodeProvider);
  const wallet = new PrivateKeyWallet({
    privateKey: config.alephium.secretKey,
    keyType: undefined,
    nodeProvider: nodeProvider,
  });
  const diaOracle = await DIAOracle.at(config.alephium.contract);
  const subContractDeposit = (await diaOracle.methods.getSubContractDeposit()).returns;

  const keyBatches = splitIntoFixedBatches(keys, config.alephium.maxBatchSize);
  const priceBatches = splitIntoFixedBatches(prices, config.alephium.maxBatchSize);

  for (const ketBatchIndex in keyBatches) {
    const keyBatch = keyBatches[ketBatchIndex];
    const priceBatch = priceBatches[ketBatchIndex];

    const result = await SetMultipleValues.execute(wallet, {
      initialFields: {
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
        oracle: diaOracle.contractId,
      },
      attoAlphAmount: subContractDeposit * BigInt(keyBatch.length),
    });

    console.log('batch update:', result);
  }
  console.log('Oracle updated');
}
