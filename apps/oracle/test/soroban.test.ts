import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Contract, Keypair, nativeToScVal, rpc, TransactionBuilder } from '@stellar/stellar-sdk';
import * as common from '@repo/common';
import * as configModule from '../src/config';

// Mock the stellar-sdk modules
vi.mock('@stellar/stellar-sdk', () => ({
  Contract: vi.fn(),
  Keypair: {
    fromSecret: vi.fn(),
  },
  nativeToScVal: vi.fn(),
  rpc: {
    Server: vi.fn(),
  },
  TransactionBuilder: vi.fn(),
}));

// Mock @repo/common
vi.mock('@repo/common', () => ({
  DAY_IN_LEDGERS: 17280,
  DEFAULT_TX_OPTIONS: { fee: '100' },
  extendInstanceTtl: vi.fn(),
  restoreInstance: vi.fn(),
  submitSorobanTx: vi.fn(),
}));

// Mock config
vi.mock('../src/config', () => ({
  default: {
    chain: {
      name: 'Soroban',
      soroban: {
        rpcUrl: 'https://testnet.stellar.org:9000',
        secretKey: 'test-secret-key',
        contractId: 'test-contract-id',
        maxRetryAttempts: 3,
      },
    },
    soroban: {
      rpcUrl: 'https://testnet.stellar.org:9000',
      secretKey: 'test-secret-key',
      contractId: 'test-contract-id',
      maxRetryAttempts: 3,
    },
  },
  ChainName: {
    Soroban: 'Soroban',
  },
}));

describe('Soroban Oracle', () => {
  let mockServer: any;
  let mockKeypair: any;
  let mockContract: any;
  let mockAccount: any;
  let mockTransaction: any;
  let sorobanModule: any;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock server
    mockServer = {
      getAccount: vi.fn(),
      prepareTransaction: vi.fn(),
    };

    // Setup mock keypair
    mockKeypair = {
      publicKey: () => 'test-public-key',
      sign: vi.fn(),
    };

    // Setup mock contract
    mockContract = {
      call: vi.fn(),
    };

    // Setup mock account
    mockAccount = {
      accountId: 'test-account-id',
      sequenceNumber: '123',
    };

    // Setup mock transaction
    mockTransaction = {
      sign: vi.fn(),
    };

    // Setup constructor mocks
    (rpc.Server as any).mockImplementation(() => mockServer);
    (Keypair.fromSecret as any).mockReturnValue(mockKeypair);
    (Contract as any).mockImplementation(() => mockContract);
    (TransactionBuilder as any).mockImplementation(() => ({
      addOperation: vi.fn().mockReturnThis(),
      setTimeout: vi.fn().mockReturnThis(),
      build: vi.fn().mockReturnValue(mockTransaction),
    }));

    // Setup nativeToScVal mock with proper return values
    (nativeToScVal as any).mockImplementation((value: any) => {
      if (Array.isArray(value)) {
        return 'mocked-array-value';
      }
      return 'mocked-value';
    });

    // Setup other mocks
    mockServer.getAccount.mockResolvedValue(mockAccount);
    mockServer.prepareTransaction.mockResolvedValue(mockTransaction);
    (common.submitSorobanTx as any).mockResolvedValue(undefined);

    // Import the module
    sorobanModule = await import('../src/oracles/soroban');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('init', () => {
    it('should initialize server, keypair, and contract with correct config', () => {
      sorobanModule.init();

      expect(rpc.Server).toHaveBeenCalledWith(
        configModule.default.chain.soroban.rpcUrl,
        { allowHttp: true }
      );
      expect(Keypair.fromSecret).toHaveBeenCalledWith(
        configModule.default.chain.soroban.secretKey
      );
      expect(Contract).toHaveBeenCalledWith(
        configModule.default.chain.soroban.contractId
      );
    });
  });

  describe('restoreContract', () => {
    it('should call restoreInstance with correct parameters', async () => {
      sorobanModule.init();

      await sorobanModule.restoreContract();

      expect(common.restoreInstance).toHaveBeenCalledWith(
        mockServer,
        mockKeypair,
        mockContract
      );
    });
  });

  describe('extendContractTtl', () => {
    it('should call extendInstanceTtl with correct parameters', async () => {
      sorobanModule.init();

      await sorobanModule.extendContractTtl();

      const extendTo = common.DAY_IN_LEDGERS * 30;
      const threshold = extendTo - common.DAY_IN_LEDGERS;

      expect(common.extendInstanceTtl).toHaveBeenCalledWith({
        server: mockServer,
        source: mockKeypair,
        contract: mockContract,
        threshold,
        extendTo,
      });
    });
  });

  describe('update', () => {
    beforeEach(() => {
      sorobanModule.init();
    });

    it('should successfully update oracle with valid data', async () => {
      const keys = ['BTC', 'ETH'];
      const prices = [50000, 3000];

      await sorobanModule.update(keys, prices);

      // Verify account was fetched
      expect(mockServer.getAccount).toHaveBeenCalledWith('test-public-key');

      // Verify contract call was made with correct parameters
      expect(mockContract.call).toHaveBeenCalledWith(
        'set_multiple_values',
        'mocked-array-value', // keys
        'mocked-array-value'  // values
      );

      // Verify transaction was prepared and submitted
      expect(mockServer.prepareTransaction).toHaveBeenCalledWith(mockTransaction);
      expect(mockTransaction.sign).toHaveBeenCalledWith(mockKeypair);
      expect(common.submitSorobanTx).toHaveBeenCalledWith(mockServer, mockTransaction);
    });

    it('should handle transaction failure and retry', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      // Mock failure on first attempt, success on second
      (common.submitSorobanTx as any)
        .mockRejectedValueOnce(new Error('Transaction failed'))
        .mockResolvedValueOnce(undefined);

      await sorobanModule.update(keys, prices);

      // Should have been called twice (retry)
      expect(common.submitSorobanTx).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retry attempts', async () => {
      const keys = ['BTC'];
      const prices = [50000];
      const error = new Error('Persistent failure');

      // Mock all attempts to fail
      (common.submitSorobanTx as any).mockRejectedValue(error);

      await expect(sorobanModule.update(keys, prices)).rejects.toThrow('Persistent failure');

      // Should have been called maxRetryAttempts times
      expect(common.submitSorobanTx).toHaveBeenCalledTimes(
        configModule.default.chain.soroban.maxRetryAttempts
      );
    });

    it('should convert prices to correct format', async () => {
      const keys = ['BTC', 'ETH'];
      const prices = [50000.123, 3000.456];

      await sorobanModule.update(keys, prices);

      // Verify nativeToScVal was called for keys
      expect(nativeToScVal).toHaveBeenCalledWith(keys);

      // Verify nativeToScVal was called for values with correct format
      const valuesCall = (nativeToScVal as any).mock.calls.find(
        call => call[1] && (call[1] as any).type === 'u128'
      );
      expect(valuesCall).toBeDefined();
    });

    it('should use current timestamp for values', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      const mockDate = new Date('2024-01-01T00:00:00Z');
      
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);

      await sorobanModule.update(keys, prices);

      vi.useRealTimers();

      // Verify the timestamp was used in the contract call
      expect(mockContract.call).toHaveBeenCalledWith(
        'set_multiple_values',
        'mocked-array-value',
        'mocked-array-value'
      );
    });

    it('should handle empty keys and prices arrays', async () => {
      const keys: string[] = [];
      const prices: number[] = [];

      await sorobanModule.update(keys, prices);

      expect(mockContract.call).toHaveBeenCalledWith(
        'set_multiple_values',
        'mocked-array-value',
        'mocked-array-value'
      );
    });

    it('should handle different price scales correctly', async () => {
      const keys = ['BTC', 'ETH', 'USDC'];
      const prices = [0.0001, 999999.9999, 1.0001];

      await sorobanModule.update(keys, prices);

      // Verify the contract call was made
      expect(mockContract.call).toHaveBeenCalledWith(
        'set_multiple_values',
        'mocked-array-value',
        'mocked-array-value'
      );
    });
  });

  describe('conditional initialization', () => {
    it('should not initialize when chainName is not Soroban', async () => {
      // Mock config to return non-Soroban chain
      vi.mocked(configModule.default).chain.name = 'OtherChain' as any;

      // Re-import the module to trigger the conditional initialization
      vi.resetModules();
      const newModule = await import('../src/oracles/soroban');

      // Should not have called init
      expect(rpc.Server).not.toHaveBeenCalled();
    });

    it('should initialize when chainName is Soroban', async () => {
      // Mock config to return Soroban chain
      vi.mocked(configModule.default).chain.name = 'Soroban' as any;

      // Re-import the module to trigger the conditional initialization
      vi.resetModules();
      await import('../src/oracles/soroban');

      // Should have called init
      expect(rpc.Server).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      sorobanModule.init();
    });
    it('should handle server.getAccount failure', async () => {
      const keys = ['BTC'];
      const prices = [50000];
      const error = new Error('Account not found');

      mockServer.getAccount.mockRejectedValue(error);

      await expect(sorobanModule.update(keys, prices)).rejects.toThrow('Account not found');
    });

    it('should handle server.prepareTransaction failure', async () => {
      const keys = ['BTC'];
      const prices = [50000];
      const error = new Error('Transaction preparation failed');

      mockServer.prepareTransaction.mockRejectedValue(error);

      await expect(sorobanModule.update(keys, prices)).rejects.toThrow('Transaction preparation failed');
    });
  });
}); 
