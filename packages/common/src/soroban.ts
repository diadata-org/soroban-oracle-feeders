import {
  BASE_FEE,
  Contract,
  FeeBumpTransaction,
  Keypair,
  Networks,
  Operation,
  SorobanDataBuilder,
  SorobanRpc,
  Transaction,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import { sleep } from './utils';

export const DAY_IN_LEDGERS = 17280;
export const DEFAULT_TX_OPTIONS = { fee: BASE_FEE, networkPassphrase: Networks.TESTNET };

export async function submitTx(server: SorobanRpc.Server, tx: Transaction | FeeBumpTransaction) {
  const sendResponse = await server.sendTransaction(tx);
  if (sendResponse.status !== 'PENDING') {
    throw new Error(`Transaction failed: ${sendResponse.errorResult}`);
  }

  let getResponse = await server.getTransaction(sendResponse.hash);

  while (getResponse.status === 'NOT_FOUND') {
    getResponse = await server.getTransaction(sendResponse.hash);
    await sleep(1000);
  }

  if (getResponse.status === 'FAILED') {
    throw new Error(`Transaction failed: ${getResponse.resultXdr}`);
  }
  if (!getResponse.resultMetaXdr) {
    throw new Error('Empty resultMetaXDR in getTransaction response');
  }
  return getResponse;
}

export type ExtendTtlConfig = {
  server: SorobanRpc.Server;
  source: Keypair;
  contract: Contract;
  threshold: number;
  extendTo: number;
  options?: TransactionBuilder.TransactionBuilderOptions;
};

export async function extendInstanceTtl({
  server,
  source,
  contract,
  threshold,
  extendTo,
  options = DEFAULT_TX_OPTIONS,
}: ExtendTtlConfig) {
  const instance = contract.getFootprint();

  const [latestLedger, wasmEntry] = await Promise.all([
    server.getLatestLedger(),
    getWasmEntry(server, instance),
  ]);

  const ledgersLeft = wasmEntry.liveUntilLedgerSeq - latestLedger.sequence;
  if (ledgersLeft <= 0) {
    throw new Error(`Contract instance at ${contract.contractId()} is archived`);
  }

  if (ledgersLeft < threshold) {
    const data = new SorobanDataBuilder()
      .setReadOnly([instance, getWasmLedgerKey(wasmEntry.val)])
      .build();

    const account = await server.getAccount(source.publicKey());

    let tx = new TransactionBuilder(account, options)
      .setSorobanData(data)
      .addOperation(Operation.extendFootprintTtl({ extendTo }))
      .setTimeout(30)
      .build();

    tx = await server.prepareTransaction(tx);
    tx.sign(source);
    await submitTx(server, tx);
    console.log(`Instance at ${contract.contractId()} has been bumped by ${extendTo} ledgers`);
  }
}

export async function restoreInstance(
  server: SorobanRpc.Server,
  source: Keypair,
  contract: Contract,
  options: TransactionBuilder.TransactionBuilderOptions = DEFAULT_TX_OPTIONS,
) {
  const instance = contract.getFootprint();

  const [latestLedger, wasmEntry] = await Promise.all([
    server.getLatestLedger(),
    getWasmEntry(server, instance),
  ]);

  if (latestLedger.sequence >= wasmEntry.liveUntilLedgerSeq) {
    const data = new SorobanDataBuilder()
      .setReadWrite([instance, getWasmLedgerKey(wasmEntry.val)])
      .build();

    const account = await server.getAccount(source.publicKey());

    let tx = new TransactionBuilder(account, options)
      .setSorobanData(data)
      .addOperation(Operation.restoreFootprint({}))
      .setTimeout(30)
      .build();

    tx = await server.prepareTransaction(tx);
    tx.sign(source);
    await submitTx(server, tx);
    console.log(`Contract instance at ${contract.contractId()} has been restored`);
  }
}

async function getWasmEntry(server: SorobanRpc.Server, key: xdr.LedgerKey) {
  const response = await server.getLedgerEntries(key);
  if (!response.entries.length) {
    throw new Error('No ledger entries found');
  }

  const entry = response.entries[0];
  if (!entry || !entry.liveUntilLedgerSeq) {
    throw new Error('Instance ledger entry is not found');
  }
  return { ...entry, liveUntilLedgerSeq: entry.liveUntilLedgerSeq };
}

function getWasmLedgerKey(entry: xdr.LedgerEntryData) {
  return xdr.LedgerKey.contractCode(
    new xdr.LedgerKeyContractCode({
      hash: entry.contractData().val().instance().executable().wasmHash(),
    }),
  );
}
