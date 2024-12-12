import { NodeProvider, stringToHex, web3 } from '@alephium/web3';
import { PrivateKeyWallet } from '@alephium/web3-wallet';
import { DIAOracle, DIAOracleInstance } from '@repo/common';
import config, { ChainName } from '../src/config';
import { updateOracle, init } from '../src/oracles/alephium';
import { splitIntoFixedBatches, fillArray } from '../src/utils';

jest.mock('@alephium/web3', () => {
  const originalModule = jest.requireActual('@alephium/web3');
  return {
    ...originalModule,
    MAP_ENTRY_DEPOSIT: BigInt(1000000000000000000), // Mocking MAP_ENTRY_DEPOSIT
    NodeProvider: jest.fn().mockImplementation(() => ({
      someNodeProviderMethod: jest.fn(),
    })),
    web3: {
      ...originalModule.web3,
      setCurrentNodeProvider: jest.fn(), // Explicitly mock setCurrentNodeProvider
    },
  };
});

jest.mock('@alephium/web3-wallet');
jest.mock('@repo/common');
jest.mock('../src/utils', () => ({
  splitIntoFixedBatches: jest.fn(),
  fillArray: jest.fn(),
}));

describe('Alephium Oracle - updateOracle', () => {
  const mockNodeProvider = new (NodeProvider as unknown as jest.Mock)(); // Mock instance of NodeProvider
  const mockWallet = { someWalletMethod: jest.fn() };
  const mockOracleInstance = {
    transact: {
      setMultipleValues: jest.fn(),
    },
  };

  beforeAll(() => {
    // Mock the constructor and implementation of NodeProvider and other classes
    (PrivateKeyWallet as unknown as jest.Mock).mockImplementation(() => mockWallet);
    (DIAOracle.at as jest.Mock).mockReturnValue(mockOracleInstance);

    // Initialize the Alephium oracle environment
    init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully submit transactions for each batch', async () => {
    const keys = ['key1', 'key2'];
    const prices = [100, 200];
    const hexKeys = keys.map(stringToHex);
    const bigIntPrices = prices.map((price) => BigInt(Math.floor(price * 100_000_000)));

    (splitIntoFixedBatches as jest.Mock).mockImplementation((items) => [items]);
    (fillArray as jest.Mock).mockImplementation((items, size, fillValue) => items);

    const resultMock = { success: true };
    (mockOracleInstance.transact.setMultipleValues as jest.Mock).mockResolvedValue(resultMock);

    await updateOracle(keys, prices);

    expect(mockOracleInstance.transact.setMultipleValues).toHaveBeenCalledWith(
      expect.objectContaining({
        args: {
          keys: hexKeys,
          values: bigIntPrices,
          timestamps: expect.any(Array),
          batchSize: BigInt(keys.length),
        },
        signer: mockWallet,
        attoAlphAmount: BigInt(1000000000000000000) * BigInt(keys.length),
      }),
    );
  });

  it('should retry transaction on failure and eventually succeed', async () => {
    const keys = ['key1', 'key2'];
    const prices = [100, 200];

    (splitIntoFixedBatches as jest.Mock).mockImplementation((items) => [items]);
    (fillArray as jest.Mock).mockImplementation((items, size, fillValue) => items);

    const resultMock = { success: true };
    const transactMock = mockOracleInstance.transact.setMultipleValues as jest.MockedFunction<
      typeof mockOracleInstance.transact.setMultipleValues
    >;

    transactMock
      .mockRejectedValueOnce(new Error('Transaction failed'))
      .mockResolvedValueOnce(resultMock);

    await updateOracle(keys, prices);

    expect(transactMock).toHaveBeenCalledTimes(2); // 1 failure, 1 success
  });

  it('should throw an error after max retry attempts are reached', async () => {
    const keys = ['key1', 'key2'];
    const prices = [100, 200];

    (splitIntoFixedBatches as jest.Mock).mockImplementation((items) => [items]);
    (fillArray as jest.Mock).mockImplementation((items, size, fillValue) => items);

    const transactMock = mockOracleInstance.transact.setMultipleValues as jest.MockedFunction<
      typeof mockOracleInstance.transact.setMultipleValues
    >;

    transactMock.mockRejectedValue(new Error('Transaction failed'));

    await expect(updateOracle(keys, prices)).rejects.toThrow('Transaction failed');

    expect(transactMock).toHaveBeenCalledTimes(config.alephium.maxRetryAttempts);
  });
});
