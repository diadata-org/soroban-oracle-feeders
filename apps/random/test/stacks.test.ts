import {
  AnchorMode,
  broadcastTransaction,
  makeContractCall,
  callReadOnlyFunction,
  uintCV,
  tupleCV,
  bufferCVFromString,
  cvToValue,
} from '@stacks/transactions';
import { StacksMainnet, StacksDevnet } from "@stacks/network";
import { getLastRound, updateOracle, init } from '../src/oracles/stacks';
import config, { ChainName } from '../src/config';

jest.mock('@stacks/transactions', () => ({
  ...jest.requireActual('@stacks/transactions'),
  broadcastTransaction: jest.fn(),
  makeContractCall: jest.fn(),
  callReadOnlyFunction: jest.fn(),
  uintCV: jest.fn(),
  tupleCV: jest.fn(),
  bufferCVFromString: jest.fn(),
  cvToValue: jest.fn(),
}));

jest.mock('@stacks/network', () => ({
  StacksMainnet: jest.fn(),
  StacksDevnet: jest.fn(),
}));

describe('Stacks Randomness Oracle', () => {
  let mockNetwork: StacksMainnet;

  beforeAll(() => {
    init();
    mockNetwork = new (config.stacks.rpcUrl ? StacksMainnet : StacksDevnet)({ url: config.stacks.rpcUrl });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getLastRound', () => {
    it('should fetch and return the last round correctly', async () => {
      const mockResult = { value: 1234 };
      (callReadOnlyFunction as jest.Mock).mockResolvedValue(mockResult);
      (cvToValue as jest.Mock).mockReturnValue({ value: 1234 });

      const lastRound = await getLastRound();

      expect(callReadOnlyFunction).toHaveBeenCalledWith(expect.objectContaining({
        contractAddress: config.stacks.contract,
        contractName: config.stacks.contractName,
        functionName: 'get-last-round',
        functionArgs: [],
        network: mockNetwork,
      }));
      expect(cvToValue).toHaveBeenCalledWith(mockResult);
      expect(lastRound).toBe(1234);
    });

    it('should throw an error if getLastRound fails', async () => {
      (callReadOnlyFunction as jest.Mock).mockRejectedValue(new Error('Failed to fetch last round'));

      await expect(getLastRound()).rejects.toThrow('Failed to fetch last round');
    });
  });

  describe('updateOracle', () => {
    const mockData = {
      round: 4331091,
      randomness: '2cacf006c2b96ca2c1ba6db42c24ce8e5a8bed94007caa0b751eabce39f0230b',
      signature: 'a2875e677496058ccaacabab31ae7fe6cbd1b6a5f162b3cadf752fcc583b0dbecd7508142ce72d72bf279de356b166f611e7a95d5df3b5ec3a8a81fd32f7e47f20583946f8ba182bb69052d9c9e053b4515001b3b9b9f4e52e528bcb88eeb231',
      previous_signature: '945eb812e6fdf9edcfcfd2022ef76bd86678867a653eb25926e56a8911ae32609bcc8429e2bbafa59848989a39a2d09b13c8e1667851639d86ac6d5afda8e539bc40515d01a5bec580889ebf5792733ce590e4db13d036d27121f095c33e6b4b',
    };

    it('should build and submit a transaction to update the oracle', async () => {
      const transactionMock = { txid: 'mock-txid' };
      (makeContractCall as jest.Mock).mockResolvedValue(transactionMock);
      (broadcastTransaction as jest.Mock).mockResolvedValue({ txid: 'mock-txid' });

      await updateOracle(mockData);

      expect(makeContractCall).toHaveBeenCalledWith(expect.objectContaining({
        contractAddress: config.stacks.contract,
        contractName: config.stacks.contractName,
        functionName: 'set-random-value',
        functionArgs: [
          uintCV(mockData.round),
          tupleCV({
            randomness: bufferCVFromString(mockData.randomness),
            signature: bufferCVFromString(mockData.signature),
            'previous-signature': bufferCVFromString(mockData.previous_signature),
          }),
        ],
        senderKey: config.stacks.secretKey,
        network: mockNetwork,
        anchorMode: AnchorMode.Any,
      }));

      expect(broadcastTransaction).toHaveBeenCalledWith(transactionMock, mockNetwork);
    });

    it('should retry transaction on failure and eventually succeed', async () => {
      const transactionMock = { txid: 'mock-txid' };
      (makeContractCall as jest.Mock)
        .mockResolvedValue(transactionMock);
      const broadcastTransactionMock = (broadcastTransaction as jest.MockedFunction<typeof broadcastTransaction>)
        .mockRejectedValueOnce(new Error('Transaction failed'))
        .mockResolvedValueOnce({ txid: 'mock-txid' });

      await updateOracle(mockData);

      expect(broadcastTransactionMock).toHaveBeenCalledTimes(2); // 1 failure, 1 success
    });

    it('should throw an error after max retry attempts are reached', async () => {
      const broadcastTransactionMock = (broadcastTransaction as jest.MockedFunction<typeof broadcastTransaction>)
        .mockRejectedValue(new Error('Transaction failed'));

      await expect(updateOracle(mockData)).rejects.toThrow('Transaction failed');

      expect(broadcastTransactionMock).toHaveBeenCalledTimes(config.stacks.maxRetryAttempts);
    });
  });
});
