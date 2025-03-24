import { JSONRpcProvider, getContract, OP_NET_ABI, IOP_NETContract, CallResult } from 'opnet';
import {
  BinaryWriter,
  ABICoder,
  BufferHelper,
  Wallet,
  TransactionFactory,
  OPNetNetwork,
} from '@btc-vision/transaction';
import { Network, networks } from 'bitcoinjs-lib';
import crypto from 'crypto';
import config, { ChainName } from '../config';
import { splitIntoFixedBatches } from '../utils';

let provider: JSONRpcProvider;
let backupProvider: JSONRpcProvider | undefined;
let contract: IOP_NETContract;
let network: Network;
let wallet: Wallet;

if (config.chainName === ChainName.Opnet) {
  init();
}

export async function init() {
  switch (config.opnet.network) {
    case OPNetNetwork.Mainnet:
      network = networks.bitcoin;
      break;
    case OPNetNetwork.Testnet:
      network = networks.testnet;
      break;
    case OPNetNetwork.Regtest:
      network = networks.regtest;
      break;
    default:
      const { hostname } = new URL(config.opnet.rpcUrl);
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
  }

  provider = new JSONRpcProvider(config.opnet.rpcUrl, network);
  if (config.opnet.backupRpcUrl) {
    backupProvider = new JSONRpcProvider(config.opnet.backupRpcUrl, network);
  }

  wallet = Wallet.fromWif(config.opnet.secretKey, network);
  contract = getContract<IOP_NETContract>(
    config.opnet.contract,
    OP_NET_ABI,
    provider,
    network,
    wallet.address,
  );
}

export function writeU128(writer: BinaryWriter, value: bigint) {
  const hex = value.toString(16).padStart(32, '0');
  const bytes = BufferHelper.hexToUint8Array(hex);
  writer.writeBytes(bytes);
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
  const preimage = await getPreimage();

  // Split into batches for large updates
  const keyBatches = splitIntoFixedBatches(keys, config.opnet.maxBatchSize);
  const priceBatches = splitIntoFixedBatches(prices, config.opnet.maxBatchSize);

  const maxRetries = config.opnet.maxRetryAttempts;

  for (let batchIndex = 0; batchIndex < keyBatches.length; batchIndex++) {
    const keyBatch = keyBatches[batchIndex];
    const priceBatch = priceBatches[batchIndex];

    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const writer = new BinaryWriter();
        const bitcoinAbiCoder = new ABICoder();
        writer.writeSelector(Number('0x' + bitcoinAbiCoder.encodeSelector('setMultipleValues')));
        writer.writeU8(keyBatch.length);
        keyBatch.forEach((key, index) => {
          writer.writeStringWithLength(key);
          writeU128(writer, BigInt(Math.floor(priceBatch[index] * 100_000_000)));
          writeU128(writer, BigInt(Date.now()));
        });

        const calldata = Buffer.from(writer.getBuffer());
        const simulation = (await provider.call(
          contract.address,
          calldata,
          wallet.address,
        )) as CallResult;

        const gasParams = await provider.gasParameters();

        const gas = simulation.estimatedGas ?? 330n;
        const exactGas = ((gas / 1000000n) * gasParams.gasPerSat) / 1000000n;
        const extraGas = (exactGas * 50n) / 100n;

        const interactionParameters = {
          from: wallet.p2tr,
          to: contract.address.toString(),
          utxos, // UTXOs to fund the transaction
          signer: wallet.keypair, // Wallet's keypair for signing the transaction
          network, // The BitcoinJS network
          feeRate: config.opnet.feeRate, // Fee rate in satoshis per byte
          priorityFee: config.opnet.priorityFee, // Priority fee for faster transaction
          gasSatFee: max(exactGas + extraGas, 330n),
          calldata, // The calldata for the contract interaction
          preimage,
        };
        const transactionFactory = new TransactionFactory();
        const signedTx = await transactionFactory.signInteraction(interactionParameters);

        const firstTxBroadcast = await provider.sendRawTransaction(
          signedTx.fundingTransaction,
          false,
        );
        if (!firstTxBroadcast || !firstTxBroadcast.success) {
          throw new Error('First transaction broadcast failed.');
        }

        const secondTxBroadcast = await provider.sendRawTransaction(
          signedTx.interactionTransaction,
          false,
        );
        if (!secondTxBroadcast || !secondTxBroadcast.success) {
          throw new Error('Second transaction broadcast failed.');
        }

        await waitForTransaction(secondTxBroadcast.result || '');
        console.log(`Batch ${batchIndex} update successful.`);
        break;
      } catch (error) {
        attempt++;
        console.error(`Transaction failed. Attempt ${attempt} of ${maxRetries}. Error:`, error);

        // Switch to the backup node on the first failure if available
        if (attempt === 1 && backupProvider) {
          console.error('Switching to backup provider.');
          provider = new JSONRpcProvider(config.opnet.backupRpcUrl ?? '', network);
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

async function getPreimage() {
  let preimage: Buffer;
  try {
    preimage = await provider.getPreimage();
  } catch (e: unknown) {
    if (e instanceof Error && e.message.toLowerCase().includes('not found')) {
      preimage = crypto.randomBytes(128);
    } else {
      throw e;
    }
  }
  return preimage;
}

async function waitForTransaction(txHash: string) {
  let attempts = 0;
  const maxAttempts = 120; // 10 minutes max wait time

  while (attempts < maxAttempts) {
    try {
      const txResult = await provider.getTransaction(txHash);
      if (txResult && !('error' in txResult)) {
        console.log('Transaction confirmed:', txResult.hash);
        return txResult.hash;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 5000));
    attempts++;
  }
}

function max(a: bigint, b: bigint) {
  return a > b ? a : b;
}
