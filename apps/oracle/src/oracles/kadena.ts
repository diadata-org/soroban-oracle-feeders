import { Pact, createClient, createSignWithKeypair } from '@kadena/client';
import { IKeyPair, ChainId } from '@kadena/types';
import { submitKadenaTx } from '@repo/common';
import config from '../config.js';
import { splitIntoFixedBatches } from '../utils.js';

const { kadena } = config.chain;

const keyPair: IKeyPair = {
  publicKey: kadena.publicKey,
  secretKey: kadena.secretKey,
};

const hostUrl = `${kadena.rpcUrl}/chainweb/0.0/${kadena.networkId}/chain/${kadena.chainId}/pact`;

export async function update(keys: string[], prices: number[]) {
  console.log('Updating oracle with:', keys, prices);

  const client = createClient(hostUrl);
  const signWithKeypair = createSignWithKeypair(keyPair);

  const isoDate = `${new Date().toISOString().split('.')[0]}Z`;
  const dates = prices.map(() => isoDate);

  const keysBatches = splitIntoFixedBatches(keys, kadena.maxAssetsPerTx);
  const datesBatches = splitIntoFixedBatches(dates, kadena.maxAssetsPerTx);
  const pricesBatches = splitIntoFixedBatches(prices, kadena.maxAssetsPerTx);

  const maxRetries = kadena.maxRetryAttempts;

  for (let i = 0; i < keysBatches.length; i++) {
    const formattedString =
      '[' + datesBatches[i].map((date) => `(time "${date}")`).join(', ') + ']';
    const unsignedTransaction = Pact.builder
      .execution(
        `(${kadena.contract}.set-multiple-values ${JSON.stringify(keysBatches[i])} ${formattedString} ${JSON.stringify(pricesBatches[i])})`,
      )
      .addSigner(keyPair.publicKey)
      .setMeta({
        chainId: kadena.chainId as ChainId,
        senderAccount: `k:${keyPair.publicKey}`,
      })
      .setNetworkId(kadena.networkId)
      .createTransaction();

    const signedTx = await signWithKeypair(unsignedTransaction);
    console.log('Signed transaction:', signedTx);

    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        await submitKadenaTx(client, signedTx);
        console.log('Transaction submitted successfully.');
        break; // Exit loop if transaction is successful
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
  console.log('Oracle updated');
}
