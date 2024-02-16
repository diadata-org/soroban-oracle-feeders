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
  submitTx,
} from '@repo/common';
import config from './config';

const server = new SorobanRpc.Server(config.soroban.rpcUrl, { allowHttp: true });
const keypair = Keypair.fromSecret(config.soroban.secretKey);
const contract = new Contract(config.soroban.contractId);

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
  const values = prices.map((p) => [timestamp, p] as const);

  const operation = contract.call(
    'set_multiple_values',
    nativeToScVal(keys),
    nativeToScVal(values, { type: 'u128' }),
  );

  let tx = new TransactionBuilder(account, DEFAULT_TX_OPTIONS)
    .addOperation(operation)
    .setTimeout(30)
    .build();

  tx = await server.prepareTransaction(tx);
  tx.sign(keypair);
  await submitTx(server, tx);
}
