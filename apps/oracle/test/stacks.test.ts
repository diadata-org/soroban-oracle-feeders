import { AnchorMode, broadcastTransaction, makeContractCall, stringAsciiCV, uintCV, listCV, tupleCV } from '@stacks/transactions';
import { StacksMainnet, StacksDevnet } from "@stacks/network";
import config, { ChainName } from '../src/config';
import { updateOracle, init } from '../src/oracles/stacks';
import { splitIntoFixedBatches } from '../src/utils';

jest.mock('@stacks/transactions', () => ({
  ...jest.requireActual('@stacks/transactions'),
  broadcastTransaction: jest.fn(),
  makeContractCall: jest.fn(),
  stringAsciiCV: jest.fn(),
  uintCV: jest.fn(),
  listCV: jest.fn(),
  tupleCV: jest.fn(),
}));

jest.mock('@stacks/network', () => ({
  StacksMainnet: jest.fn(),
  StacksDevnet: jest.fn(),
}));

jest.mock('../src/utils', () => ({
  splitIntoFixedBatches: jest.fn(),
}));

describe('Stacks Oracle - updateOracle', () => {
  let mockNetwork: StacksMainnet;

  beforeAll(() => {
    // Initialize the network based on the config
    init();
    mockNetwork = new (config.stacks.rpcUrl ? StacksMainnet : StacksDevnet)({ url: config.stacks.rpcUrl });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully submit transactions for each batch', async () => {
    const keys = ['key1', 'key2'];
    const prices = [100, 200];
    const mockDate = Date.now();

    jest.spyOn(Date, 'now').mockReturnValue(mockDate);

    (splitIntoFixedBatches as jest.Mock).mockImplementation((items) => [items]);

    const transactionMock = { txid: 'mock-txid' };
    (makeContractCall as jest.Mock).mockResolvedValue(transactionMock);
    (broadcastTransaction as jest.Mock).mockResolvedValue({ txid: 'mock-txid' });

    await updateOracle(keys, prices);

    expect(makeContractCall).toHaveBeenCalledWith(expect.objectContaining({
      functionArgs: expect.any(Array),
      network: mockNetwork,
    }));

    expect(broadcastTransaction).toHaveBeenCalledWith(transactionMock, mockNetwork);
  });

  it('should retry transaction on failure and eventually succeed', async () => {
    const keys = ['key1', 'key2'];
    const prices = [100, 200];
    const mockDate = Date.now();

    jest.spyOn(Date, 'now').mockReturnValue(mockDate);

    (splitIntoFixedBatches as jest.Mock).mockImplementation((items) => [items]);

    const transactionMock = { txid: 'mock-txid' };
    (makeContractCall as jest.Mock).mockResolvedValue(transactionMock);
    (broadcastTransaction as jest.MockedFunction<typeof broadcastTransaction>)
      .mockRejectedValueOnce(new Error('Transaction failed'))
      .mockResolvedValueOnce({ txid: 'mock-txid' });

    await updateOracle(keys, prices);

    expect(broadcastTransaction).toHaveBeenCalledTimes(2); // 1 failure, 1 success
  });

  it('should throw an error after max retry attempts are reached', async () => {
    const keys = ['key1', 'key2'];
    const prices = [100, 200];
    const mockDate = Date.now();

    jest.spyOn(Date, 'now').mockReturnValue(mockDate);

    (splitIntoFixedBatches as jest.Mock).mockImplementation((items) => [items]);

    const transactionMock = { txid: 'mock-txid' };
    const broadcastTransactionMock = (broadcastTransaction as jest.MockedFunction<typeof broadcastTransaction>)
      .mockRejectedValue(new Error('Transaction failed'));

    await expect(updateOracle(keys, prices)).rejects.toThrow('Transaction failed');

    expect(broadcastTransactionMock).toHaveBeenCalledTimes(config.stacks.maxRetryAttempts);
  });
});
