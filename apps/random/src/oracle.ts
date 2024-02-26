import {
  Contract,
  Keypair,
  nativeToScVal,
  scValToNative,
  SorobanRpc,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import {
  DAY_IN_LEDGERS,
  DEFAULT_TX_OPTIONS,
  extendInstanceTtl,
  restoreInstance,
  submitSorobanTx as submitTx,
} from '@repo/common';
import type { DrandResponse } from './api';
import config, { ChainName } from './config';

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

export async function getLastRound() {
  const account = await server.getAccount(keypair.publicKey());

  const tx = new TransactionBuilder(account, DEFAULT_TX_OPTIONS)
    .addOperation(contract.call('last_round'))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (!SorobanRpc.Api.isSimulationSuccess(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }
  if (!sim.result) {
    throw new Error(`Empty result in simulateTransaction response`);
  }

  const parsed = Number(scValToNative(sim.result.retval));
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    throw new Error(`Invalid simulation result: ${sim.result.retval}`);
  }
  return parsed;
}

export async function updateOracle(data: DrandResponse) {
  const account = await server.getAccount(keypair.publicKey());

  const entries = [
    ['prev_signature', data.previous_signature],
    ['randomness', data.randomness],
    ['signature', data.signature],
  ];

  const operation = contract.call(
    'set_random_value',
    nativeToScVal(data.round, { type: 'u128' }),
    xdr.ScVal.scvMap(
      entries.map(([key, val]) => {
        return new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol(key),
          val: xdr.ScVal.scvString(val),
        });
      }),
    ),
  );

  let tx = new TransactionBuilder(account, DEFAULT_TX_OPTIONS)
    .addOperation(operation)
    .setTimeout(30)
    .build();

  tx = await server.prepareTransaction(tx);
  tx.sign(keypair);
  await submitTx(server, tx);
}
