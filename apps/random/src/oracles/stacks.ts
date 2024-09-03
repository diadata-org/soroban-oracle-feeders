import { AnchorMode, broadcastTransaction, uintCV, makeContractCall, tupleCV, callReadOnlyFunction, cvToString, cvToValue } from '@stacks/transactions';
import { StacksDevnet, StacksMainnet } from "@stacks/network";
import config, { ChainName } from '../config';
import { bufferFromHex } from '@stacks/transactions/dist/cl';

let network: StacksMainnet;

if (config.chainName === ChainName.STACKS) {
  init();
}

export function init() {
  network = config.stacks.rpcUrl ? new StacksMainnet({ url: config.stacks.rpcUrl }) : new StacksDevnet();
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
  const result = await callReadOnlyFunction(txOptions);
  return cvToValue(result).value;
}

export async function updateOracle(data: { round: number, randomness: string, signature: string, previous_signature: string }) {
  const maxRetries = config.stacks.maxRetryAttempts;
  let attempt = 0;

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
    network,
    anchorMode: AnchorMode.Any,
  };

  while (attempt < maxRetries) {
    try {
      const transaction = await makeContractCall(txOptions);
      const broadcastResponse = await broadcastTransaction(transaction, network);
      if (broadcastResponse.error) {
        throw new Error(`Transaction failed with error: ${broadcastResponse}`);
      }

      const txId = broadcastResponse.txid;
      console.log(`Transaction ID: ${txId}`);
      console.log('Random oracle updated');
      break;  // Exit loop if transaction is successful
    } catch (error) {
      console.error(`Transaction failed. Attempt ${attempt} of ${maxRetries}. Error:`, error);
      attempt++;
      if (attempt >= maxRetries) {
        console.error('Max retry attempts reached. Transaction failed.');
        throw error;
      }
    }
  }
}
