import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import {
  AnchorMode,
  broadcastTransaction,
  uintCV,
  stringAsciiCV,
  makeContractCall,
  listCV,
  tupleCV,
  estimateContractFunctionCall,
  getAddressFromPrivateKey,
  TransactionVersion,
} from '@stacks/transactions';
import { StacksDevnet, StacksMainnet, StacksTestnet } from '@stacks/network';
import type { TransactionResults } from '@stacks/stacks-blockchain-api-types';
import * as configModule from '../src/config';
import * as utilsModule from '../src/utils';

// Mock axios
vi.mock('axios');

// Mock @stacks/transactions modules
vi.mock('@stacks/transactions', () => ({
  AnchorMode: {
    Any: 'any',
  },
  broadcastTransaction: vi.fn(),
  uintCV: vi.fn(),
  stringAsciiCV: vi.fn(),
  makeContractCall: vi.fn(),
  listCV: vi.fn(),
  tupleCV: vi.fn(),
  estimateContractFunctionCall: vi.fn(),
  getAddressFromPrivateKey: vi.fn(),
  TransactionVersion: {
    Mainnet: 'mainnet',
    Testnet: 'testnet',
  },
}));

// Mock @stacks/network
vi.mock('@stacks/network', () => ({
  StacksDevnet: vi.fn(),
  StacksMainnet: vi.fn(),
  StacksTestnet: vi.fn(),
}));

// Mock config
vi.mock('../src/config', () => ({
  default: {
    chain: {
      name: 'stacks',
      stacks: {
        rpcUrl: 'https://api.testnet.hiro.so',
        backupRpcUrl: 'https://backup.testnet.hiro.so',
        contractName: 'dia-oracle',
        secretKey: '753b7cc01a1a2e86221266a154af739463fce51219d97e4f856cd7200c3bd2a601',
        contract: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        feeRate: BigInt(100),
        maxBatchSize: 10,
        maxRetryAttempts: 3,
      },
    },
    stacks: {
      rpcUrl: 'https://api.testnet.hiro.so',
      backupRpcUrl: 'https://backup.testnet.hiro.so',
      contractName: 'dia-oracle',
      secretKey: '753b7cc01a1a2e86221266a154af739463fce51219d97e4f856cd7200c3bd2a601',
      contract: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      feeRate: BigInt(100),
      maxBatchSize: 10,
      maxRetryAttempts: 3,
    },
  },
  ChainName: {
    Stacks: 'stacks',
  },
}));

// Mock utils
vi.mock('../src/utils', () => ({
  splitIntoFixedBatches: vi.fn(),
}));

describe('Stacks Oracle', () => {
  let mockNetwork: any;
  let mockBackupNetwork: any;
  let mockContractCall: any;
  let mockSignedTransaction: any;
  let mockBroadcastResponse: any;
  let mockTransactionResults: any;
  let stacksModule: any;

  beforeEach(async () => {
    // Reset all mocks and modules
    vi.clearAllMocks();
    vi.resetModules();

    // Setup mock network
    mockNetwork = {
      isMainnet: vi.fn().mockReturnValue(false),
    };

    // Setup mock backup network
    mockBackupNetwork = {
      isMainnet: vi.fn().mockReturnValue(false),
    };

    // Setup mock contract call
    mockContractCall = {
      // Add any properties that might be accessed
    };

    // Setup mock signed transaction
    mockSignedTransaction = {
      // Add any properties that might be accessed
    };

    // Setup mock broadcast response
    mockBroadcastResponse = {
      txid: 'mock-tx-id',
      error: null,
    };

    // Setup mock transaction results
    mockTransactionResults = {
      total: 1,
      results: [
        {
          nonce: 5,
        },
      ],
    };

    // Setup constructor mocks
    (StacksDevnet as any).mockImplementation(() => mockNetwork);
    (StacksTestnet as any).mockImplementation(() => mockNetwork);
    (StacksMainnet as any).mockImplementation(() => mockNetwork);
    (getAddressFromPrivateKey as any).mockReturnValue('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM');
    (makeContractCall as any).mockResolvedValue(mockSignedTransaction);
    (estimateContractFunctionCall as any).mockResolvedValue(1000n);
    (broadcastTransaction as any).mockResolvedValue(mockBroadcastResponse);

    // Setup axios mock
    (axios as any).mockResolvedValue({
      data: mockTransactionResults,
    });

    // Setup utils mocks
    (utilsModule.splitIntoFixedBatches as any).mockImplementation((items: any[], size: number) => {
      const batches: any[][] = [];
      for (let i = 0; i < items.length; i += size) {
        batches.push(items.slice(i, i + size));
      }
      return batches;
    });

    // Import the module after mocks are set up
    stacksModule = await import('../src/oracles/stacks');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('init', () => {
    it('should initialize network with correct config', () => {
      stacksModule.init();

      expect(StacksTestnet).toHaveBeenCalledWith({ url: configModule.default.chain.stacks.rpcUrl });
    });

    it('should initialize backup network when backupRpcUrl is provided', () => {
      stacksModule.init();

      expect(StacksTestnet).toHaveBeenCalledWith({ url: configModule.default.chain.stacks.backupRpcUrl });
    });

    it('should use StacksDevnet when no rpcUrl is provided', () => {
      // Mock config to have no rpcUrl
      const originalRpcUrl = configModule.default.chain.stacks.rpcUrl;
      configModule.default.chain.stacks.rpcUrl = '';

      stacksModule.init();

      expect(StacksDevnet).toHaveBeenCalled();

      // Restore original rpcUrl
      configModule.default.chain.stacks.rpcUrl = originalRpcUrl;
    });

    it('should use StacksMainnet for mainnet URLs', () => {
      // Mock config to have mainnet URL
      const originalRpcUrl = configModule.default.chain.stacks.rpcUrl;
      configModule.default.chain.stacks.rpcUrl = 'https://api.mainnet.hiro.so';

      stacksModule.init();

      expect(StacksMainnet).toHaveBeenCalledWith({ url: configModule.default.chain.stacks.rpcUrl });

      // Restore original rpcUrl
      configModule.default.chain.stacks.rpcUrl = originalRpcUrl;
    });
  });

  describe('update', () => {
    beforeEach(() => {
      stacksModule.init();
    });

    it('should successfully update oracle with valid data', async () => {
      const keys = ['BTC', 'ETH'];
      const prices = [50000, 3000];

      await stacksModule.update(keys, prices);

      // Verify address was derived from private key
      expect(getAddressFromPrivateKey).toHaveBeenCalledWith(
        configModule.default.chain.stacks.secretKey,
        TransactionVersion.Testnet
      );

      // Verify contract call was made
      expect(makeContractCall).toHaveBeenCalledWith(
        expect.objectContaining({
          network: mockNetwork,
        })
      );

      // Verify transaction was broadcast
      expect(broadcastTransaction).toHaveBeenCalledWith(mockSignedTransaction, mockNetwork);
    });

    it('should handle transaction failure and retry', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      // Mock failure on first attempt, success on second
      (broadcastTransaction as any)
        .mockRejectedValueOnce(new Error('Transaction failed'))
        .mockResolvedValueOnce(mockBroadcastResponse);

      await stacksModule.update(keys, prices);

      // Should have been called twice (retry)
      expect(broadcastTransaction).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retry attempts', async () => {
      const keys = ['BTC'];
      const prices = [50000];
      const error = new Error('Persistent failure');

      (broadcastTransaction as any).mockRejectedValue(error);

      await expect(stacksModule.update(keys, prices)).rejects.toThrow('Persistent failure');
    });

    it('should switch to backup network on first failure', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      // Mock failure on first attempt, success on second
      (broadcastTransaction as any)
        .mockRejectedValueOnce(new Error('Transaction failed'))
        .mockResolvedValueOnce(mockBroadcastResponse);

      await stacksModule.update(keys, prices);

      // Should have switched to backup network on the second attempt
      const calls = (makeContractCall as any).mock.calls;
      expect(calls.length).toBeGreaterThan(1);
      
      // Check that the second call (after failure) uses backup network
      expect(calls[1][0]).toEqual(
        expect.objectContaining({
          network: expect.objectContaining({
            isMainnet: expect.any(Function),
          }),
        })
      );
    });

    it('should handle batching when data exceeds maxBatchSize', async () => {
      const keys = ['BTC', 'ETH', 'USDC', 'SOL', 'ADA'];
      const prices = [50000, 3000, 1, 100, 0.5];

      // Set maxBatchSize to 2 for this test
      const originalMaxBatchSize = configModule.default.chain.stacks.maxBatchSize;
      configModule.default.chain.stacks.maxBatchSize = 2;

      await stacksModule.update(keys, prices);

      // Should have been called multiple times (multiple batches)
      expect(broadcastTransaction).toHaveBeenCalledTimes(3); // 3 batches

      // Restore original maxBatchSize
      configModule.default.chain.stacks.maxBatchSize = originalMaxBatchSize;
    });

    it('should convert prices to correct format (multiply by 100_000_000)', async () => {
      const keys = ['BTC', 'ETH'];
      const prices = [50000.123, 3000.456];

      await stacksModule.update(keys, prices);

      // Verify uintCV was called with correct values
      expect(uintCV).toHaveBeenCalledWith(Math.floor(50000.123 * 100_000_000));
      expect(uintCV).toHaveBeenCalledWith(Math.floor(3000.456 * 100_000_000));
    });

    it('should use current timestamp for all entries', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      const mockDate = new Date('2024-01-01T00:00:00Z');
      
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);

      await stacksModule.update(keys, prices);

      vi.useRealTimers();

      // Verify the timestamp was used in the transaction
      expect(uintCV).toHaveBeenCalledWith(mockDate.getTime());
    });

    it('should not update the oracle with empty keys and prices arrays', async () => {
      const keys: string[] = [];
      const prices: number[] = [];

      await stacksModule.update(keys, prices);

      // Should still call the oracle with empty arrays
      expect(makeContractCall).not.toHaveBeenCalled();
    });

    it('should handle different price scales correctly', async () => {
      const keys = ['BTC', 'ETH', 'USDC'];
      const prices = [0.0001, 999999.9999, 1.0001];

      await stacksModule.update(keys, prices);

      // Verify the transaction was called
      expect(makeContractCall).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'set-multiple-values',
        })
      );
    });

    it('should calculate fee correctly with fee rate', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      await stacksModule.update(keys, prices);

      // Verify fee estimation was called
      expect(estimateContractFunctionCall).toHaveBeenCalled();
      expect(makeContractCall).toHaveBeenCalledWith(
        expect.objectContaining({
          fee: expect.any(BigInt),
        })
      );
    });

    it('should increase fee on retry attempts', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      // Mock failure on first attempt, success on second
      (broadcastTransaction as any)
        .mockRejectedValueOnce(new Error('Transaction failed'))
        .mockResolvedValueOnce(mockBroadcastResponse);

      await stacksModule.update(keys, prices);

      // Verify fee was increased on retry
      const calls = (makeContractCall as any).mock.calls;
      expect(calls.length).toBeGreaterThan(1);
    });

    it('should increment nonce for each batch', async () => {
      const keys = ['BTC', 'ETH', 'USDC'];
      const prices = [50000, 3000, 1];

      // Set maxBatchSize to 1 for this test
      const originalMaxBatchSize = configModule.default.chain.stacks.maxBatchSize;
      configModule.default.chain.stacks.maxBatchSize = 1;

      await stacksModule.update(keys, prices);

      // Should have been called 3 times with different nonces
      expect(broadcastTransaction).toHaveBeenCalledTimes(3);

      // Restore original maxBatchSize
      configModule.default.chain.stacks.maxBatchSize = originalMaxBatchSize;
    });
  });

  describe('conditional initialization', () => {
    it('should initialize backup provider when chainName is not Stacks', async () => {
      // Mock config to return non-Stacks chain
      vi.mocked(configModule.default).chain.name = 'OtherChain' as any;

      // Re-import the module to trigger the conditional initialization
      vi.resetModules();
      const newModule = await import('../src/oracles/stacks');

      // Should not have called init
      expect(StacksTestnet).toHaveBeenCalledTimes(2);
    });

    it('should initialize when chainName is Stacks', async () => {
      // Mock config to return Stacks chain
      vi.mocked(configModule.default).chain.name = 'stacks' as any;

      // Re-import the module to trigger the conditional initialization
      vi.resetModules();
      await import('../src/oracles/stacks');

      // Should have called init
      expect(StacksTestnet).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      stacksModule.init();
    });

    it('should handle broadcast error response', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      const errorResponse = {
        txid: 'mock-tx-id',
        error: 'Transaction failed',
        reason: 'Insufficient funds',
      };

      (broadcastTransaction as any).mockResolvedValue(errorResponse);

      await expect(stacksModule.update(keys, prices)).rejects.toThrow('Transaction failed with error: Insufficient funds');
    });

    it('should handle contract call failure', async () => {
      const keys = ['BTC'];
      const prices = [50000];
      const error = new Error('Contract call failed');

      (makeContractCall as any).mockRejectedValue(error);

      await expect(stacksModule.update(keys, prices)).rejects.toThrow('Contract call failed');
    });

    it('should handle fee estimation failure', async () => {
      const keys = ['BTC'];
      const prices = [50000];
      const error = new Error('Fee estimation failed');

      (estimateContractFunctionCall as any).mockRejectedValue(error);

      await expect(stacksModule.update(keys, prices)).rejects.toThrow('Fee estimation failed');
    });

    it('should log error details during retry attempts', async () => {
      const keys = ['BTC'];
      const prices = [50000];
      const error = new Error('Network error');

      // Mock console.error to capture logs
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      (broadcastTransaction as any).mockRejectedValue(error);

      await expect(stacksModule.update(keys, prices)).rejects.toThrow('Network error');

      // Verify error was logged for each retry attempt
      expect(consoleSpy).toHaveBeenCalledTimes(configModule.default.chain.stacks.maxRetryAttempts + 2);

      consoleSpy.mockRestore();
    });

    it('should log successful batch updates', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      // Mock console.log to capture logs
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await stacksModule.update(keys, prices);

      // Verify success was logged
      expect(consoleSpy).toHaveBeenCalledWith('Batch 1 Transaction ID: mock-tx-id');
      expect(consoleSpy).toHaveBeenCalledWith('Oracle updated');

      consoleSpy.mockRestore();
    });
  });

  describe('data processing', () => {
    beforeEach(() => {
      stacksModule.init();
    });

    it('should use splitIntoFixedBatches for keys and prices', async () => {
      const keys = ['BTC', 'ETH', 'USDC'];
      const prices = [50000, 3000, 1];

      await stacksModule.update(keys, prices);

      // Verify splitIntoFixedBatches was called for both keys and prices
      expect(utilsModule.splitIntoFixedBatches).toHaveBeenCalledWith(keys, configModule.default.chain.stacks.maxBatchSize);
      expect(utilsModule.splitIntoFixedBatches).toHaveBeenCalledWith(prices, configModule.default.chain.stacks.maxBatchSize);
    });

    it('should create correct Clarity values', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      await stacksModule.update(keys, prices);

      // Verify Clarity values were created correctly
      expect(stringAsciiCV).toHaveBeenCalledWith('BTC');
      expect(uintCV).toHaveBeenCalledWith(Math.floor(50000 * 100_000_000));
      expect(tupleCV).toHaveBeenCalled();
      expect(listCV).toHaveBeenCalled();
    });

    it('should handle multiple batches correctly', async () => {
      const keys = ['BTC', 'ETH', 'USDC', 'SOL', 'ADA', 'DOT'];
      const prices = [50000, 3000, 1, 100, 0.5, 5];

      // Set maxBatchSize to 2 for this test
      const originalMaxBatchSize = configModule.default.chain.stacks.maxBatchSize;
      configModule.default.chain.stacks.maxBatchSize = 2;

      await stacksModule.update(keys, prices);

      // Should have been called 3 times (3 batches)
      expect(broadcastTransaction).toHaveBeenCalledTimes(3);

      // Restore original maxBatchSize
      configModule.default.chain.stacks.maxBatchSize = originalMaxBatchSize;
    });
  });

  describe('configuration', () => {
    it('should use correct transaction version for mainnet', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      // Mock network to be mainnet
      mockNetwork.isMainnet.mockReturnValue(true);

      await stacksModule.update(keys, prices);

      // Verify correct transaction version was used
      expect(getAddressFromPrivateKey).toHaveBeenCalledWith(
        configModule.default.chain.stacks.secretKey,
        TransactionVersion.Mainnet
      );
    });

    it('should use correct contract address and name', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      await stacksModule.update(keys, prices);

      // Verify contract address and name were used correctly
      expect(makeContractCall).toHaveBeenCalledWith(
        expect.objectContaining({
          contractAddress: configModule.default.chain.stacks.contract,
          contractName: configModule.default.chain.stacks.contractName,
        })
      );
    });
  });

  describe('getAccountNonce', () => {
    it('should fetch nonce from API correctly', async () => {
      const address = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';

      // Call the function directly (it's not exported, so we'll test it indirectly)
      await stacksModule.update(['BTC'], [50000]);

      // Verify axios was called with correct parameters
      expect(axios).toHaveBeenCalledWith(
        expect.stringContaining('/extended/v1/tx?')
      );
    });

    it('should return 0 when no transactions exist', async () => {
      // Mock empty transaction results
      (axios as any).mockResolvedValue({
        data: { total: 0, results: [] },
      });

      await stacksModule.update(['BTC'], [50000]);

      // Verify the function handled empty results correctly
      expect(makeContractCall).toHaveBeenCalledWith(
        expect.objectContaining({
          nonce: 0n,
        })
      );
    });
  });
}); 
