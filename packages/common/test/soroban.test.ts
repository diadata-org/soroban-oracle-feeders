import { describe, it, expect, vi, beforeEach } from 'vitest';
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

vi.mock('@stellar/stellar-sdk', async () => {
  const originalModule = await vi.importActual('@stellar/stellar-sdk') as any;
  return {
    ...originalModule,
    SorobanDataBuilder: vi.fn().mockImplementation(() => ({
      setReadOnly: vi.fn().mockReturnThis(),
      setReadWrite: vi.fn().mockReturnThis(),
      build: vi.fn().mockReturnThis(),
    })),
    TransactionBuilder: vi.fn().mockImplementation(() => ({
      addOperation: vi.fn().mockReturnThis(),
      setSorobanData: vi.fn().mockReturnThis(),
      setTimeout: vi.fn().mockReturnThis(),
      build: vi.fn().mockReturnThis(),
      sign: vi.fn(), // Mock sign method on TransactionBuilder
    })),
    rpc: {
      Server: vi.fn().mockImplementation(() => ({
        sendTransaction: vi.fn().mockResolvedValue({
          status: 'PENDING', // Mock status to return 'PENDING'
          hash: 'mockTransactionHash',
          errorResult: null,
        }),
        getTransaction: vi.fn().mockResolvedValue({
          status: 'SUCCESS',
          resultXdr: 'mockResultXdr',
          resultMetaXdr: 'mockResultMetaXdr',
        }),
        getWasm: vi.fn().mockResolvedValue({}), // Mock getWasm
        getLatestLedger: vi.fn().mockResolvedValue(100), // Mock getLatestLedger
        getLedgerEntries: vi.fn().mockResolvedValue({
          entries: [
            {
              liveUntilLedgerSeq: 200, // Mock necessary property
            },
          ],
        }),
        getAccount: vi.fn().mockResolvedValue({
          sequence: '1',
        }),
        prepareTransaction: vi.fn().mockResolvedValue({
          sign: vi.fn(),
        }),
      })),
    },
    Operation: {
      extendFootprintTtl: vi.fn(),
      restoreFootprint: vi.fn(),
    },
    Contract: vi.fn().mockImplementation(() => ({
      getFootprint: vi.fn().mockReturnValue({
        contractCode: vi.fn().mockImplementation((data) => {
          return new originalModule.xdr.LedgerKey('contractCode', data);
        }),
      }),
      contractId: vi.fn().mockReturnValue('mockContractId'),
    })),
    Keypair: {
      fromSecret: vi.fn().mockReturnValue({
        publicKey: vi
          .fn()
          .mockReturnValue('GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'),
        sign: vi.fn(),
      }),
    },
    xdr: {
      ...originalModule.xdr,
      LedgerKey: {
        contractCode: vi.fn().mockImplementation((data) => {
          return new originalModule.xdr.LedgerKey('contractCode', data);
        }),
      },
      LedgerEntryData: vi.fn().mockImplementation(() => ({
        contractData: vi.fn().mockReturnThis(),
        val: vi.fn().mockReturnThis(),
        instance: vi.fn().mockReturnThis(),
        executable: vi.fn().mockReturnThis(),
        wasmHash: vi.fn().mockReturnValue('mockWasmHash'),
      })),
    },
  };
});

vi.mock('../src/utils', () => ({
  sleep: vi.fn(),
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
    mockTx = new TransactionBuilder(
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
    );

    vi.clearAllMocks();
  });

  describe('extendInstanceTtl', () => {
    it('should extend the TTL of the contract instance', async () => {
      const wasmEntry = {
        liveUntilLedgerSeq: 150,
        contractData: vi.fn().mockReturnThis(),
        val: {
          contractData: vi.fn().mockReturnThis(),
          instance: vi.fn().mockReturnThis(),
          executable: vi.fn().mockReturnThis(),
          wasmHash: vi.fn().mockReturnValue('mockWasmHash'),
          val: vi.fn().mockReturnThis(),
        },
      };
      const latestLedger = { sequence: 100 };

      (mockServer.getLatestLedger as any).mockResolvedValue(latestLedger);
      (mockServer.getLedgerEntries as any).mockResolvedValue({ entries: [wasmEntry] });
      (mockServer.getAccount as any).mockResolvedValue({ sequence: '1' });
      (mockServer.prepareTransaction as any).mockResolvedValue(mockTx);

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

      (mockServer.getLatestLedger as any).mockResolvedValue(latestLedger);
      (mockServer.getLedgerEntries as any).mockResolvedValue({ entries: [wasmEntry] });

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
          contractData: vi.fn().mockReturnThis(),
          instance: vi.fn().mockReturnThis(),
          executable: vi.fn().mockReturnThis(),
          wasmHash: vi.fn().mockReturnValue('mockWasmHash'),
          val: vi.fn().mockReturnThis(),
        },
      };
      const latestLedger = { sequence: 101 };

      (mockServer.getLatestLedger as any).mockResolvedValue(latestLedger);
      (mockServer.getLedgerEntries as any).mockResolvedValue({ entries: [wasmEntry] });
      (mockServer.getAccount as any).mockResolvedValue({ sequence: '1' });
      (mockServer.prepareTransaction as any).mockResolvedValue(mockTx);

      await restoreInstance(mockServer, mockKeypair, mockContract);

      expect(mockServer.prepareTransaction).toHaveBeenCalled();
      expect(Operation.restoreFootprint).toHaveBeenCalledWith({});
      expect(mockServer.getAccount).toHaveBeenCalledWith(mockKeypair.publicKey());
    });

    it('should not restore the contract instance if not archived', async () => {
      const wasmEntry = { liveUntilLedgerSeq: 200, val: {} };
      const latestLedger = { sequence: 100 };

      (mockServer.getLatestLedger as any).mockResolvedValue(latestLedger);
      (mockServer.getLedgerEntries as any).mockResolvedValue({ entries: [wasmEntry] });

      await restoreInstance(mockServer, mockKeypair, mockContract);

      expect(mockServer.prepareTransaction).not.toHaveBeenCalled();
      expect(Operation.restoreFootprint).not.toHaveBeenCalled();
    });
  });
});
