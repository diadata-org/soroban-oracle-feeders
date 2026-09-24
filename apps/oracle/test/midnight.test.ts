import { connectMidnightOracle } from '@repo/common';
import config from '../src/config';
import { updateOracle, init } from '../src/oracles/midnight';
import { splitIntoFixedBatches, fillArray } from '../src/utils';

jest.mock('@repo/common', () => ({
  MIDNIGHT_BATCH_SIZE: 10,
  connectMidnightOracle: jest.fn(),
}));
jest.mock('../src/config', () => ({
  ChainName: {
    Midnight: 'midnight',
  },
  midnight: {
    maxRetryAttempts: 3,
  },
}));
jest.mock('../src/utils', () => ({
  splitIntoFixedBatches: jest.fn(),
  fillArray: jest.fn(),
}));

describe('Midnight Oracle - updateOracle', () => {
  const mockClient = {
    setMultipleValues: jest.fn(),
  };

  beforeAll(() => {
    (connectMidnightOracle as jest.Mock).mockResolvedValue(mockClient);

    init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully submit transactions for each batch', async () => {
    const keys = ['key1', 'key2'];
    const prices = [100, 200];

    (splitIntoFixedBatches as jest.Mock).mockImplementation((items) => [items]);
    (fillArray as jest.Mock).mockImplementation((items, size, fillValue) => items);

    const resultMock = { txId: 'mockTxId', blockHeight: 1 };
    mockClient.setMultipleValues.mockResolvedValue(resultMock);

    await updateOracle(keys, prices);

    expect(mockClient.setMultipleValues).toHaveBeenCalledWith([
      ['key1', { value: BigInt(100 * 100_000_000), timestamp: expect.any(BigInt) }],
      ['key2', { value: BigInt(200 * 100_000_000), timestamp: expect.any(BigInt) }],
    ]);
  });

  it('should retry transaction on failure and eventually succeed', async () => {
    const keys = ['key1', 'key2'];
    const prices = [100, 200];

    (splitIntoFixedBatches as jest.Mock).mockImplementation((items) => [items]);
    (fillArray as jest.Mock).mockImplementation((items, size, fillValue) => items);

    const resultMock = { txId: 'mockTxId', blockHeight: 1 };
    mockClient.setMultipleValues
      .mockRejectedValueOnce(new Error('Transaction failed'))
      .mockResolvedValueOnce(resultMock);

    await updateOracle(keys, prices);

    expect(mockClient.setMultipleValues).toHaveBeenCalledTimes(2); // 1 failure, 1 success
  });

  it('should throw an error after max retry attempts are reached', async () => {
    const keys = ['key1', 'key2'];
    const prices = [100, 200];

    (splitIntoFixedBatches as jest.Mock).mockImplementation((items) => [items]);
    (fillArray as jest.Mock).mockImplementation((items, size, fillValue) => items);

    mockClient.setMultipleValues.mockRejectedValue(new Error('Transaction failed'));

    await expect(updateOracle(keys, prices)).rejects.toThrow('Transaction failed');

    expect(mockClient.setMultipleValues).toHaveBeenCalledTimes(config.midnight.maxRetryAttempts);
  });
});
