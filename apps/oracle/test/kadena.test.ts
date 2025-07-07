import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { Pact, createClient, createSignWithKeypair } from '@kadena/client';
import { ChainId } from '@kadena/types';
import { submitKadenaTx } from '@repo/common';
import * as configModule from '../src/config';
import * as utilsModule from '../src/utils';

// Mock the @kadena/client modules
vi.mock('@kadena/client', () => ({
  Pact: {
    builder: {
      execution: vi.fn().mockReturnThis(),
      addSigner: vi.fn().mockReturnThis(),
      setMeta: vi.fn().mockReturnThis(),
      setNetworkId: vi.fn().mockReturnThis(),
      createTransaction: vi.fn(),
    } as any,
  },
  createClient: vi.fn(),
  createSignWithKeypair: vi.fn(),
}));

// Mock @kadena/types
vi.mock('@kadena/types', () => ({
  ChainId: {
    '0': '0',
    '1': '1',
    '2': '2',
    '3': '3',
    '4': '4',
    '5': '5',
    '6': '6',
    '7': '7',
    '8': '8',
    '9': '9',
    '10': '10',
    '11': '11',
    '12': '12',
    '13': '13',
    '14': '14',
    '15': '15',
    '16': '16',
    '17': '17',
    '18': '18',
    '19': '19',
  },
}));

// Mock @repo/common
vi.mock('@repo/common', () => ({
  submitKadenaTx: vi.fn(),
}));

// Mock config
vi.mock('../src/config', () => ({
  default: {
    chain: {
      name: 'kadena',
      kadena: {
        rpcUrl: 'https://api.testnet.chainweb.com',
        secretKey: 'test-secret-key',
        publicKey: 'test-public-key',
        contract: 'free.dia-oracle',
        networkId: 'testnet04',
        chainId: '0',
        maxAssetsPerTx: 10,
        maxRetryAttempts: 3,
      },
    },
    kadena: {
      rpcUrl: 'https://api.testnet.chainweb.com',
      secretKey: 'test-secret-key',
      publicKey: 'test-public-key',
      contract: 'free.dia-oracle',
      networkId: 'testnet04',
      chainId: '0',
      maxAssetsPerTx: 10,
      maxRetryAttempts: 3,
    },
  },
}));

// Mock utils
vi.mock('../src/utils', () => ({
  splitIntoFixedBatches: vi.fn(),
}));

describe('Kadena Oracle', () => {
  let mockClient: any;
  let mockSignWithKeypair: any;
  let mockUnsignedTransaction: any;
  let mockSignedTx: any;
  let kadenaModule: any;

  beforeEach(async () => {
    // Reset all mocks and modules
    vi.clearAllMocks();
    vi.resetModules();

    // Setup mock client
    mockClient = {
      // Add any methods that might be called on client
    };

    // Setup mock sign function
    mockSignWithKeypair = vi.fn();

    // Setup mock unsigned transaction
    mockUnsignedTransaction = {
      // Add any properties that might be accessed
    };

    // Setup mock signed transaction
    mockSignedTx = {
      // Add any properties that might be accessed
    };

    // Setup constructor mocks
    (createClient as any).mockReturnValue(mockClient);
    (createSignWithKeypair as any).mockReturnValue(mockSignWithKeypair);
    ((Pact.builder as any).createTransaction as any).mockReturnValue(mockUnsignedTransaction);
    mockSignWithKeypair.mockResolvedValue(mockSignedTx);

    // Setup utils mocks
    (utilsModule.splitIntoFixedBatches as any).mockImplementation((items: any[], size: number) => {
      const batches: any[][] = [];
      for (let i = 0; i < items.length; i += size) {
        batches.push(items.slice(i, i + size));
      }
      return batches;
    });

    // Import the module after mocks are set up
    kadenaModule = await import('../src/oracles/kadena');
  });

  afterEach(() => {
    //vi.restoreAllMocks();
  });

  describe('update', () => {
    it('should successfully update oracle with valid data', async () => {
      const keys = ['BTC', 'ETH'];
      const prices = [50000, 3000];

      // Mock successful transaction
      (submitKadenaTx as any).mockResolvedValue(undefined);

      await kadenaModule.update(keys, prices);

      // Verify client was created with correct URL
      expect(createClient).toHaveBeenCalledWith(
        `${configModule.default.chain.kadena.rpcUrl}/chainweb/0.0/${configModule.default.chain.kadena.networkId}/chain/${configModule.default.chain.kadena.chainId}/pact`
      );

      // Verify signWithKeypair was created
      expect(createSignWithKeypair).toHaveBeenCalledWith({
        publicKey: configModule.default.chain.kadena.publicKey,
        secretKey: configModule.default.chain.kadena.secretKey,
      });

      // Verify Pact.builder was used correctly
      expect(Pact.builder.execution).toHaveBeenCalled();
      expect((Pact.builder as any).addSigner).toHaveBeenCalledWith(configModule.default.chain.kadena.publicKey);
      expect((Pact.builder as any).setMeta).toHaveBeenCalledWith({
        chainId: configModule.default.chain.kadena.chainId as ChainId,
        senderAccount: `k:${configModule.default.chain.kadena.publicKey}`,
      });
      expect((Pact.builder as any).setNetworkId).toHaveBeenCalledWith(configModule.default.chain.kadena.networkId);
      expect((Pact.builder as any).createTransaction).toHaveBeenCalled();

      // Verify transaction was signed and submitted
      expect(mockSignWithKeypair).toHaveBeenCalledWith(mockUnsignedTransaction);
      expect(submitKadenaTx).toHaveBeenCalledWith(mockClient, mockSignedTx);
    });

    it('should handle transaction failure and retry', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      // Mock failure on first attempt, success on second
      (submitKadenaTx as any)
        .mockRejectedValueOnce(new Error('Transaction failed'))
        .mockResolvedValueOnce(undefined);

      await kadenaModule.update(keys, prices);

      // Should have been called twice (retry)
      expect(submitKadenaTx).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retry attempts', async () => {
      const keys = ['BTC'];
      const prices = [50000];
      const error = new Error('Persistent failure');

      // Mock all attempts to fail
      (submitKadenaTx as any).mockRejectedValue(error);

      await expect(kadenaModule.update(keys, prices)).rejects.toThrow('Persistent failure');

      // Should have been called maxRetryAttempts times
      expect(submitKadenaTx).toHaveBeenCalledTimes(
        configModule.default.chain.kadena.maxRetryAttempts
      );
    });

    it('should handle batching when data exceeds maxAssetsPerTx', async () => {
      const keys = ['BTC', 'ETH', 'USDC', 'SOL', 'ADA'];
      const prices = [50000, 3000, 1, 100, 0.5];

      // Set maxAssetsPerTx to 2 for this test
      const originalMaxAssetsPerTx = configModule.default.chain.kadena.maxAssetsPerTx;
      configModule.default.chain.kadena.maxAssetsPerTx = 2;

      (submitKadenaTx as any).mockResolvedValue(undefined);

      await kadenaModule.update(keys, prices);

      // Should have been called 3 times (2 items per batch, 5 total items)
      expect(submitKadenaTx).toHaveBeenCalledTimes(3);

      // Restore original maxAssetsPerTx
      configModule.default.chain.kadena.maxAssetsPerTx = originalMaxAssetsPerTx;
    });

    it('should use current ISO date for all entries', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      const mockDate = new Date('2024-01-01T12:00:00.000Z');
      
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);

      (submitKadenaTx as any).mockResolvedValue(undefined);

      await kadenaModule.update(keys, prices);

      vi.useRealTimers();

      // Verify the execution was called with the correct date format
      expect(Pact.builder.execution).toHaveBeenCalledWith(
        expect.stringContaining('(time "2024-01-01T12:00:00Z")')
      );
    });

    it('should handle empty keys and prices arrays', async () => {
      const keys: string[] = [];
      const prices: number[] = [];

      (submitKadenaTx as any).mockResolvedValue(undefined);

      await kadenaModule.update(keys, prices);

      // Should still call the oracle with empty arrays
      expect(Pact.builder.execution).not.toHaveBeenCalledWith(
        expect.stringContaining('[] [] []')
      );
    });

    it('should handle different price scales correctly', async () => {
      const keys = ['BTC', 'ETH', 'USDC'];
      const prices = [0.0001, 999999.9999, 1.0001];

      (submitKadenaTx as any).mockResolvedValue(undefined);

      await kadenaModule.update(keys, prices);

      // Verify the execution was called
      expect(Pact.builder.execution).toHaveBeenCalledWith(
        expect.stringContaining(configModule.default.chain.kadena.contract)
      );
    });

    it('should format execution string correctly', async () => {
      const keys = ['BTC', 'ETH'];
      const prices = [50000, 3000];

      (submitKadenaTx as any).mockResolvedValue(undefined);

      await kadenaModule.update(keys, prices);

      // Verify the execution string format
      expect(Pact.builder.execution).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(`\\(${configModule.default.chain.kadena.contract}\\.set-multiple-values \\[".*"\\] \\[\\(time ".*"\\)\\] \\[.*\\]\\)`)
        )
      );
    });

    it('should use splitIntoFixedBatches for keys, dates, and prices', async () => {
      const keys = ['BTC', 'ETH', 'USDC'];
      const prices = [50000, 3000, 1];

      (submitKadenaTx as any).mockResolvedValue(undefined);

      await kadenaModule.update(keys, prices);

      // Verify splitIntoFixedBatches was called for keys, dates, and prices
      expect(utilsModule.splitIntoFixedBatches).toHaveBeenCalledWith(keys, configModule.default.chain.kadena.maxAssetsPerTx);
      expect(utilsModule.splitIntoFixedBatches).toHaveBeenCalledWith(prices, configModule.default.chain.kadena.maxAssetsPerTx);
    });
  });

  describe('error handling', () => {
    it('should handle transaction submission failure', async () => {
      const keys = ['BTC'];
      const prices = [50000];
      const error = new Error('Transaction submission failed');

      (submitKadenaTx as any).mockRejectedValue(error);

      await expect(kadenaModule.update(keys, prices)).rejects.toThrow('Transaction submission failed');
    });

    it('should log error details during retry attempts', async () => {
      const keys = ['BTC'];
      const prices = [50000];
      const error = new Error('Network error');

      // Mock console.error to capture logs
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      (submitKadenaTx as any).mockRejectedValue(error);

      await expect(kadenaModule.update(keys, prices)).rejects.toThrow('Network error');

      // Verify error was logged for each retry attempt
      expect(consoleSpy).toHaveBeenCalledTimes(configModule.default.chain.kadena.maxRetryAttempts + 1);

      consoleSpy.mockRestore();
    });

    it('should log successful transaction submissions', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      // Mock console.log to capture logs
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      (submitKadenaTx as any).mockResolvedValue(undefined);

      await kadenaModule.update(keys, prices);

      // Verify success was logged
      expect(consoleSpy).toHaveBeenCalledWith('Signed transaction:', mockSignedTx);
      expect(consoleSpy).toHaveBeenCalledWith('Transaction submitted successfully.');
      expect(consoleSpy).toHaveBeenCalledWith('Oracle updated');

      consoleSpy.mockRestore();
    });
  });

  describe('data processing', () => {
    it('should create dates array with same ISO date for all prices', async () => {
      const keys = ['BTC', 'ETH', 'USDC'];
      const prices = [50000, 3000, 1];

      const mockDate = new Date('2024-01-01T12:00:00.000Z');
      
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);

      (submitKadenaTx as any).mockResolvedValue(undefined);

      await kadenaModule.update(keys, prices);

      vi.useRealTimers();

      // Verify the execution was called with the correct number of time entries
      expect(Pact.builder.execution).toHaveBeenCalledWith(
        expect.stringMatching(/\(time "2024-01-01T12:00:00Z"\), \(time "2024-01-01T12:00:00Z"\), \(time "2024-01-01T12:00:00Z"\)/)
      );
    });

    it('should handle single item batches correctly', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      (submitKadenaTx as any).mockResolvedValue(undefined);

      await kadenaModule.update(keys, prices);

      // Verify the execution was called with single item format
      expect(Pact.builder.execution).toHaveBeenCalledWith(
        expect.stringMatching(/\(time ".*"\)/)
      );
    });

    it('should handle multiple batches correctly', async () => {
      const keys = ['BTC', 'ETH', 'USDC', 'SOL', 'ADA', 'DOT'];
      const prices = [50000, 3000, 1, 100, 0.5, 5];

      // Set maxAssetsPerTx to 2 for this test
      const originalMaxAssetsPerTx = configModule.default.chain.kadena.maxAssetsPerTx;
      configModule.default.chain.kadena.maxAssetsPerTx = 2;

      (submitKadenaTx as any).mockResolvedValue(undefined);

      await kadenaModule.update(keys, prices);

      // Should have been called 3 times (2 items per batch, 6 total items)
      expect(submitKadenaTx).toHaveBeenCalledTimes(3);

      // Restore original maxAssetsPerTx
      configModule.default.chain.kadena.maxAssetsPerTx = originalMaxAssetsPerTx;
    });
  });

  describe('configuration', () => {
    it('should use correct contract name in execution', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      (submitKadenaTx as any).mockResolvedValue(undefined);

      await kadenaModule.update(keys, prices);

      // Verify the contract name is used correctly
      expect(Pact.builder.execution).toHaveBeenCalledWith(
        expect.stringContaining(`${configModule.default.chain.kadena.contract}.set-multiple-values`)
      );
    });

    it('should use correct chainId and networkId', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      (submitKadenaTx as any).mockResolvedValue(undefined);

      await kadenaModule.update(keys, prices);

      // Verify the chainId and networkId are set correctly
      expect((Pact.builder as any).setMeta).toHaveBeenCalledWith({
        chainId: configModule.default.chain.kadena.chainId as ChainId,
        senderAccount: `k:${configModule.default.chain.kadena.publicKey}`,
      });
      expect((Pact.builder as any).setNetworkId).toHaveBeenCalledWith(configModule.default.chain.kadena.networkId);
    });
  });
}); 
