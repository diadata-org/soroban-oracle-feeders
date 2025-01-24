import { MAP_ENTRY_DEPOSIT, NodeProvider, web3 } from '@alephium/web3';
import { PrivateKeyWallet } from '@alephium/web3-wallet';
import { DIARandomOracle, DIARandomOracleInstance } from '@repo/common';
import config, { ChainName } from '../config';
import type { DrandResponse } from '../api';
import { bigint } from 'zod';

let nodeProvider: NodeProvider;
let wallet: PrivateKeyWallet;
let randomOracle: DIARandomOracleInstance;

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

  randomOracle = DIARandomOracle.at(config.alephium.contract);
}

export async function getLastRound() {
  const result = await randomOracle.view.getLastRound();
  return Number(result.returns);
}

export async function updateOracle(data: DrandResponse) {
  const maxRetries = config.alephium.maxRetryAttempts;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      let modifiedRound = data.round%1000
      console.log("modifiedRound",)
      const result = await randomOracle.transact.setRandomValue({
        args: {
          modifiedRound: BigInt(modifiedRound),
          value: {
            randomness: data.randomness,
            signature: data.signature,
            round: BigInt(data.round),
          },
        },
        signer: wallet,
        attoAlphAmount: MAP_ENTRY_DEPOSIT,
      });

      console.log('result:', result);
      console.log('Random oracle updated');
      break;
    } catch (error) {
      console.error(`Transaction failed. Attempt ${attempt} of ${maxRetries}. Error:`, error);
      attempt++;
      if (attempt >= maxRetries) {
        console.error('Max retry attempts reached. Transaction failed.');
        throw error;
      }
    }
  }
}
