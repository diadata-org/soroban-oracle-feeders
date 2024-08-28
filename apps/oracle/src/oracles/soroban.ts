import {
  Contract,
  Keypair,
  nativeToScVal,
  SorobanRpc,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import {
  DAY_IN_LEDGERS,
  DEFAULT_TX_OPTIONS,
  extendInstanceTtl,
  restoreInstance,
  submitSorobanTx,
} from '@repo/common/src/soroban';
import config, { ChainName } from '../config';

let server: SorobanRpc.Server;
let keypair: Keypair;
let contract: Contract;

if (config.chainName === ChainName.SOROBAN) {
  init();
}

export function init() {
  server = new SorobanRpc.Server(config.soroban.rpcUrl, { allowHttp: true });
  keypair = Keypair.fromSecret(config.soroban.secretKey);
  contract = new Contract(config.soroban.contractId);
}

export function restoreOracle() {
  return restoreInstance(server, keypair, contract);
}

export function extendOracleTtl() {
  const extendTo = DAY_IN_LEDGERS * 30;
  const threshold = extendTo - DAY_IN_LEDGERS;
  return extendInstanceTtl({ server, source: keypair, contract, threshold, extendTo });
}

export async function updateOracle(keys: string[], prices: number[]) {
  const account = await server.getAccount(keypair.publicKey());

  const timestamp = Math.floor(Date.now() / 1000);
  const values = prices.map((p) => [timestamp,  Math.floor(p * 100_000_000)] as const);

  const operation = contract.call(
    'set_multiple_values',
    nativeToScVal(keys),
    nativeToScVal(values, { type: 'u128' }),
  );

  const maxRetries = config.soroban.maxRetryAttempts;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      let tx = new TransactionBuilder(account, DEFAULT_TX_OPTIONS)
        .addOperation(operation)
        .setTimeout(30)
        .build();

      tx = await server.prepareTransaction(tx);
      tx.sign(keypair);
      await submitSorobanTx(server, tx);

      console.log('Transaction submitted successfully.');
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
