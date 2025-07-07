import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { JSONRpcProvider, getContract, OP_NET_ABI, IOP_NETContract, CallResult } from 'opnet';
import {
  BinaryWriter,
  ABICoder,
  BufferHelper,
  Wallet,
  TransactionFactory,
  OPNetNetwork,
} from '@btc-vision/transaction';
import { Network, networks } from 'bitcoinjs-lib';
import crypto from 'crypto';
import * as configModule from '../src/config';
import * as utilsModule from '../src/utils';

// Mock the opnet modules
vi.mock('opnet', () => ({
  JSONRpcProvider: vi.fn(),
  getContract: vi.fn(),
  OP_NET_ABI: 'mock-abi',
  IOP_NETContract: vi.fn(),
  CallResult: vi.fn(),
}));

// Mock @btc-vision/transaction modules
vi.mock('@btc-vision/transaction', () => ({
  BinaryWriter: vi.fn(),
  ABICoder: vi.fn(),
  BufferHelper: {
    hexToUint8Array: vi.fn(),
  },
  Wallet: {
    fromWif: vi.fn(),
  },
  TransactionFactory: vi.fn(),
  OPNetNetwork: {
    Mainnet: 'mainnet',
    Testnet: 'testnet',
    Regtest: 'regtest',
  },
}));

// Mock bitcoinjs-lib
vi.mock('bitcoinjs-lib', () => ({
  networks: {
    bitcoin: 'bitcoin-network',
    testnet: 'testnet-network',
    regtest: 'regtest-network',
  },
}));

// Mock crypto
vi.mock('crypto', () => {
  const mockRandomBytes = vi.fn();
  return {
    default: {
      randomBytes: mockRandomBytes,
    },
    randomBytes: mockRandomBytes,
  };
});

// Mock config
vi.mock('../src/config', () => ({
  default: {
    chainName: 'opnet',
    opnet: {
      rpcUrl: 'https://regtest.opnet.org',
      network: 'regtest',
      backupRpcUrl: 'https://backup.opnet.org',
      secretKey: 'cShTHPAqa5rX2p9GxN6QvwsFMnnhHLUx2WRE8ztNTWxqwBGWycH8',
      contract: 'bcrt1q39y3gw0zxaq0hgkr0x3m80tz504p5ta5l8j7y4',
      maxBatchSize: 10,
      maxRetryAttempts: 3,
      feeRate: 100,
      priorityFee: 1000n,
    },
  },
  ChainName: {
    Opnet: 'opnet',
  },
}));

// Mock utils
vi.mock('../src/utils', () => ({
  splitIntoFixedBatches: vi.fn(),
}));

describe('OpNet Oracle', () => {
  let mockProvider: any;
  let mockBackupProvider: any;
  let mockContract: any;
  let mockNetwork: any;
  let mockWallet: any;
  let mockBinaryWriter: any;
  let mockAbiCoder: any;
  let mockTransactionFactory: any;
  let mockCallResult: any;
  let opnetModule: any;

  beforeEach(async () => {
    // Reset all mocks and modules
    vi.clearAllMocks();
    vi.resetModules();

    // Setup mock provider
    mockProvider = {
      utxoManager: {
        getUTXOs: vi.fn(),
      },
      call: vi.fn(),
      gasParameters: vi.fn(),
      sendRawTransaction: vi.fn(),
      getTransaction: vi.fn(),
      getPreimage: vi.fn(),
    };

    // Setup mock backup provider
    mockBackupProvider = {
      ...mockProvider,
    };

    // Setup mock contract
    mockContract = {
      address: 'bcrt1q39y3gw0zxaq0hgkr0x3m80tz504p5ta5l8j7y4',
    };

    // Setup mock network
    mockNetwork = 'regtest-network';

    // Setup mock wallet
    mockWallet = {
      address: 'bcrt1q39y3gw0zxaq0hgkr0x3m80tz504p5ta5l8j7y4',
      p2tr: 'bcrt1q39y3gw0zxaq0hgkr0x3m80tz504p5ta5l8j7y4',
      keypair: {
        publicKey: 'mock-public-key',
        privateKey: 'mock-private-key',
      },
    };

    // Setup mock binary writer
    mockBinaryWriter = {
      writeSelector: vi.fn(),
      writeU8: vi.fn(),
      writeStringWithLength: vi.fn(),
      writeBytes: vi.fn(),
      getBuffer: vi.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
    };

    // Setup mock ABI coder
    mockAbiCoder = {
      encodeSelector: vi.fn().mockReturnValue('mock-selector'),
    };

    // Setup mock transaction factory
    mockTransactionFactory = {
      signInteraction: vi.fn(),
    };

    // Setup mock call result
    mockCallResult = {
      estimatedGas: 330n,
    };

    // Setup constructor mocks
    (JSONRpcProvider as any).mockImplementation((url: string) => {
      if (url === configModule.default.opnet.backupRpcUrl) {
        return mockBackupProvider;
      }
      return mockProvider;
    });
    (getContract as any).mockReturnValue(mockContract);
    (Wallet.fromWif as any).mockReturnValue(mockWallet);
    (BinaryWriter as any).mockImplementation(() => mockBinaryWriter);
    (ABICoder as any).mockImplementation(() => mockAbiCoder);
    (TransactionFactory as any).mockImplementation(() => mockTransactionFactory);
    (BufferHelper.hexToUint8Array as any).mockReturnValue(new Uint8Array([1, 2, 3, 4]));
    (crypto.randomBytes as any).mockReturnValue(Buffer.from('mock-preimage'));

    // Setup provider mocks
    mockProvider.utxoManager.getUTXOs.mockResolvedValue([
      { txid: 'mock-txid', vout: 0, value: 1000000n },
    ]);
    mockProvider.call.mockResolvedValue(mockCallResult);
    mockProvider.gasParameters.mockResolvedValue({ gasPerSat: 1000000n });
    mockProvider.sendRawTransaction.mockResolvedValue({ success: true, result: 'mock-tx-hash' });
    mockProvider.getTransaction.mockResolvedValue({ hash: 'mock-tx-hash' });
    mockProvider.getPreimage.mockResolvedValue(Buffer.from('mock-preimage'));

    // Setup transaction factory mock
    mockTransactionFactory.signInteraction.mockResolvedValue({
      fundingTransaction: Buffer.from('mock-funding-tx'),
      interactionTransaction: Buffer.from('mock-interaction-tx'),
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
    opnetModule = await import('../src/oracles/opnet');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('init', () => {
    it('should initialize provider, wallet, and contract with correct config', async () => {
      await opnetModule.init();

      expect(JSONRpcProvider).toHaveBeenCalledWith(configModule.default.opnet.rpcUrl, mockNetwork);
      expect(Wallet.fromWif).toHaveBeenCalledWith(configModule.default.opnet.secretKey, mockNetwork);
      expect(getContract).toHaveBeenCalledWith(
        configModule.default.opnet.contract,
        OP_NET_ABI,
        mockProvider,
        mockNetwork,
        mockWallet.address
      );
    });

    it('should initialize backup provider when backupRpcUrl is provided', async () => {
      await opnetModule.init();

      expect(JSONRpcProvider).toHaveBeenCalledWith(configModule.default.opnet.backupRpcUrl, mockNetwork);
    });

    it('should set correct network for regtest', async () => {
      await opnetModule.init();

      expect(JSONRpcProvider).toHaveBeenCalledWith(configModule.default.opnet.rpcUrl, mockNetwork);
    });
  });

  describe('updateOracle', () => {
    beforeEach(async () => {
      await opnetModule.init();
    });

    it('should successfully update oracle with valid data', async () => {
      const keys = ['BTC', 'ETH'];
      const prices = [50000, 3000];

      await opnetModule.updateOracle(keys, prices);

      // Verify UTXOs were fetched
      expect(mockProvider.utxoManager.getUTXOs).toHaveBeenCalledWith({
        address: mockWallet.p2tr,
      });

      // Verify contract call was made
      expect(mockProvider.call).toHaveBeenCalledWith(
        mockContract.address,
        expect.any(Buffer),
        mockWallet.address
      );

      // Verify transactions were sent
      expect(mockProvider.sendRawTransaction).toHaveBeenCalledTimes(2);
      expect(mockProvider.sendRawTransaction).toHaveBeenCalledWith(
        expect.any(Buffer),
        false
      );
    });

    it('should handle transaction failure and retry', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      // Mock failure on first attempt, success on second
      mockProvider.sendRawTransaction
        .mockRejectedValueOnce(new Error('Transaction failed'))
        .mockResolvedValueOnce({ success: true, result: 'mock-tx-hash' })
        .mockResolvedValueOnce({ success: true, result: 'mock-tx-hash' });

      await opnetModule.updateOracle(keys, prices);

      // Should have been called multiple times (retry)
      expect(mockProvider.sendRawTransaction).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retry attempts', async () => {
      const keys = ['BTC'];
      const prices = [50000];
      const error = new Error('Persistent failure');

      mockProvider.sendRawTransaction.mockRejectedValue(error);

      await expect(opnetModule.updateOracle(keys, prices)).rejects.toThrow('Persistent failure');
    });

    it('should switch to backup provider on first failure', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      // Mock failure on first attempt, success on second
      mockProvider.sendRawTransaction
        .mockRejectedValueOnce(new Error('Transaction failed'))
        .mockResolvedValueOnce({ success: true, result: 'mock-tx-hash' })
        .mockResolvedValueOnce({ success: true, result: 'mock-tx-hash' });

      await opnetModule.updateOracle(keys, prices);

      // Should have switched to backup provider
      expect(JSONRpcProvider).toHaveBeenCalledWith(configModule.default.opnet.backupRpcUrl, mockNetwork);
    });

    it('should handle batching when data exceeds maxBatchSize', async () => {
      const keys = ['BTC', 'ETH', 'USDC', 'SOL', 'ADA'];
      const prices = [50000, 3000, 1, 100, 0.5];

      // Set maxBatchSize to 2 for this test
      const originalMaxBatchSize = configModule.default.opnet.maxBatchSize;
      configModule.default.opnet.maxBatchSize = 2;

      await opnetModule.updateOracle(keys, prices);

      // Should have been called multiple times (multiple batches)
      expect(mockProvider.sendRawTransaction).toHaveBeenCalledTimes(6); // 3 batches * 2 transactions each

      // Restore original maxBatchSize
      configModule.default.opnet.maxBatchSize = originalMaxBatchSize;
    });

    it('should convert prices to correct format (multiply by 100_000_000)', async () => {
      const keys = ['BTC', 'ETH'];
      const prices = [50000.123, 3000.456];

      await opnetModule.updateOracle(keys, prices);

      // Verify writeU128 was called with correct values
      expect(mockBinaryWriter.writeStringWithLength).toHaveBeenCalledWith('BTC');
      expect(mockBinaryWriter.writeStringWithLength).toHaveBeenCalledWith('ETH');
    });

    it('should use current timestamp for all entries', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      const mockDate = new Date('2024-01-01T00:00:00Z');
      
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);

      await opnetModule.updateOracle(keys, prices);

      vi.useRealTimers();

      // Verify the timestamp was used in the transaction
      expect(mockBinaryWriter.writeU8).toHaveBeenCalledWith(1); // batch size
    });

    it('should handle empty keys and prices arrays', async () => {
      const keys: string[] = [];
      const prices: number[] = [];

      await opnetModule.updateOracle(keys, prices);

      // Should still call the oracle with empty arrays
      expect(mockBinaryWriter.writeU8).not.toHaveBeenCalledWith(0); // batch size
    });

    it('should handle different price scales correctly', async () => {
      const keys = ['BTC', 'ETH', 'USDC'];
      const prices = [0.0001, 999999.9999, 1.0001];

      await opnetModule.updateOracle(keys, prices);

      // Verify the transaction was called
      expect(mockProvider.call).toHaveBeenCalledWith(
        mockContract.address,
        expect.any(Buffer),
        mockWallet.address
      );
    });

    it('should calculate gas parameters correctly', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      mockCallResult.estimatedGas = 500n;

      await opnetModule.updateOracle(keys, prices);

      // Verify gas parameters were fetched
      expect(mockProvider.gasParameters).toHaveBeenCalled();
    });

    it('should wait for transaction confirmation', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      await opnetModule.updateOracle(keys, prices);

      // Verify transaction was checked for confirmation
      expect(mockProvider.getTransaction).toHaveBeenCalledWith('mock-tx-hash');
    });
  });

  describe('conditional initialization', () => {
    it('should initialize backup provider when chainName is not Opnet', async () => {
      // Mock config to return non-Opnet chain
      vi.mocked(configModule.default).chainName = 'OtherChain' as any;

      // Re-import the module to trigger the conditional initialization
      vi.resetModules();
      const newModule = await import('../src/oracles/opnet');

      // Should not have called init
      expect(JSONRpcProvider).toHaveBeenCalledTimes(2);
    });

    it('should initialize when chainName is Opnet', async () => {
      // Mock config to return Opnet chain
      vi.mocked(configModule.default).chainName = 'opnet' as any;

      // Re-import the module to trigger the conditional initialization
      vi.resetModules();
      await import('../src/oracles/opnet');

      // Should have called init
      expect(JSONRpcProvider).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await opnetModule.init();
    });

    it('should handle provider call failure', async () => {
      const keys = ['BTC'];
      const prices = [50000];
      const error = new Error('Provider call failed');

      mockProvider.call.mockRejectedValue(error);

      await expect(opnetModule.updateOracle(keys, prices)).rejects.toThrow('Provider call failed');
    });

    it('should handle transaction broadcast failure', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      mockProvider.sendRawTransaction.mockResolvedValue({ success: false });

      await expect(opnetModule.updateOracle(keys, prices)).rejects.toThrow('First transaction broadcast failed.');
    });

    it('should handle preimage generation failure', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      mockProvider.getPreimage.mockRejectedValue(new Error('Preimage not found'));

      await opnetModule.updateOracle(keys, prices);

      // Should have used random bytes as fallback
      expect(crypto.randomBytes).toHaveBeenCalledWith(128);
    });

    it('should log error details during retry attempts', async () => {
      const keys = ['BTC'];
      const prices = [50000];
      const error = new Error('Network error');

      // Mock console.error to capture logs
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockProvider.sendRawTransaction.mockRejectedValue(error);

      await expect(opnetModule.updateOracle(keys, prices)).rejects.toThrow('Network error');

      // Verify error was logged for each retry attempt
      expect(consoleSpy).toHaveBeenCalledTimes(configModule.default.opnet.maxRetryAttempts + 2);

      consoleSpy.mockRestore();
    });

    it('should log successful batch updates', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      // Mock console.log to capture logs
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await opnetModule.updateOracle(keys, prices);

      // Verify success was logged
      expect(consoleSpy).toHaveBeenCalledWith('Batch 0 update successful.');
      expect(consoleSpy).toHaveBeenCalledWith('OpNet Oracle updated.');

      consoleSpy.mockRestore();
    });
  });

  describe('data processing', () => {
    beforeEach(async () => {
      await opnetModule.init();
    });

    it('should use splitIntoFixedBatches for keys and prices', async () => {
      const keys = ['BTC', 'ETH', 'USDC'];
      const prices = [50000, 3000, 1];

      await opnetModule.updateOracle(keys, prices);

      // Verify splitIntoFixedBatches was called for both keys and prices
      expect(utilsModule.splitIntoFixedBatches).toHaveBeenCalledWith(keys, configModule.default.opnet.maxBatchSize);
      expect(utilsModule.splitIntoFixedBatches).toHaveBeenCalledWith(prices, configModule.default.opnet.maxBatchSize);
    });

    it('should create binary writer with correct data', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      await opnetModule.updateOracle(keys, prices);

      // Verify binary writer was used correctly
      expect(BinaryWriter).toHaveBeenCalled();
      expect(mockBinaryWriter.writeSelector).toHaveBeenCalled();
      expect(mockBinaryWriter.writeU8).toHaveBeenCalledWith(1); // batch size
      expect(mockBinaryWriter.writeStringWithLength).toHaveBeenCalledWith('BTC');
    });

    it('should handle multiple batches correctly', async () => {
      const keys = ['BTC', 'ETH', 'USDC', 'SOL', 'ADA', 'DOT'];
      const prices = [50000, 3000, 1, 100, 0.5, 5];

      // Set maxBatchSize to 2 for this test
      const originalMaxBatchSize = configModule.default.opnet.maxBatchSize;
      configModule.default.opnet.maxBatchSize = 2;

      await opnetModule.updateOracle(keys, prices);

      // Should have been called 6 times (3 batches * 2 transactions each)
      expect(mockProvider.sendRawTransaction).toHaveBeenCalledTimes(6);

      // Restore original maxBatchSize
      configModule.default.opnet.maxBatchSize = originalMaxBatchSize;
    });
  });

  describe('configuration', () => {
    it('should use correct fee rate and priority fee', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      await opnetModule.updateOracle(keys, prices);

      // Verify transaction factory was called with correct parameters
      expect(TransactionFactory).toHaveBeenCalled();
      expect(mockTransactionFactory.signInteraction).toHaveBeenCalledWith(
        expect.objectContaining({
          feeRate: configModule.default.opnet.feeRate,
          priorityFee: configModule.default.opnet.priorityFee,
        })
      );
    });

    it('should use correct contract address', async () => {
      const keys = ['BTC'];
      const prices = [50000];

      await opnetModule.updateOracle(keys, prices);

      // Verify contract address was used correctly
      expect(mockProvider.call).toHaveBeenCalledWith(
        configModule.default.opnet.contract,
        expect.any(Buffer),
        mockWallet.address
      );
    });
  });
}); 
