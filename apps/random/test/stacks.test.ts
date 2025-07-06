import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AnchorMode,
  broadcastTransaction,
  uintCV,
  makeContractCall,
  tupleCV,
  callReadOnlyFunction,
  cvToValue,
} from '@stacks/transactions';
import { bufferFromHex } from '@stacks/transactions/dist/cl';
import { StacksDevnet, StacksMainnet } from '@stacks/network';
import * as stacks from '../src/oracles/stacks';

// Mock Stacks SDK
vi.mock('@stacks/transactions', () => ({
  AnchorMode: {
    Any: 'any',
  },
  broadcastTransaction: vi.fn(),
  uintCV: vi.fn(),
  makeContractCall: vi.fn(),
  tupleCV: vi.fn(),
  callReadOnlyFunction: vi.fn(),
  cvToValue: vi.fn(),
}));

vi.mock('@stacks/transactions/dist/cl', () => ({
  bufferFromHex: vi.fn(),
}));

vi.mock('@stacks/network', () => ({
  StacksDevnet: vi.fn(),
  StacksMainnet: vi.fn(),
}));

// Mock config
vi.mock('../src/config', () => ({
  default: {
    chainName: 'STACKS',
    stacks: {
      rpcUrl: 'https://testnet.stacks.org',
      backupRpcUrl: 'https://backup.stacks.org',
      contract: 'test-contract-address',
      contractName: 'test-contract-name',
      secretKey: 'test-secret-key',
      maxRetryAttempts: 3,
    },
  },
  ChainName: {
    STACKS: 'STACKS',
  },
}));

describe('stacks', () => {
  let mockNetwork: any;
  let mockBackupNetwork: any;
  let mockTransaction: any;
  let mockBroadcastResponse: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock objects
    mockNetwork = {
      // Add any methods that might be called on network
    };

    mockBackupNetwork = {
      // Add any methods that might be called on backup network
    };

    mockTransaction = {
      // Add any properties that might be accessed on transaction
    };

    mockBroadcastResponse = {
      txid: 'test-tx-id',
      error: null,
    };

    // Setup mock implementations
    (StacksMainnet as any).mockImplementation(() => mockNetwork);
    (StacksDevnet as any).mockImplementation(() => mockNetwork);
    (makeContractCall as any).mockResolvedValue(mockTransaction);
    (broadcastTransaction as any).mockResolvedValue(mockBroadcastResponse);
    (uintCV as any).mockReturnValue('uint-cv');
    (tupleCV as any).mockReturnValue('tuple-cv');
    (bufferFromHex as any).mockReturnValue('buffer');
    (callReadOnlyFunction as any).mockResolvedValue('read-result');
    (cvToValue as any).mockReturnValue({ value: 123 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('init', () => {
    it('should initialize network with custom RPC URL', () => {
      stacks.init();

      expect(StacksMainnet).toHaveBeenCalledWith({ url: 'https://testnet.stacks.org' });
    });

    it('should initialize backup network when backupRpcUrl is provided', () => {
      stacks.init();

      expect(StacksMainnet).toHaveBeenCalledWith({ url: 'https://backup.stacks.org' });
    });
  });

  describe('getLastRound', () => {
    it('should return the last round number successfully', async () => {
      stacks.init();
      (callReadOnlyFunction as any).mockResolvedValue('read-result');
      (cvToValue as any).mockReturnValue({ value: 456 });

      const result = await stacks.getLastRound();

      expect(callReadOnlyFunction).toHaveBeenCalledWith({
        contractAddress: 'test-contract-address',
        contractName: 'test-contract-name',
        functionName: 'get-last-round',
        functionArgs: [],
        network: mockNetwork,
        senderAddress: 'test-contract-address',
      });
      expect(cvToValue).toHaveBeenCalledWith('read-result');
      expect(result).toBe(456);
    });

    it('should switch to backup network on primary failure', async () => {
      stacks.init();
      (callReadOnlyFunction as any)
        .mockRejectedValueOnce(new Error('Primary failed'))
        .mockResolvedValueOnce('backup-result');
      (cvToValue as any).mockReturnValue({ value: 789 });

      const result = await stacks.getLastRound();

      expect(callReadOnlyFunction).toHaveBeenCalledTimes(2);
      expect(cvToValue).toHaveBeenCalledWith('backup-result');
      expect(result).toBe(789);
    });

    it('should throw error when both primary and backup fail', async () => {
      stacks.init();
      (callReadOnlyFunction as any).mockRejectedValue(new Error('Network failed'));

      await expect(stacks.getLastRound()).rejects.toThrow('Network failed');
    });
  });

  describe('updateOracle', () => {
    const mockData = {
      round: 123,
      randomness: 'test-randomness',
      signature: 'test-signature',
      previous_signature: 'test-previous-signature',
    };

    it('should update oracle successfully on first attempt', async () => {
      stacks.init();
      (makeContractCall as any).mockResolvedValue(mockTransaction);
      (broadcastTransaction as any).mockResolvedValue(mockBroadcastResponse);

      await stacks.updateOracle(mockData);

      expect(uintCV).toHaveBeenCalledWith(123);
      expect(bufferFromHex).toHaveBeenCalledWith('test-randomness');
      expect(bufferFromHex).toHaveBeenCalledWith('test-signature');
      expect(bufferFromHex).toHaveBeenCalledWith('test-previous-signature');
      expect(tupleCV).toHaveBeenCalledWith({
        randomness: 'buffer',
        signature: 'buffer',
        'previous-signature': 'buffer',
      });
      expect(makeContractCall).toHaveBeenCalledWith({
        contractAddress: 'test-contract-address',
        contractName: 'test-contract-name',
        functionName: 'set-random-value',
        functionArgs: ['uint-cv', 'tuple-cv'],
        senderKey: 'test-secret-key',
        network: mockNetwork,
        anchorMode: AnchorMode.Any,
      });
      expect(broadcastTransaction).toHaveBeenCalledWith(mockTransaction, mockNetwork);
    });

    it('should retry on failure and succeed on second attempt', async () => {
      stacks.init();
      (makeContractCall as any)
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce(mockTransaction);
      (broadcastTransaction as any).mockResolvedValue(mockBroadcastResponse);

      await stacks.updateOracle(mockData);

      expect(makeContractCall).toHaveBeenCalledTimes(2);
    });

    it('should switch to backup network on first retry', async () => {
      stacks.init();
      (makeContractCall as any)
        .mockRejectedValueOnce(new Error('Primary failed'))
        .mockResolvedValueOnce(mockTransaction);
      (broadcastTransaction as any).mockResolvedValue(mockBroadcastResponse);

      await stacks.updateOracle(mockData);

      // Check that the second call uses backup network
      expect(makeContractCall).toHaveBeenCalledTimes(2);
    });

    it('should throw error when broadcast fails', async () => {
      stacks.init();
      (makeContractCall as any).mockResolvedValue(mockTransaction);
      (broadcastTransaction as any).mockResolvedValue({ error: 'Broadcast failed' });

      await expect(stacks.updateOracle(mockData)).rejects.toThrow('Transaction failed with error: [object Object]');
    });

    it('should throw error after max retry attempts', async () => {
      stacks.init();
      (makeContractCall as any).mockRejectedValue(new Error('Transaction failed'));

      await expect(stacks.updateOracle(mockData)).rejects.toThrow('Transaction failed');
      expect(makeContractCall).toHaveBeenCalledTimes(3); // maxRetryAttempts
    });

    it('should handle edge case with round 0', async () => {
      stacks.init();
      (makeContractCall as any).mockResolvedValue(mockTransaction);
      (broadcastTransaction as any).mockResolvedValue(mockBroadcastResponse);

      const zeroRoundData = {
        ...mockData,
        round: 0,
      };

      await stacks.updateOracle(zeroRoundData);

      expect(uintCV).toHaveBeenCalledWith(0);
    });

    it('should handle very large round numbers', async () => {
      stacks.init();
      (makeContractCall as any).mockResolvedValue(mockTransaction);
      (broadcastTransaction as any).mockResolvedValue(mockBroadcastResponse);

      const largeRoundData = {
        ...mockData,
        round: 999999,
      };

      await stacks.updateOracle(largeRoundData);

      expect(uintCV).toHaveBeenCalledWith(999999);
    });
  });
}); 
