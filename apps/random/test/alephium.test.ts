import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MAP_ENTRY_DEPOSIT, NodeProvider, web3 } from '@alephium/web3';
import { PrivateKeyWallet } from '@alephium/web3-wallet';
import { DIARandomOracle } from '@repo/common';
import type { DrandResponse } from '../src/api';
import * as alephium from '../src/oracles/alephium';

// Mock Alephium SDK
vi.mock('@alephium/web3', () => ({
  MAP_ENTRY_DEPOSIT: '1000000000000000000',
  NodeProvider: vi.fn(),
  web3: {
    setCurrentNodeProvider: vi.fn(),
  },
}));

vi.mock('@alephium/web3-wallet', () => ({
  PrivateKeyWallet: vi.fn(),
}));

// Mock @repo/common
vi.mock('@repo/common', () => ({
  DIARandomOracle: {
    at: vi.fn(),
  },
}));

// Mock config
vi.mock('../src/config', () => ({
  default: {
    chainName: 'ALEPHIUM',
    alephium: {
      rpcUrl: 'https://testnet.alephium.org',
      secretKey: 'test-secret-key',
      contract: 'test-contract-address',
      maxRetryAttempts: 3,
    },
  },
  ChainName: {
    ALEPHIUM: 'ALEPHIUM',
  },
}));

describe('alephium', () => {
  let mockNodeProvider: any;
  let mockWallet: any;
  let mockRandomOracle: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock objects
    mockNodeProvider = {
      // Add any methods that might be called on NodeProvider
    };

    mockWallet = {
      // Add any methods that might be called on wallet
    };

    mockRandomOracle = {
      view: {
        getLastRound: vi.fn(),
      },
      transact: {
        setRandomValue: vi.fn(),
      },
    };

    // Setup mock implementations
    (NodeProvider as any).mockImplementation(() => mockNodeProvider);
    (PrivateKeyWallet as any).mockImplementation(() => mockWallet);
    (DIARandomOracle.at as any).mockReturnValue(mockRandomOracle);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('init', () => {
    it('should initialize nodeProvider, wallet, and randomOracle', () => {
      alephium.init();

      expect(NodeProvider).toHaveBeenCalledWith('https://testnet.alephium.org');
      expect(web3.setCurrentNodeProvider).toHaveBeenCalledWith(mockNodeProvider);
      expect(PrivateKeyWallet).toHaveBeenCalledWith({
        privateKey: 'test-secret-key',
        keyType: undefined,
        nodeProvider: mockNodeProvider,
      });
      expect(DIARandomOracle.at).toHaveBeenCalledWith('test-contract-address');
    });
  });

  describe('getLastRound', () => {
    it('should return the last round number successfully', async () => {
      alephium.init();
      mockRandomOracle.view.getLastRound.mockResolvedValue({ returns: '123' });

      const result = await alephium.getLastRound();

      expect(mockRandomOracle.view.getLastRound).toHaveBeenCalled();
      expect(result).toBe(123);
    });

    it('should handle string returns from contract', async () => {
      alephium.init();
      mockRandomOracle.view.getLastRound.mockResolvedValue({ returns: '456' });

      const result = await alephium.getLastRound();

      expect(result).toBe(456);
    });

    it('should handle numeric returns from contract', async () => {
      alephium.init();
      mockRandomOracle.view.getLastRound.mockResolvedValue({ returns: 789 });

      const result = await alephium.getLastRound();

      expect(result).toBe(789);
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
      alephium.init();
      mockRandomOracle.transact.setRandomValue.mockResolvedValue({ txId: 'test-tx-id' });

      await alephium.updateOracle(mockDrandResponse);

      expect(mockRandomOracle.transact.setRandomValue).toHaveBeenCalledWith({
        args: {
          modifiedRound: BigInt(123), // 123 % 1000 = 123
          value: {
            randomness: 'test-randomness',
            signature: 'test-signature',
            round: BigInt(123),
          },
        },
        signer: mockWallet,
        attoAlphAmount: MAP_ENTRY_DEPOSIT,
      });
    });

    it('should handle round numbers that need modulo operation', async () => {
      alephium.init();
      mockRandomOracle.transact.setRandomValue.mockResolvedValue({ txId: 'test-tx-id' });

      const largeRoundData: DrandResponse = {
        ...mockDrandResponse,
        round: 1234, // 1234 % 1000 = 234
      };

      await alephium.updateOracle(largeRoundData);

      expect(mockRandomOracle.transact.setRandomValue).toHaveBeenCalledWith({
        args: {
          modifiedRound: BigInt(234), // 1234 % 1000 = 234
          value: {
            randomness: 'test-randomness',
            signature: 'test-signature',
            round: BigInt(1234),
          },
        },
        signer: mockWallet,
        attoAlphAmount: MAP_ENTRY_DEPOSIT,
      });
    });

    it('should retry on failure and succeed on second attempt', async () => {
      alephium.init();
      mockRandomOracle.transact.setRandomValue
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce({ txId: 'test-tx-id' });

      await alephium.updateOracle(mockDrandResponse);

      expect(mockRandomOracle.transact.setRandomValue).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retry attempts', async () => {
      alephium.init();
      mockRandomOracle.transact.setRandomValue.mockRejectedValue(new Error('Transaction failed'));

      await expect(alephium.updateOracle(mockDrandResponse)).rejects.toThrow('Transaction failed');
      expect(mockRandomOracle.transact.setRandomValue).toHaveBeenCalledTimes(3); // maxRetryAttempts
    });

    it('should handle edge case with round 0', async () => {
      alephium.init();
      mockRandomOracle.transact.setRandomValue.mockResolvedValue({ txId: 'test-tx-id' });

      const zeroRoundData: DrandResponse = {
        ...mockDrandResponse,
        round: 0,
      };

      await alephium.updateOracle(zeroRoundData);

      expect(mockRandomOracle.transact.setRandomValue).toHaveBeenCalledWith({
        args: {
          modifiedRound: BigInt(0), // 0 % 1000 = 0
          value: {
            randomness: 'test-randomness',
            signature: 'test-signature',
            round: BigInt(0),
          },
        },
        signer: mockWallet,
        attoAlphAmount: MAP_ENTRY_DEPOSIT,
      });
    });

    it('should handle very large round numbers', async () => {
      alephium.init();
      mockRandomOracle.transact.setRandomValue.mockResolvedValue({ txId: 'test-tx-id' });

      const largeRoundData: DrandResponse = {
        ...mockDrandResponse,
        round: 999999, // 999999 % 1000 = 999
      };

      await alephium.updateOracle(largeRoundData);

      expect(mockRandomOracle.transact.setRandomValue).toHaveBeenCalledWith({
        args: {
          modifiedRound: BigInt(999), // 999999 % 1000 = 999
          value: {
            randomness: 'test-randomness',
            signature: 'test-signature',
            round: BigInt(999999),
          },
        },
        signer: mockWallet,
        attoAlphAmount: MAP_ENTRY_DEPOSIT,
      });
    });
  });
}); 
