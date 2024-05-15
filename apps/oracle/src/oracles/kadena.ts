import { Pact, createClient, createSignWithKeypair } from '@kadena/client';
import { IKeyPair, ChainId } from '@kadena/types';
import { submitKadenaTx } from '@repo/common';
import config from '../config';
import { splitIntoFixedBatches } from '../utils'

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
  
  const keysBatches = splitIntoFixedBatches(keys, config.kadena.maxAssetsPerTx);
  const datesBatches = splitIntoFixedBatches(dates, config.kadena.maxAssetsPerTx);
  const pricesBatches = splitIntoFixedBatches(prices, config.kadena.maxAssetsPerTx);
  
  for (let i = 0; i < keysBatches.length; i++) {
    const formattedString = "[" + datesBatches[i].map(date => `(time "${date}")`).join(", ") + "]";
    const unsignedTransaction = Pact.builder
      .execution(
        `(${config.kadena.contract}.set-multiple-values ${JSON.stringify(keysBatches[i])} ${formattedString} ${JSON.stringify(pricesBatches[i])})`,
        )
        .addSigner(keyPair.publicKey)
        .setMeta({ chainId: config.kadena.chainId as ChainId, senderAccount: `k:${keyPair.publicKey}` })
        .setNetworkId(config.kadena.networkId)
        .createTransaction();

    const signedTx = await signWithKeypair(unsignedTransaction);
    console.log('Signed transaction:', signedTx);
    await submitKadenaTx(client, signedTx);
  }
  console.log('Oracle updated');
}
