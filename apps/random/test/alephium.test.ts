import { NodeProvider, web3 } from '@alephium/web3';
import { PrivateKeyWallet } from '@alephium/web3-wallet';
import { DIARandomOracleInstance, DIARandomOracle } from '@repo/common';
import { getLastRound, updateOracle, init } from '../src/oracles/alephium';
import config from '../src/config';
import type { DrandResponse } from '../src/api';

jest.mock('@alephium/web3', () => ({
  NodeProvider: jest.fn(),
  web3: {
    setCurrentNodeProvider: jest.fn(),
  },
  MAP_ENTRY_DEPOSIT: BigInt(1000),
}));
jest.mock('@repo/common', () => ({
  DIARandomOracle: {
    at: jest.fn(),
  },
}));

jest.mock('@alephium/web3-wallet', () => ({
  PrivateKeyWallet: jest.fn().mockImplementation(() => ({
    someWalletMethod: jest.fn(),
  })),
}));

describe('Alephium Randomness Oracle', () => {
  let mockNodeProvider: NodeProvider;
  let mockWallet: PrivateKeyWallet;
  let mockRandomOracle: DIARandomOracleInstance;

  beforeAll(() => {
    mockNodeProvider = { someNodeProviderMethod: jest.fn() } as unknown as NodeProvider;
    mockWallet = { someWalletMethod: jest.fn() } as unknown as PrivateKeyWallet;
    mockRandomOracle = {
      view: {
        getLastRound: jest.fn(),
      },
      transact: {
        setRandomValue: jest.fn(),
      },
    } as unknown as DIARandomOracleInstance;

    (NodeProvider as unknown as jest.Mock).mockImplementation(() => mockNodeProvider);
    (PrivateKeyWallet as unknown as jest.Mock).mockImplementation(() => mockWallet);
    (DIARandomOracle.at as jest.Mock).mockReturnValue(mockRandomOracle);

    init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getLastRound', () => {
    it('should fetch and return the last round correctly', async () => {
      const mockResult = { returns: BigInt(1234) };
      (mockRandomOracle.view.getLastRound as jest.Mock).mockResolvedValue(mockResult);

      const lastRound = await getLastRound();

      expect(mockRandomOracle.view.getLastRound).toHaveBeenCalledTimes(1);
      expect(lastRound).toBe(1234);
    });

    it('should throw an error if getLastRound fails', async () => {
      (mockRandomOracle.view.getLastRound as jest.Mock).mockRejectedValue(new Error('Failed to fetch last round'));

      await expect(getLastRound()).rejects.toThrow('Failed to fetch last round');
    });
  });

  describe('updateOracle', () => {
    it('should build and submit a transaction to update the oracle', async () => {
      const mockData: DrandResponse = {
        round: 5678,
        randomness: 'mockRandomness',
        signature: 'mockSignature',
        previous_signature: 'mockPreviousSignature',
      };

      const mockResult = { success: true };
      (mockRandomOracle.transact.setRandomValue as jest.Mock).mockResolvedValue(mockResult);

      await updateOracle(mockData);

      expect(mockRandomOracle.transact.setRandomValue).toHaveBeenCalledTimes(1);
      expect(mockRandomOracle.transact.setRandomValue).toHaveBeenCalledWith(
        expect.objectContaining({
          args: {
            round: BigInt(mockData.round),
            value: {
              randomness: mockData.randomness,
              signature: mockData.signature,
              previousSignature: mockData.previous_signature,
            },
          },
          signer: mockWallet,
          attoAlphAmount: expect.any(BigInt),
        })
      );
    });

    it('should throw an error if updateOracle fails', async () => {
      const mockData: DrandResponse = {
        round: 5678,
        randomness: 'mockRandomness',
        signature: 'mockSignature',
        previous_signature: 'mockPreviousSignature',
      };

      (mockRandomOracle.transact.setRandomValue as jest.Mock).mockRejectedValue(new Error('Transaction failed'));

      await expect(updateOracle(mockData)).rejects.toThrow('Transaction failed');
    });
  });
});
