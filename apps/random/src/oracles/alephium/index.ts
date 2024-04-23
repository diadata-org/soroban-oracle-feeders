import { NodeProvider, web3 } from '@alephium/web3';
import { PrivateKeyWallet } from '@alephium/web3-wallet';

import { DIARandomOracle, SetRandomValue } from './artifacts/ts';
import config, { ChainName } from '../../config';
import type { DrandResponse } from '../../api';

let nodeProvider: NodeProvider;
let wallet: PrivateKeyWallet;

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
}

export const getLastRound = async () => {
  const diaRandomOracle = DIARandomOracle.at(config.alephium.contract);
  const round = (await diaRandomOracle.methods.getLastRound()).returns;
  return Number(round);
};

export async function updateOracle(data: DrandResponse) {
  const diaRandomOracle = DIARandomOracle.at(config.alephium.contract);
  const subContractDeposit = (await diaRandomOracle.methods.getSubContractDeposit()).returns;

  const result = await SetRandomValue.execute(wallet, {
    initialFields: {
      round: BigInt(data.round),
      value: {
        randomness: data.randomness,
        signature: data.signature,
        previousSignature: data.previous_signature,
      },
      oracle: diaRandomOracle.contractId,
    },
    attoAlphAmount: subContractDeposit,
  });
  console.log('result:', result);
  console.log('Random oracle updated');
}
