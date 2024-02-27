import { Pact, createClient, createSignWithKeypair } from '@kadena/client';
import { IKeyPair, ChainId } from '@kadena/types';
import { submitKadenaTx } from '@repo/common';
import config from '../config';

const keyPair: IKeyPair = {
  publicKey: config.kadena.publicKey,
  secretKey: config.kadena.secretKey,
};

const hostUrl = `${config.kadena.rpcUrl}/chainweb/0.0/${config.kadena.networkId}/chain/${config.kadena.chainId}/pact`;

export async function updateOracle(keys: string[], prices: number[]) {
  console.log('Updating oracle with:', keys, prices);

  const client = createClient(hostUrl);
  const signWithKeypair = createSignWithKeypair(keyPair);

  const isoDate = `${(new Date()).toISOString().split('.')[0]}Z`
  const dates = prices.map(() => isoDate);
  const formattedString = "[" + dates.map(date => `(time "${date}")`).join(", ") + "]";
  const unsignedTransaction = Pact.builder
  .execution(
    `(${config.kadena.contract}.set-multiple-values ${JSON.stringify(keys)} ${formattedString} ${JSON.stringify(prices)})`,
    )
    .addSigner(keyPair.publicKey)
    .setMeta({ chainId: config.kadena.chainId as ChainId, senderAccount: `k:${keyPair.publicKey}` })
    .setNetworkId(config.kadena.networkId)
    .createTransaction();

  console.log('Unsigned transaction:', unsignedTransaction);
  const signedTx = await signWithKeypair(unsignedTransaction);
  console.log('Signed transaction:', signedTx);
  await submitKadenaTx(client, signedTx);
  console.log('Oracle updated');
}
