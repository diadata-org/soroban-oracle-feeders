import {
  BASE_FEE,
  contract,
  Contract,
  Keypair,
  Networks,
  Operation,
  rpc,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import {
  submitSorobanTx,
  extendInstanceTtl,
  restoreInstance,
  DAY_IN_LEDGERS,
  DEFAULT_TX_OPTIONS,
} from '../src/soroban';
import { sleep } from '../src/utils';

jest.mock('@stellar/stellar-sdk', () => {
  const originalModule = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...originalModule,
    SorobanDataBuilder: jest.fn().mockImplementation(() => ({
      setReadOnly: jest.fn().mockReturnThis(),
      setReadWrite: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnThis(),
    })),
    TransactionBuilder: jest.fn().mockImplementation(() => ({
      addOperation: jest.fn().mockReturnThis(),
      setSorobanData: jest.fn().mockReturnThis(),
      setTimeout: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnThis(),
      sign: jest.fn(),  // Mock sign method on TransactionBuilder
    })),
    rpc: {
      Server: jest.fn().mockImplementation(() => ({
        sendTransaction: jest.fn().mockResolvedValue({
          status: 'PENDING',  // Mock status to return 'PENDING'
          hash: 'mockTransactionHash',
          errorResult: null,
        }),
        getTransaction: jest.fn().mockResolvedValue({
          status: 'SUCCESS',
          resultXdr: 'mockResultXdr',
          resultMetaXdr: 'mockResultMetaXdr',
        }),
        getWasm: jest.fn().mockResolvedValue({}), // Mock getWasm
        getLatestLedger: jest.fn().mockResolvedValue(100), // Mock getLatestLedger
        getLedgerEntries: jest.fn().mockResolvedValue({
          entries: [
            {
              liveUntilLedgerSeq: 200, // Mock necessary property
            },
          ],
        }),
        getAccount: jest.fn().mockResolvedValue({
          sequence: '1',
        }),
        prepareTransaction: jest.fn().mockResolvedValue({
          sign: jest.fn(),
        }),
      })),
    },
    Operation: {
      extendFootprintTtl: jest.fn(),
      restoreFootprint: jest.fn(),
    },
    Contract: jest.fn().mockImplementation(() => ({
      getFootprint: jest.fn().mockReturnValue({
        contractCode: jest.fn().mockImplementation((data) => {
          return new originalModule.xdr.LedgerKey('contractCode', data);
        }),
      },),
      contractId: jest.fn().mockReturnValue('mockContractId'),
    })),
    Keypair: {
      fromSecret: jest.fn().mockReturnValue({
        publicKey: jest.fn().mockReturnValue('GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'),
        sign: jest.fn(),
      }),
    },
    xdr: {
      ...originalModule.xdr,
      LedgerKey: {
        contractCode: jest.fn().mockImplementation((data) => {
          return new originalModule.xdr.LedgerKey('contractCode', data);
        }),
      },
      LedgerEntryData: jest.fn().mockImplementation(() => ({
        contractData: jest.fn().mockReturnThis(),
        val: jest.fn().mockReturnThis(),
        instance: jest.fn().mockReturnThis(),
        executable: jest.fn().mockReturnThis(),
        wasmHash: jest.fn().mockReturnValue('mockWasmHash'),
      })),
    },
  };
});

jest.mock('../src/utils', () => ({
  sleep: jest.fn(),
}));

describe('Soroban Functions', () => {
  let mockServer: rpc.Server;
  let mockKeypair: Keypair;
  let mockContract: Contract;
  let mockTx: TransactionBuilder;

  beforeEach(() => {
    mockServer = new rpc.Server('http://localhost:8000');
    mockKeypair = Keypair.fromSecret('SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
    mockContract = new Contract('mockContractId');
    mockTx = new TransactionBuilder({ accountId: () => { return 'mockAccount'; }, sequenceNumber: () => { return '1'; }, incrementSequenceNumber: () => { } }, DEFAULT_TX_OPTIONS);


    jest.clearAllMocks();
  });

  describe('extendInstanceTtl', () => {
    it('should extend the TTL of the contract instance', async () => {
      const wasmEntry = {
        liveUntilLedgerSeq: 150, contractData: jest.fn().mockReturnThis(),
        val: {
          contractData: jest.fn().mockReturnThis(),
          instance: jest.fn().mockReturnThis(),
          executable: jest.fn().mockReturnThis(),
          wasmHash: jest.fn().mockReturnValue('mockWasmHash'),
          val: jest.fn().mockReturnThis()
        },
      };
      const latestLedger = { sequence: 100 };

      (mockServer.getLatestLedger as jest.Mock).mockResolvedValue(latestLedger);
      (mockServer.getLedgerEntries as jest.Mock).mockResolvedValue({ entries: [wasmEntry] });
      (mockServer.getAccount as jest.Mock).mockResolvedValue({ sequence: '1' });
      (mockServer.prepareTransaction as jest.Mock).mockResolvedValue(mockTx);

      await extendInstanceTtl({
        server: mockServer,
        source: mockKeypair,
        contract: mockContract,
        threshold: 100,
        extendTo: 200,
      });

      expect(mockServer.prepareTransaction).toHaveBeenCalled();
      expect(mockServer.getAccount).toHaveBeenCalledWith(mockKeypair.publicKey());
    });

    it('should throw an error if the contract instance is archived', async () => {
      const wasmEntry = { liveUntilLedgerSeq: 100 };
      const latestLedger = { sequence: 101 };

      (mockServer.getLatestLedger as jest.Mock).mockResolvedValue(latestLedger);
      (mockServer.getLedgerEntries as jest.Mock).mockResolvedValue({ entries: [wasmEntry] });

      await expect(
        extendInstanceTtl({
          server: mockServer,
          source: mockKeypair,
          contract: mockContract,
          threshold: 100,
          extendTo: 200,
        }),
      ).rejects.toThrow('Contract instance at mockContractId is archived');
    });
  });

  describe('restoreInstance', () => {
    it('should restore the contract instance if archived', async () => {
      const wasmEntry = {
        liveUntilLedgerSeq: 100,
        val: {
          contractData: jest.fn().mockReturnThis(),
          instance: jest.fn().mockReturnThis(),
          executable: jest.fn().mockReturnThis(),
          wasmHash: jest.fn().mockReturnValue('mockWasmHash'),
          val: jest.fn().mockReturnThis()
        },
      }
      const latestLedger = { sequence: 101 };

      (mockServer.getLatestLedger as jest.Mock).mockResolvedValue(latestLedger);
      (mockServer.getLedgerEntries as jest.Mock).mockResolvedValue({ entries: [wasmEntry] });
      (mockServer.getAccount as jest.Mock).mockResolvedValue({ sequence: '1' });
      (mockServer.prepareTransaction as jest.Mock).mockResolvedValue(mockTx);

      await restoreInstance(mockServer, mockKeypair, mockContract);

      expect(mockServer.prepareTransaction).toHaveBeenCalled();
      expect(Operation.restoreFootprint).toHaveBeenCalledWith({});
      expect(mockServer.getAccount).toHaveBeenCalledWith(mockKeypair.publicKey());
    });

    it('should not restore the contract instance if not archived', async () => {
      const wasmEntry = { liveUntilLedgerSeq: 200, val: {} };
      const latestLedger = { sequence: 100 };

      (mockServer.getLatestLedger as jest.Mock).mockResolvedValue(latestLedger);
      (mockServer.getLedgerEntries as jest.Mock).mockResolvedValue({ entries: [wasmEntry] });

      await restoreInstance(mockServer, mockKeypair, mockContract);

      expect(mockServer.prepareTransaction).not.toHaveBeenCalled();
      expect(Operation.restoreFootprint).not.toHaveBeenCalled();
    });
  });
});
