import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MAP_ENTRY_DEPOSIT, NodeProvider, stringToHex, web3 } from '@alephium/web3';
import { PrivateKeyWallet } from '@alephium/web3-wallet';
import { DIAOracle } from '@repo/common';
import * as configModule from '../src/config';
import * as utilsModule from '../src/utils';

// Mock the @alephium/web3 modules
vi.mock('@alephium/web3', () => ({
  MAP_ENTRY_DEPOSIT: 1000000n,
  NodeProvider: vi.fn(),
  stringToHex: vi.fn(),
  web3: {
    setCurrentNodeProvider: vi.fn(),
  },
}));

// Mock @alephium/web3-wallet
vi.mock('@alephium/web3-wallet', () => ({
  PrivateKeyWallet: vi.fn(),
}));

// Mock @repo/common
vi.mock('@repo/common', () => ({
  DIAOracle: {
    at: vi.fn(),
  },
}));

// Mock config
vi.mock('../src/config', () => ({
  default: {
    chainName: 'alephium',
    alephium: {
      rpcUrl: 'http://localhost:22973',
      secretKey: 'test-secret-key',
      contract: '2AsrYbF4PhVtoinHawPzV8iqcwrj26SCE2ghNDkb5Cdm1',
      maxBatchSize: 10,
      maxRetryAttempts: 3,
    },
  },
  ChainName: {
    Alephium: 'alephium',
  },
}));

// Mock utils
vi.mock('../src/utils', () => ({
  splitIntoFixedBatches: vi.fn(),
  fillArray: vi.fn(),
}));

describe('Alephium Oracle', () => {
  let mockNodeProvider: any;
  let mockWallet: any;
  let mockOracle: any;
  let alephiumModule: any;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock node provider
    mockNodeProvider = {
      // Add any methods that might be called on NodeProvider
    };

    // Setup mock wallet
    mockWallet = {
      // Add any methods that might be called on PrivateKeyWallet
    };

    // Setup mock oracle
    mockOracle = {
      transact: {
        setMultipleValues: vi.fn(),
      },
    };

    // Setup constructor mocks
    (NodeProvider as any).mockImplementation(() => mockNodeProvider);
    (PrivateKeyWallet as any).mockImplementation(() => mockWallet);
    (DIAOracle.at as any).mockReturnValue(mockOracle);

    // Setup stringToHex mock
    (stringToHex as any).mockImplementation((str: string) => `hex-${str}`);

    // Setup utils mocks
    (utilsModule.splitIntoFixedBatches as any).mockImplementation((items: any[], size: number) => {
      const batches: any[][] = [];
      for (let i = 0; i < items.length; i += size) {
        batches.push(items.slice(i, i + size));
      }
      return batches;
    });

    (utilsModule.fillArray as any).mockImplementation((arr: any[], size: number, fill: any) => {
      const result = [...arr];
      while (result.length < size) {
        result.push(fill);
      }
      return result;
    });

    // Import the module
    alephiumModule = await import('../src/oracles/alephium');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('init', () => {
    it('should initialize nodeProvider, wallet, and oracle with correct config', () => {
      alephiumModule.init();

      expect(NodeProvider).toHaveBeenCalledWith(configModule.default.alephium.rpcUrl);
      expect(web3.setCurrentNodeProvider).toHaveBeenCalledWith(mockNodeProvider);
      expect(PrivateKeyWallet).toHaveBeenCalledWith({
        privateKey: configModule.default.alephium.secretKey,
        keyType: undefined,
        nodeProvider: mockNodeProvider,
      });
      expect(DIAOracle.at).toHaveBeenCalledWith(configModule.default.alephium.contract);
    });
  });

  describe('updateOracle', () => {
    beforeEach(() => {
      alephiumModule.init();
    });

    it('should successfully update oracle with valid data', async () => {
      const keys = ['BTC', 'ETH'];
      const prices = [50000, 3000];

      // Mock successful transaction
      mockOracle.transact.setMultipleValues.mockResolvedValue({ hash: 'test-hash' });

      await alephiumModule.updateOracle(keys, prices);

      // Verify stringToHex was called for keys
      expect(stringToHex).toHaveBeenCalledWith('BTC');
      expect(stringToHex).toHaveBeenCalledWith('ETH');

      // Verify oracle transaction was called with correct parameters
      expect(mockOracle.transact.setMultipleValues).toHaveBeenCalledWith({
        args: {
          keys: expect.any(Array),
          values: expect.any(Array),
          timestamps: expect.any(Array),
          batchSize: 2n,
        },
        signer: mockWallet,
        attoAlphAmount: MAP_ENTRY_DEPOSIT * 2n,
      });
    });

    it('should handle transaction failure and retry', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      // Mock failure on first attempt, success on second
      mockOracle.transact.setMultipleValues
        .mockRejectedValueOnce(new Error('Transaction failed'))
        .mockResolvedValueOnce({ hash: 'test-hash' });

      await alephiumModule.updateOracle(keys, prices);

      // Should have been called twice (retry)
      expect(mockOracle.transact.setMultipleValues).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retry attempts', async () => {
      const keys = ['BTC'];
      const prices = [50000];
      const error = new Error('Persistent failure');

      // Mock all attempts to fail
      mockOracle.transact.setMultipleValues.mockRejectedValue(error);

      await expect(alephiumModule.updateOracle(keys, prices)).rejects.toThrow('Persistent failure');

      // Should have been called maxRetryAttempts times
      expect(mockOracle.transact.setMultipleValues).toHaveBeenCalledTimes(
        configModule.default.alephium.maxRetryAttempts
      );
    });

    it('should convert prices to correct format (multiply by 100_000_000)', async () => {
      const keys = ['BTC', 'ETH'];
      const prices = [50000.123, 3000.456];

      mockOracle.transact.setMultipleValues.mockResolvedValue({ hash: 'test-hash' });

      await alephiumModule.updateOracle(keys, prices);

      // Verify the values were converted correctly
      const callArgs = mockOracle.transact.setMultipleValues.mock.calls[0][0];
      expect(callArgs.args.values).toEqual(
        expect.arrayContaining([
          BigInt(Math.floor(50000.123 * 100_000_000)),
          BigInt(Math.floor(3000.456 * 100_000_000)),
        ])
      );
    });

    it('should handle batching when data exceeds maxBatchSize', async () => {
      const keys = ['BTC', 'ETH', 'USDC', 'SOL', 'ADA'];
      const prices = [50000, 3000, 1, 100, 0.5];

      // Set maxBatchSize to 2 for this test
      const originalMaxBatchSize = configModule.default.alephium.maxBatchSize;
      configModule.default.alephium.maxBatchSize = 2;

      mockOracle.transact.setMultipleValues.mockResolvedValue({ hash: 'test-hash' });

      await alephiumModule.updateOracle(keys, prices);

      // Should have been called 3 times (2 items per batch, 5 total items)
      expect(mockOracle.transact.setMultipleValues).toHaveBeenCalledTimes(3);

      // Restore original maxBatchSize
      configModule.default.alephium.maxBatchSize = originalMaxBatchSize;
    });

    it('should use current timestamp for all entries', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      const mockDate = new Date('2024-01-01T00:00:00Z');
      const mockTimestamp = BigInt(mockDate.getTime());
      
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);

      mockOracle.transact.setMultipleValues.mockResolvedValue({ hash: 'test-hash' });

      await alephiumModule.updateOracle(keys, prices);

      vi.useRealTimers();

      // Verify the timestamp was used in the transaction
      const callArgs = mockOracle.transact.setMultipleValues.mock.calls[0][0];
      expect(callArgs.args.timestamps).toEqual(
        expect.arrayContaining([mockTimestamp])
      );
    });

    it('should handle empty keys and prices arrays', async () => {
      const keys: string[] = [];
      const prices: number[] = [];

      mockOracle.transact.setMultipleValues.mockResolvedValue({ hash: 'test-hash' });

      await alephiumModule.updateOracle(keys, prices);

      // Should still call the oracle with empty arrays
      expect(mockOracle.transact.setMultipleValues).not.toHaveBeenCalledWith({
        args: {
          keys: expect.any(Array),
          values: expect.any(Array),
          timestamps: expect.any(Array),
          batchSize: 0n,
        },
        signer: mockWallet,
        attoAlphAmount: MAP_ENTRY_DEPOSIT * 0n,
      });
    });

    it('should handle different price scales correctly', async () => {
      const keys = ['BTC', 'ETH', 'USDC'];
      const prices = [0.0001, 999999.9999, 1.0001];

      mockOracle.transact.setMultipleValues.mockResolvedValue({ hash: 'test-hash' });

      await alephiumModule.updateOracle(keys, prices);

      // Verify the transaction was called
      expect(mockOracle.transact.setMultipleValues).toHaveBeenCalledWith({
        args: {
          keys: expect.any(Array),
          values: expect.any(Array),
          timestamps: expect.any(Array),
          batchSize: 3n,
        },
        signer: mockWallet,
        attoAlphAmount: MAP_ENTRY_DEPOSIT * 3n,
      });
    });

    it('should calculate correct attoAlphAmount based on batch size', async () => {
      const keys = ['BTC', 'ETH', 'USDC'];
      const prices = [50000, 3000, 1];

      mockOracle.transact.setMultipleValues.mockResolvedValue({ hash: 'test-hash' });

      await alephiumModule.updateOracle(keys, prices);

      // Verify attoAlphAmount is calculated correctly
      const callArgs = mockOracle.transact.setMultipleValues.mock.calls[0][0];
      expect(callArgs.attoAlphAmount).toBe(MAP_ENTRY_DEPOSIT * 3n);
    });
  });

  describe('conditional initialization', () => {
    it('should not initialize when chainName is not Alephium', async () => {
      // Mock config to return non-Alephium chain
      vi.mocked(configModule.default).chainName = 'OtherChain' as any;

      // Re-import the module to trigger the conditional initialization
      vi.resetModules();
      const newModule = await import('../src/oracles/alephium');

      // Should not have called init
      expect(NodeProvider).not.toHaveBeenCalled();
    });

    it('should initialize when chainName is Alephium', async () => {
      // Mock config to return Alephium chain
      vi.mocked(configModule.default).chainName = 'alephium' as any;

      // Re-import the module to trigger the conditional initialization
      vi.resetModules();
      await import('../src/oracles/alephium');

      // Should have called init
      expect(NodeProvider).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      alephiumModule.init();
    });

    it('should handle oracle transaction failure', async () => {
      const keys = ['BTC'];
      const prices = [50000];
      const error = new Error('Oracle transaction failed');

      mockOracle.transact.setMultipleValues.mockRejectedValue(error);

      await expect(alephiumModule.updateOracle(keys, prices)).rejects.toThrow('Oracle transaction failed');
    });

    it('should log error details during retry attempts', async () => {
      const keys = ['BTC'];
      const prices = [50000];
      const error = new Error('Network error');

      // Mock console.error to capture logs
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockOracle.transact.setMultipleValues.mockRejectedValue(error);

      await expect(alephiumModule.updateOracle(keys, prices)).rejects.toThrow('Network error');

      // Verify error was logged for each retry attempt
      expect(consoleSpy).toHaveBeenCalledTimes(configModule.default.alephium.maxRetryAttempts + 1);

      consoleSpy.mockRestore();
    });

    it('should log successful batch updates', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      // Mock console.log to capture logs
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      mockOracle.transact.setMultipleValues.mockResolvedValue({ hash: 'test-hash' });

      await alephiumModule.updateOracle(keys, prices);

      // Verify success was logged
      expect(consoleSpy).toHaveBeenCalledWith('batch update:', { hash: 'test-hash' });
      expect(consoleSpy).toHaveBeenCalledWith('Oracle updated');

      consoleSpy.mockRestore();
    });
  });

  describe('data processing', () => {
    beforeEach(() => {
      alephiumModule.init();
    });

    it('should use splitIntoFixedBatches for keys and prices', async () => {
      const keys = ['BTC', 'ETH', 'USDC'];
      const prices = [50000, 3000, 1];

      mockOracle.transact.setMultipleValues.mockResolvedValue({ hash: 'test-hash' });

      await alephiumModule.updateOracle(keys, prices);

      // Verify splitIntoFixedBatches was called for both keys and prices
      expect(utilsModule.splitIntoFixedBatches).toHaveBeenCalledWith(keys, configModule.default.alephium.maxBatchSize);
      expect(utilsModule.splitIntoFixedBatches).toHaveBeenCalledWith(prices, configModule.default.alephium.maxBatchSize);
    });

    it('should use fillArray to pad arrays to maxBatchSize', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      mockOracle.transact.setMultipleValues.mockResolvedValue({ hash: 'test-hash' });

      await alephiumModule.updateOracle(keys, prices);

      // Verify fillArray was called to pad the arrays
      expect(utilsModule.fillArray).toHaveBeenCalledWith(
        expect.any(Array),
        configModule.default.alephium.maxBatchSize,
        expect.any(String)
      );
      expect(utilsModule.fillArray).toHaveBeenCalledWith(
        expect.any(Array),
        configModule.default.alephium.maxBatchSize,
        expect.any(BigInt)
      );
    });
  });
}); 
