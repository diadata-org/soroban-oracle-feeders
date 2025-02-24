import { JSONRpcProvider, getContract } from 'opnet';
import { Wallet, TransactionFactory, OPNetLimitedProvider } from '@btc-vision/transaction';
import config from '../src/config';
import { updateOracle, init } from '../src/oracles/opnet';
import { splitIntoFixedBatches } from '../src/utils';

jest.mock('opnet', () => ({
  JSONRpcProvider: jest.fn().mockImplementation(() => ({
    url: 'https://testnet.opnet.org', // Provide a valid URL in the mock
    utxoManager: {
      getUTXOs: jest.fn().mockResolvedValue([{ txid: 'mockTxid', vout: 0 }]), // Mock UTXOs
    },
  })),
  getContract: jest.fn(),
}));

jest.mock('@btc-vision/transaction', () => {
  const mockSignInteraction = jest.fn().mockResolvedValue(['signedTx1', 'signedTx2']);
  const mockBroadcastTransaction = jest
    .fn()
    .mockResolvedValueOnce({ success: true }) // Mock first transaction success
    .mockResolvedValueOnce({ success: true }); // Mock second transaction success

  return {
    Wallet: {
      fromWif: jest.fn(),
    },
    TransactionFactory: jest.fn().mockImplementation(() => ({
      signInteraction: mockSignInteraction,
    })),
    OPNetLimitedProvider: jest.fn().mockImplementation(() => ({
      broadcastTransaction: mockBroadcastTransaction,
    })),
    __mocks__: {
      mockSignInteraction,
      mockBroadcastTransaction,
    },
  };
});

jest.mock('@btc-vision/bsi-binary', () => ({
  BinaryWriter: jest.fn().mockImplementation(() => ({
    writeSelector: jest.fn(),
    writeU8: jest.fn(),
    writeStringWithLength: jest.fn(),
    writeBytes: jest.fn(),
    getBuffer: jest.fn().mockReturnValue(Buffer.from('mockBuffer')), // Mock a valid buffer
  })),
  ABICoder: jest.fn().mockImplementation(() => ({
    encodeSelector: jest.fn().mockReturnValue('mockSelector'), // Mock the encodeSelector method
  })),
  BufferHelper: {
    hexToUint8Array: jest.fn().mockImplementation((hex) => {
      return new Uint8Array(hex.match(/.{1,2}/g).map((byte: string) => parseInt(byte, 16)));
    }),
  },
}));

jest.mock('../src/utils', () => ({
  splitIntoFixedBatches: jest.fn(),
}));

jest.mock('../src/config', () => ({
  ChainName: {
    OPNET: 'OPNET',
  },
  opnet: {
    rpcUrl: 'https://testnet.opnet.org', // Valid mocked URL
    backupRpcUrl: 'https://backup.opnet.org',
    secretKey: 'mock-secret-key',
    contract: 'mock-contract',
    maxBatchSize: 2,
    maxRetryAttempts: 3,
  },
  chainName: 'opnet',
}));

describe('OpNet Oracle - updateOracle', () => {
  const mockProvider = new (JSONRpcProvider as jest.Mock)();
  const mockWallet = { p2tr: 'mockAddress', keypair: 'mockKeypair' };
  const mockContract = {
    address: { toString: jest.fn().mockReturnValue('mockContractAddress') },
  };

  beforeAll(() => {
    // Mock Wallet and Contract
    (Wallet.fromWif as jest.Mock).mockReturnValue(mockWallet);
    (getContract as jest.Mock).mockReturnValue(mockContract);

    // Initialize the OpNet oracle environment
    init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully submit transactions for each batch', async () => {
    const keys = ['key1', 'key2'];
    const prices = [100, 200];

    (splitIntoFixedBatches as jest.Mock).mockImplementation((items) => [items]); // Mock splitting batches

    // Mock fetching UTXOs
    const mockUTXOs = [{ txid: 'mockTxId', vout: 0 }];
    mockProvider.utxoManager = {
      getUTXOs: jest.fn().mockResolvedValue(mockUTXOs),
    };

    const transactionFactory = new (TransactionFactory as jest.MockedClass<
      typeof TransactionFactory
    >)();
    const limitedProvider = new (OPNetLimitedProvider as jest.MockedClass<
      typeof OPNetLimitedProvider
    >)(config.opnet.rpcUrl);

    await updateOracle(keys, prices);

    // Assertions for signing interaction
    expect(transactionFactory.signInteraction).toHaveBeenCalled();
    expect(limitedProvider.broadcastTransaction).toHaveBeenCalledTimes(2); // For each transaction broadcast
  });

  it('should retry transaction on failure and eventually succeed', async () => {
    const keys = ['key1', 'key2'];
    const prices = [100, 200];

    (splitIntoFixedBatches as jest.Mock).mockImplementation((items) => [items]);

    const transactionFactory = new (TransactionFactory as jest.Mock)();
    const limitedProvider = new (OPNetLimitedProvider as jest.Mock)();
    const mockUTXOs = [{ txid: 'mockTxId', vout: 0 }];
    mockProvider.utxoManager = {
      getUTXOs: jest.fn().mockResolvedValue(mockUTXOs),
    };

    // Mocking failure for the first attempt and success for the second
    transactionFactory.signInteraction = jest.fn().mockResolvedValue(['signedTx1', 'signedTx2']);
    limitedProvider.broadcastTransaction
      .mockRejectedValueOnce(new Error('Transaction failed')) // First transaction fails
      .mockResolvedValueOnce({ success: true }) // Retry succeeds
      .mockResolvedValueOnce({ success: true }); // Mock second broadcast success

    await updateOracle(keys, prices);

    // Expect retry logic to kick in after the first failure
    expect(limitedProvider.broadcastTransaction).toHaveBeenCalledTimes(3); // One fail, two success (first and second broadcast)
  });

  it('should throw an error after max retry attempts are reached', async () => {
    const keys = ['key1', 'key2'];
    const prices = [100, 200];

    (splitIntoFixedBatches as jest.Mock).mockImplementation((items) => [items]);

    const transactionFactory = new (TransactionFactory as jest.Mock)();
    const limitedProvider = new (OPNetLimitedProvider as jest.Mock)();

    transactionFactory.signInteraction = jest.fn().mockResolvedValue(['signedTx1', 'signedTx2']);
    limitedProvider.broadcastTransaction.mockRejectedValue(new Error('Transaction failed'));

    await expect(updateOracle(keys, prices)).rejects.toThrow('Transaction failed');

    // Ensure it tried max retries
    expect(limitedProvider.broadcastTransaction).toHaveBeenCalledTimes(
      config.opnet.maxRetryAttempts,
    );
  });
});
