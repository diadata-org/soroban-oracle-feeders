import {
  Contract,
  Keypair,
  nativeToScVal,
  scValToNative,
  SorobanRpc,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import {
  extendInstanceTtl,
  restoreInstance,
  submitSorobanTx,
  DEFAULT_TX_OPTIONS,
} from '@repo/common';
import { DrandResponse } from '../src/api';
import config, { ChainName } from '../src/config';
import {
  init,
  restoreOracle,
  extendOracleTtl,
  getLastRound,
  updateOracle,
  getServer,
} from '../src/oracles/soroban';

jest.mock('@stellar/stellar-sdk', () => {
  const originalModule = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...originalModule,
    scValToNative: jest.fn(), // Mock scValToNative as a function
    nativeToScVal: jest.fn(),
    Keypair: {
      fromSecret: jest.fn().mockReturnValue({
        publicKey: jest
          .fn()
          .mockReturnValue('GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'),
        sign: jest.fn(),
      }),
    },
    SorobanRpc: {
      Server: jest.fn().mockImplementation(() => ({
        getAccount: jest.fn().mockResolvedValue({ sequence: '1' }),
        prepareTransaction: jest.fn().mockResolvedValue({
          sign: jest.fn(),
        }),
        simulateTransaction: jest.fn().mockResolvedValue({
          success: true,
          result: { retval: 'mockScVal' },
        }),
      })),
      Api: {
        isSimulationSuccess: jest.fn().mockImplementation((sim) => sim.success),
      },
    },
    Contract: jest.fn().mockImplementation(() => ({
      call: jest.fn().mockReturnValue('mockOperation'),
      getFootprint: jest.fn(),
    })),
    TransactionBuilder: jest.fn().mockImplementation(() => ({
      addOperation: jest.fn().mockReturnThis(),
      setSorobanData: jest.fn().mockReturnThis(),
      setTimeout: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnThis(),
      sign: jest.fn(), // Mock sign method on TransactionBuilder
    })),
  };
});

jest.mock('@repo/common');

describe('Soroban Randomness Oracle', () => {
  let mockServer: SorobanRpc.Server;
  let mockKeypair: Keypair;
  let mockContract: Contract;

  beforeEach(() => {
    mockServer = getServer();
    mockKeypair = Keypair.fromSecret('SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
    mockContract = new Contract('mockContractId');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('init', () => {
    it('should initialize Soroban components correctly', () => {
      init();

      expect(SorobanRpc.Server).toHaveBeenCalledWith(config.soroban.rpcUrl, { allowHttp: true });
      expect(Keypair.fromSecret).toHaveBeenCalledWith(config.soroban.secretKey);
      expect(Contract).toHaveBeenCalledWith(config.soroban.contractId);
    });
  });

  describe('restoreOracle', () => {
    it('should call restoreInstance with correct parameters', async () => {
      await restoreOracle();

      expect(restoreInstance).toHaveBeenCalledWith(
        expect.objectContaining({
          getAccount: expect.any(Function),
          prepareTransaction: expect.any(Function),
        }),
        expect.objectContaining({
          publicKey: expect.any(Function),
          sign: expect.any(Function),
        }),
        expect.objectContaining({
          call: expect.any(Function),
          getFootprint: expect.any(Function),
        }),
      );
    });
  });

  describe('extendOracleTtl', () => {
    it('should call extendInstanceTtl with correct parameters', async () => {
      await extendOracleTtl();

      const extendTo = 17280 * 30;
      const threshold = extendTo - 17280;

      expect(extendInstanceTtl).toHaveBeenCalledWith({
        server: expect.objectContaining({
          getAccount: expect.any(Function),
          prepareTransaction: expect.any(Function),
        }),
        source: expect.objectContaining({
          publicKey: expect.any(Function),
          sign: expect.any(Function),
        }),
        contract: expect.objectContaining({
          call: expect.any(Function),
          getFootprint: expect.any(Function),
        }),
        threshold,
        extendTo,
      });
    });
  });

  describe('getLastRound', () => {
    it('should fetch and return the last round correctly', async () => {
      const mockTx = new TransactionBuilder(
        {
          accountId: () => {
            return 'mockAccount';
          },
          sequenceNumber: () => {
            return '1';
          },
          incrementSequenceNumber: () => {},
        },
        DEFAULT_TX_OPTIONS,
      )
        .addOperation(mockContract.call('last_round'))
        .setTimeout(30)
        .build();

      const mockSimulateResponse = {
        success: true,
        result: { retval: 'mockScVal' }, // Mock result with the expected format
      };

      (mockServer.simulateTransaction as jest.Mock).mockResolvedValue(mockSimulateResponse);
      (scValToNative as jest.Mock).mockReturnValue(1234); // Correctly mock scValToNative to return 1234

      const lastRound = await getLastRound();

      expect(mockServer.simulateTransaction).toHaveBeenCalled();
      expect(mockServer.simulateTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          addOperation: expect.any(Function),
          build: expect.any(Function),
          setSorobanData: expect.any(Function),
          setTimeout: expect.any(Function),
          sign: expect.any(Function),
        }),
      );
      expect(lastRound).toBe(1234); // Expect the returned round to be 1234
    });
  });

  describe('updateOracle', () => {
    it('should build and submit a transaction to update the oracle', async () => {
      const mockTx = {
        build: jest.fn().mockReturnThis(),
        setTimeout: jest.fn().mockReturnThis(),
        addOperation: jest.fn().mockReturnThis(),
        sign: jest.fn(),
      };
      const mockDrandResponse: DrandResponse = {
        round: 1234,
        randomness: 'abc123',
        signature: 'signature123',
        previous_signature: 'prevSignature123',
      };

      mockServer.getAccount = jest.fn().mockResolvedValue({ sequence: '1' });
      mockServer.prepareTransaction = jest.fn().mockResolvedValue(mockTx);
      (TransactionBuilder as unknown as jest.Mock).mockImplementation(() => mockTx);

      await updateOracle(mockDrandResponse);

      expect(submitSorobanTx).toHaveBeenCalledWith(
        expect.objectContaining({
          getAccount: expect.any(Function),
          prepareTransaction: expect.any(Function),
        }),
        expect.objectContaining({
          sign: expect.any(Function),
        }),
      );
    });

    it('should handle errors during update', async () => {
      const mockDrandResponse: DrandResponse = {
        round: 1234,
        randomness: 'abc123',
        signature: 'signature123',
        previous_signature: 'prevSignature123',
      };

      mockServer.getAccount = jest.fn().mockResolvedValue({ sequence: '1' });
      (TransactionBuilder as unknown as jest.Mock).mockImplementation(() => {
        throw new Error('Transaction error');
      });

      await expect(updateOracle(mockDrandResponse)).rejects.toThrow('Transaction error');
    });
  });
});
