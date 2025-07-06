import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Contract,
  Keypair,
  nativeToScVal,
  scValToNative,
  rpc,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import * as common from '@repo/common';
import type { DrandResponse } from '../src/api';
import * as soroban from '../src/oracles/soroban';

// Mock Stellar SDK
vi.mock('@stellar/stellar-sdk', () => ({
  Contract: vi.fn(),
  Keypair: {
    fromSecret: vi.fn(),
  },
  nativeToScVal: vi.fn(),
  scValToNative: vi.fn(),
  rpc: {
    Server: vi.fn(),
    Api: {
      isSimulationSuccess: vi.fn(),
    },
  },
  TransactionBuilder: vi.fn(),
  xdr: {
    ScVal: {
      scvMap: vi.fn(),
      scvSymbol: vi.fn(),
      scvString: vi.fn(),
    },
    ScMapEntry: vi.fn(),
  },
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
vi.mock('../config', () => ({
  default: {
    chainName: 'SOROBAN',
    soroban: {
      rpcUrl: 'https://testnet.stellar.org',
      secretKey: 'test-secret-key',
      contractId: 'test-contract-id',
      maxRetryAttempts: 3,
    },
  },
  ChainName: {
    SOROBAN: 'SOROBAN',
  },
}));

describe('soroban', () => {
  let mockServer: any;
  let mockKeypair: any;
  let mockContract: any;
  let mockAccount: any;
  let mockTransaction: any;
  let mockSimulation: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock objects
    mockServer = {
      getAccount: vi.fn(),
      simulateTransaction: vi.fn(),
      prepareTransaction: vi.fn(),
    };

    mockKeypair = {
      publicKey: () => 'test-public-key',
    };

    mockContract = {
      call: vi.fn(),
    };

    mockAccount = {
      accountId: 'test-account-id',
      sequenceNumber: '123',
    };

    mockTransaction = {
      sign: vi.fn(),
    };

    mockSimulation = {
      result: {
        retval: '123',
      },
    };

    // Setup mock implementations
    (rpc.Server as any).mockImplementation(() => mockServer);
    (Keypair.fromSecret as any).mockReturnValue(mockKeypair);
    (Contract as any).mockImplementation(() => mockContract);
    (TransactionBuilder as any).mockImplementation(() => ({
      addOperation: vi.fn().mockReturnThis(),
      setTimeout: vi.fn().mockReturnThis(),
      build: vi.fn().mockReturnValue(mockTransaction),
    }));
    (rpc.Api.isSimulationSuccess as any).mockReturnValue(true);
    (scValToNative as any).mockReturnValue('123');
    (nativeToScVal as any).mockReturnValue('scval');
    (xdr.ScVal.scvMap as any).mockReturnValue('scvmap');
    (xdr.ScVal.scvSymbol as any).mockReturnValue('scvsymbol');
    (xdr.ScVal.scvString as any).mockReturnValue('scvstring');
    (xdr.ScMapEntry as any).mockImplementation(() => ({}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('init', () => {
    it('should initialize server, keypair, and contract', () => {
      soroban.init();

      expect(rpc.Server).toHaveBeenCalledWith('https://soroban-testnet.stellar.org:443', { allowHttp: true });
      expect(Keypair.fromSecret).toHaveBeenCalledWith('');
      expect(Contract).toHaveBeenCalledWith('');
    });
  });

  describe('getServer', () => {
    it('should return the server instance', () => {
      soroban.init();
      const server = soroban.getServer();
      expect(server).toBe(mockServer);
    });
  });

  describe('restoreOracle', () => {
    it('should call restoreInstance with correct parameters', async () => {
      soroban.init();
      await soroban.restoreOracle();

      expect(common.restoreInstance).toHaveBeenCalledWith(mockServer, mockKeypair, mockContract);
    });
  });

  describe('extendOracleTtl', () => {
    it('should call extendInstanceTtl with correct parameters', async () => {
      soroban.init();
      await soroban.extendOracleTtl();

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

  describe('getLastRound', () => {
    it('should return the last round number successfully', async () => {
      soroban.init();
      mockServer.getAccount.mockResolvedValue(mockAccount);
      mockServer.simulateTransaction.mockResolvedValue(mockSimulation);

      const result = await soroban.getLastRound();

      expect(mockServer.getAccount).toHaveBeenCalledWith('test-public-key');
      expect(mockContract.call).toHaveBeenCalledWith('last_round');
      expect(mockServer.simulateTransaction).toHaveBeenCalledWith(mockTransaction);
      expect(rpc.Api.isSimulationSuccess).toHaveBeenCalledWith(mockSimulation);
      expect(scValToNative).toHaveBeenCalledWith('123');
      expect(result).toBe(123);
    });

    it('should throw error when simulation fails', async () => {
      soroban.init();
      mockServer.getAccount.mockResolvedValue(mockAccount);
      (rpc.Api.isSimulationSuccess as any).mockReturnValue(false);
      mockServer.simulateTransaction.mockResolvedValue({ error: 'Simulation failed' });

      await expect(soroban.getLastRound()).rejects.toThrow('Simulation failed: Simulation failed');
    });

    it('should throw error when simulation result is empty', async () => {
      soroban.init();
      mockServer.getAccount.mockResolvedValue(mockAccount);
      mockServer.simulateTransaction.mockResolvedValue({ result: null });

      await expect(soroban.getLastRound()).rejects.toThrow('Empty result in simulateTransaction response');
    });

    it('should throw error when result is invalid number', async () => {
      soroban.init();
      mockServer.getAccount.mockResolvedValue(mockAccount);
      mockServer.simulateTransaction.mockResolvedValue(mockSimulation);
      (scValToNative as any).mockReturnValue('invalid');

      await expect(soroban.getLastRound()).rejects.toThrow('Invalid simulation result: 123');
    });
  });

  describe('updateOracle', () => {
    const mockDrandResponse: DrandResponse = {
      round: 123,
      randomness: 'test-randomness',
      signature: 'test-signature',
      previous_signature: 'test-previous-signature',
    };

    it('should update oracle successfully on first attempt', async () => {
      soroban.init();
      mockServer.getAccount.mockResolvedValue(mockAccount);
      mockServer.prepareTransaction.mockResolvedValue(mockTransaction);
      (common.submitSorobanTx as any).mockResolvedValue(undefined);

      await soroban.updateOracle(mockDrandResponse);

      expect(mockServer.getAccount).toHaveBeenCalledWith('test-public-key');
      expect(nativeToScVal).toHaveBeenCalledWith(123, { type: 'u128' });
      expect(mockContract.call).toHaveBeenCalledWith('set_random_value', 'scval', 'scvmap');
      expect(mockServer.prepareTransaction).toHaveBeenCalledWith(mockTransaction);
      expect(mockTransaction.sign).toHaveBeenCalledWith(mockKeypair);
      expect(common.submitSorobanTx).toHaveBeenCalledWith(mockServer, mockTransaction);
    });

    it('should retry on failure and succeed on second attempt', async () => {
      soroban.init();
      mockServer.getAccount.mockResolvedValue(mockAccount);
      mockServer.prepareTransaction.mockResolvedValue(mockTransaction);
      (common.submitSorobanTx as any)
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce(undefined);

      await soroban.updateOracle(mockDrandResponse);

      expect(common.submitSorobanTx).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retry attempts', async () => {
      soroban.init();
      mockServer.getAccount.mockResolvedValue(mockAccount);
      mockServer.prepareTransaction.mockResolvedValue(mockTransaction);
      (common.submitSorobanTx as any).mockRejectedValue(new Error('Transaction failed'));

      await expect(soroban.updateOracle(mockDrandResponse)).rejects.toThrow('Transaction failed');
      expect(common.submitSorobanTx).toHaveBeenCalledTimes(3); // maxRetryAttempts
    });

    it('should create correct map entries for contract call', async () => {
      soroban.init();
      mockServer.getAccount.mockResolvedValue(mockAccount);
      mockServer.prepareTransaction.mockResolvedValue(mockTransaction);
      (common.submitSorobanTx as any).mockResolvedValue(undefined);

      await soroban.updateOracle(mockDrandResponse);

      // Verify map entries were created correctly
      expect(xdr.ScVal.scvSymbol).toHaveBeenCalledWith('prev_signature');
      expect(xdr.ScVal.scvString).toHaveBeenCalledWith('test-previous-signature');
      expect(xdr.ScVal.scvSymbol).toHaveBeenCalledWith('randomness');
      expect(xdr.ScVal.scvString).toHaveBeenCalledWith('test-randomness');
      expect(xdr.ScVal.scvSymbol).toHaveBeenCalledWith('signature');
      expect(xdr.ScVal.scvString).toHaveBeenCalledWith('test-signature');
    });
  });
}); 
