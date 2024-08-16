import {
  Contract,
  Keypair,
  SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import {
  extendInstanceTtl,
  restoreInstance,
  submitSorobanTx,
} from '@repo/common/src/soroban';
import config from '../src/config';
import { restoreOracle, extendOracleTtl, updateOracle, init } from '../src/oracles/soroban';
import { DAY_IN_LEDGERS } from '@repo/common';

jest.mock('@stellar/stellar-sdk', () => {
  const originalModule = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...originalModule,
    Contract: jest.fn().mockImplementation(() => ({
      call: jest.fn(),
      getFootprint: jest.fn().mockReturnValue({}), // Mock getFootprint method
    })),
    Keypair: {
      fromSecret: jest.fn().mockReturnValue({
        publicKey: jest.fn().mockReturnValue('GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'),
        secret: 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      }),
    },
    SorobanRpc: {
      Server: jest.fn().mockImplementation(() => ({
        getAccount: jest.fn().mockResolvedValue({
          sequence: '1',
        }),
        prepareTransaction: jest.fn().mockResolvedValue({
          sign: jest.fn(),
        }),
        getLatestLedger: jest.fn().mockResolvedValue(100), // Mock getLatestLedger
        getWasm: jest.fn().mockResolvedValue({}), // Mock getWasm
        getLedgerEntries: jest.fn().mockResolvedValue({
          entries: [
            {
              liveUntilLedgerSeq: 200, // Mock necessary property
            },
          ],
        }), // Mock getLedgerEntries
      })),
    },
    TransactionBuilder: jest.fn().mockImplementation(() => ({
      addOperation: jest.fn().mockReturnThis(),
      setTimeout: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnThis(),
    })),
  };
});

jest.mock('@repo/common/src/soroban', () => ({
  DAY_IN_LEDGERS: 17280,
  DEFAULT_TX_OPTIONS: { fee: BASE_FEE, networkPassphrase: Networks.TESTNET },
  extendInstanceTtl: jest.fn(),
  restoreInstance: jest.fn(),
  submitSorobanTx: jest.fn(),
}));

describe('Soroban Oracle', () => {
  let mockServer: SorobanRpc.Server;
  let mockKeypair: Keypair;
  let mockContract: Contract;

  beforeAll(() => {
    init(); // Initialize the soroban setup
    mockServer = new SorobanRpc.Server(config.soroban.rpcUrl, { allowHttp: true });
    mockKeypair = Keypair.fromSecret(config.soroban.secretKey);
    mockContract = new Contract(config.soroban.contractId);
  });

  afterEach(() => {
    jest.clearAllMocks();
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
          secret: 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        }),
        expect.objectContaining({
          call: expect.any(Function),
        })
      );
    });
  });

  describe('extendOracleTtl', () => {
    it('should call extendInstanceTtl with correct parameters', async () => {
      await extendOracleTtl();
      const threshold = DAY_IN_LEDGERS * 29;
      const extendTo = DAY_IN_LEDGERS * 30;

      expect(extendInstanceTtl).toHaveBeenCalledTimes(1);
      expect(extendInstanceTtl).toHaveBeenCalledWith(
        expect.objectContaining({
          server: expect.objectContaining({
            getAccount: expect.any(Function),
            prepareTransaction: expect.any(Function),
            getLatestLedger: expect.any(Function),
            getLedgerEntries: expect.any(Function),
            getWasm: expect.any(Function),
          }),
          source: expect.objectContaining({
            publicKey: expect.any(Function),
            secret: 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          }),
          contract: expect.objectContaining({
            call: expect.any(Function),
            getFootprint: expect.any(Function),
          }),
          threshold,
          extendTo,
        })
      );
    });
  });

  describe('updateOracle', () => {
    it('should build and submit the transaction successfully', async () => {
      const keys = ['key1', 'key2'];
      const prices = [100, 200];

      await updateOracle(keys, prices);
      // Capture the arguments passed to submitSorobanTx
      const submitArgs = (submitSorobanTx as jest.MockedFunction<typeof submitSorobanTx>).mock.calls[0]; // [server, tx]

      console.log('submitSorobanTx called with:', submitArgs);

      expect(submitSorobanTx).toHaveBeenCalledTimes(1);

      expect(submitSorobanTx).toHaveBeenCalledWith(
        expect.objectContaining({
          getAccount: expect.any(Function),
          prepareTransaction: expect.any(Function),
        }),
        expect.objectContaining({
          sign: expect.any(Function),
        })
      );
    });

    it('should retry transaction on failure', async () => {
      const keys = ['key1', 'key2'];
      const prices = [100, 200];

      const submitSorobanTxMock = submitSorobanTx as jest.MockedFunction<typeof submitSorobanTx>;

      submitSorobanTxMock.mockRejectedValue(new Error('Transaction failed'));

      await expect(updateOracle(keys, prices)).rejects.toThrow('Transaction failed');

      expect(submitSorobanTxMock).toHaveBeenCalledTimes(config.soroban.maxRetryAttempts);
    });
  });
});
