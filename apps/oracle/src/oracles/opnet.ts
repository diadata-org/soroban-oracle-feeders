import {
  JSONRpcProvider,
  getContract,
  OP_NET_ABI,
  IOP_NETContract
} from 'opnet';
import { Wallet, TransactionFactory, OPNetLimitedProvider } from "@btc-vision/transaction";
import {
  BinaryWriter,
  ABICoder,
} from '@btc-vision/bsi-binary';
import { Network, networks } from "bitcoinjs-lib";
import config, { ChainName } from '../config';
import { splitIntoFixedBatches } from '../utils';
import { BytesReader } from '@stacks/transactions';

let provider: JSONRpcProvider;
let backupProvider: JSONRpcProvider | undefined;
let contract: IOP_NETContract;
let network: Network;
let wallet: Wallet;

if (config.chainName === ChainName.OPNET) {
  init();
}

export async function init() {
  // Primary provider
  provider = new JSONRpcProvider(config.opnet.rpcUrl);

  // Backup provider (if configured)
  if (config.opnet.backupRpcUrl) {
    backupProvider = new JSONRpcProvider(config.opnet.backupRpcUrl);
  }

  const hostname = new URL(provider.url).hostname;

  // Determine network type
  switch (hostname) {
    case 'api.opnet.org':
      network = networks.bitcoin;
      break;
    case 'testnet.opnet.org':
      network = networks.testnet;
      break;
    case 'regtest.opnet.org':
      network = networks.regtest;
      break;
    default:
      throw new Error('Unsupported network type.');
  }

  wallet = Wallet.fromWif(config.opnet.secretKey, network);

  contract = getContract<IOP_NETContract>(
    config.opnet.contract,
    OP_NET_ABI,
    provider,
    wallet.p2tr,
  );
}

/**
 * Updates the OpNet Oracle with keys and prices in batches.
 * 
 * @param keys - Array of keys (symbols, asset names, etc.)
 * @param prices - Array of corresponding prices
*/
export async function updateOracle(keys: string[], prices: number[]) {
  console.log('Updating OpNet oracle with:', keys, prices);

  const utxos = await provider.utxoManager.getUTXOs({
    address: wallet.p2tr,
  });
  // Split into batches for large updates
  const keyBatches = splitIntoFixedBatches(keys, config.opnet.maxBatchSize);
  const priceBatches = splitIntoFixedBatches(prices, config.opnet.maxBatchSize);

  const maxRetries = config.opnet.maxRetryAttempts;
  let useBackup = false;

  for (let batchIndex = 0; batchIndex < keyBatches.length; batchIndex++) {
    const keyBatch = keyBatches[batchIndex];
    const priceBatch = priceBatches[batchIndex];

    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const currentProviderUrl = useBackup && backupProvider ? config.opnet.backupRpcUrl! : config.opnet.rpcUrl;

        const writer = new BinaryWriter();
        const bitcoinAbiCoder = new ABICoder();
        writer.writeSelector(Number('0x' + bitcoinAbiCoder.encodeSelector('setMultipleValues')))
        writer.writeU8(keyBatch.length);
        keyBatch.forEach((key, index) => {
          writer.writeStringWithLength(key);
          writer.writeU64(0n);
          writer.writeU64(BigInt(Math.floor(priceBatch[index] * 100_000_000)));
          writer.writeU64(0n);
          writer.writeU64(BigInt(Date.now()));
        });

        const calldata = writer.getBuffer() as Buffer;

        const interactionParameters = {
          from: wallet.p2tr,
          to: contract.address.toString(),
          utxos, // UTXOs to fund the transaction
          signer: wallet.keypair, // Wallet's keypair for signing the transaction
          network, // The BitcoinJS network
          feeRate: 100, // Fee rate in satoshis per byte
          priorityFee: 330n, // Priority fee for faster transaction
          calldata, // The calldata for the contract interaction
        };
        const transactionFactory = new TransactionFactory();
        const signedTx = await transactionFactory.signInteraction(
          interactionParameters
        );

        console.log(signedTx);
        console.log(`Interaction parameters:`);
        console.log(interactionParameters);

        const limitedProvider = new OPNetLimitedProvider(
          currentProviderUrl
        );

        const firstTxBroadcast = await limitedProvider.broadcastTransaction(
          signedTx[0],
          false
        );
        if (!firstTxBroadcast || !firstTxBroadcast.success) {
          throw new Error("First transaction broadcast failed.");
        }

        const secondTxBroadcast = await limitedProvider.broadcastTransaction(
          signedTx[1],
          false
        );
        if (!secondTxBroadcast || !secondTxBroadcast.success) {
          throw new Error("Second transaction broadcast failed.");
        }
        console.log(`Batch ${batchIndex} update successful.`);

        ////// testing fetch  
        // const testWriter = new BinaryWriter();
        // testWriter.writeSelector(Number('0x' + bitcoinAbiCoder.encodeSelector('getValue')))
        // testWriter.writeStringWithLength(keyBatch[0]);
        // const testInteractionParameters = {
        //   from: wallet.p2tr,
        //   to: contract.address.toString(),
        //   utxos, // UTXOs to fund the transaction
        //   signer: wallet.keypair, // Wallet's keypair for signing the transaction
        //   network, // The BitcoinJS network
        //   feeRate: 100, // Fee rate in satoshis per byte
        //   priorityFee: 330n, // Priority fee for faster transaction
        //   calldata: Buffer.from(testWriter.getBuffer()), // The calldata for the contract interaction
        // };

        // const testSignedTx = await transactionFactory.signInteraction(
        //   testInteractionParameters
        // );
        // const testFirstTxBroadcast = await limitedProvider.broadcastTransaction(
        //   testSignedTx[0],
        //   false
        // );
        // if (!testFirstTxBroadcast || !testFirstTxBroadcast.success) {
        //   throw new Error("First transaction broadcast failed.");
        // }
        // const testSecondTxBroadcast = await limitedProvider.broadcastTransaction(
        //   testSignedTx[1],
        //   false
        // );
        // if (!testSecondTxBroadcast || !testSecondTxBroadcast.success) {
        //   throw new Error("Second transaction broadcast failed.");
        // }
        // console.log(`testfirstTxBroadcast result:`);
        // console.log(testFirstTxBroadcast.result);
        // console.log(`testSecondTxBroadcast result:`);
        // console.log(testSecondTxBroadcast.result);
        // const reader = new BytesReader(Buffer.from(testSecondTxBroadcast.result!, 'hex'));
        // const asd = reader.readBigUIntBE(256);
        // console.log(`asd: ${asd}`);
        /////

        break;
      } catch (error) {
        attempt++;
        console.error(`Transaction failed. Attempt ${attempt} of ${maxRetries}. Error:`, error);

        // Switch to the backup node on the first failure if available
        if (attempt === 1 && backupProvider) {
          console.error('Switching to backup provider.');
          useBackup = true;
        }

        if (attempt >= maxRetries) {
          console.error('Max retry attempts reached. Transaction failed.');
          throw error;
        }
      }
    }
  }

  console.log('OpNet Oracle updated.');
}
