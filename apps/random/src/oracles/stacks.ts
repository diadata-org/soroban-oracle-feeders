import { AnchorMode, broadcastTransaction, uintCV, makeContractCall, tupleCV, callReadOnlyFunction, cvToValue } from '@stacks/transactions';
import { StacksDevnet, StacksMainnet } from "@stacks/network";
import config, { ChainName } from '../config';
import { bufferFromHex } from '@stacks/transactions/dist/cl';

let network: StacksMainnet;
let backupNetwork: StacksMainnet | undefined;

if (config.chainName === ChainName.STACKS) {
  init();
}

export function init() {
  network = config.stacks.rpcUrl ? new StacksMainnet({ url: config.stacks.rpcUrl }) : new StacksDevnet();
  
  if (config.stacks.backupRpcUrl) {
    backupNetwork = new StacksMainnet({ url: config.stacks.backupRpcUrl });
  }
}

export async function getLastRound() {
  const txOptions = {
    contractAddress: config.stacks.contract,
    contractName: config.stacks.contractName,
    functionName: 'get-last-round',
    functionArgs: [],
    network,
    senderAddress: config.stacks.contract
  };
  try {
    const result = await callReadOnlyFunction(txOptions);
    return cvToValue(result).value;
  } catch (error) {
    if (backupNetwork) {
      console.error('Primary node failed. Switching to backup node for getLastRound.');
      txOptions.network = backupNetwork;
      const result = await callReadOnlyFunction(txOptions);
      return cvToValue(result).value;
    } else {
      throw error;
    }
  }
}

export async function updateOracle(data: { round: number, randomness: string, signature: string, previous_signature: string }) {
  const maxRetries = config.stacks.maxRetryAttempts;
  let attempt = 0;
  let useBackup = false;

  while (attempt < maxRetries) {
    try {
      const txOptions = {
        contractAddress: config.stacks.contract,
        contractName: config.stacks.contractName,
        functionName: 'set-random-value',
        functionArgs: [
          uintCV(data.round),
          tupleCV({
            randomness: bufferFromHex(data.randomness),
            signature: bufferFromHex(data.signature),
            'previous-signature': bufferFromHex(data.previous_signature)
          })
        ],
        senderKey: config.stacks.secretKey,
        network: useBackup && backupNetwork ? backupNetwork : network,
        anchorMode: AnchorMode.Any,
      };

      const transaction = await makeContractCall(txOptions);
      const broadcastResponse = await broadcastTransaction(transaction, txOptions.network);
      
      if (broadcastResponse.error) {
        throw new Error(`Transaction failed with error: ${broadcastResponse}`);
      }

      const txId = broadcastResponse.txid;
      console.log(`Transaction ID: ${txId}`);
      console.log('Random oracle updated');
      break;  // Exit loop if transaction is successful
    } catch (error) {
      console.error(`Transaction failed. Attempt ${attempt + 1} of ${maxRetries}. Error:`, error);
      attempt++;
      
      if (attempt === 1 && backupNetwork) {
        console.error('Switching to backup node.');
        useBackup = true;
      }

      if (attempt >= maxRetries) {
        console.error('Max retry attempts reached. Transaction failed.');
        throw error;
      }
    }
  }
}
