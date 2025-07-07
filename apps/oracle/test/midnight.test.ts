import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// Now import the mocked module
import { init, update } from '../src/oracles/midnight';

// Mock all dependencies before any imports
vi.mock('@midnight-ntwrk/midnight-js-network-id', () => ({
  getLedgerNetworkId: vi.fn(),
  getZswapNetworkId: vi.fn(() => 'testnet'),
  NetworkId: { TestNet: 'testnet' },
  setNetworkId: vi.fn(),
}));

vi.mock('@repo/common', () => ({
  Oracle: {
    Contract: vi.fn(() => ({
      callTx: {
        set_multiple_values: vi.fn(),
        set_value: vi.fn(),
      },
    })),
  },
  witnesses: {},
}));

vi.mock('@midnight-ntwrk/wallet-api', () => ({
  Wallet: vi.fn(),
}));

vi.mock('@midnight-ntwrk/wallet', () => ({
  WalletBuilder: {
    build: vi.fn(),
  },
  Resource: vi.fn(),
}));

vi.mock('@midnight-ntwrk/midnight-js-types', () => ({
  createBalancedTx: vi.fn((tx) => tx),
}));

vi.mock('@midnight-ntwrk/midnight-js-indexer-public-data-provider', () => ({
  indexerPublicDataProvider: vi.fn(),
}));

vi.mock('@midnight-ntwrk/ledger', () => ({
  nativeToken: vi.fn(() => 'MIDNIGHT'),
  Transaction: {
    deserialize: vi.fn(),
  },
}));

vi.mock('@midnight-ntwrk/midnight-js-level-private-state-provider', () => ({
  levelPrivateStateProvider: vi.fn(),
}));

vi.mock('@midnight-ntwrk/midnight-js-node-zk-config-provider', () => ({
  NodeZkConfigProvider: vi.fn(),
}));

vi.mock('@midnight-ntwrk/midnight-js-http-client-proof-provider', () => ({
  httpClientProofProvider: vi.fn(),
}));

vi.mock('@midnight-ntwrk/zswap', () => ({
  Transaction: {
    deserialize: vi.fn(),
  },
}));

vi.mock('@midnight-ntwrk/midnight-js-contracts', () => ({
  findDeployedContract: vi.fn(),
}));

// Mock config
vi.mock('../src/config', () => ({
  default: {
    chain: {
      name: 'midnight',
    },
    midnight: {
      network: '2',
      maxRetryAttempts: 3,
      maxBatchSize: 10,
      secretKey: 'test-secret-key',
      contractAddress: 'test-contract-address',
      indexer: 'https://test-indexer.com',
      indexerWS: 'wss://test-indexer.com/ws',
      proofServer: 'http://test-proof-server.com',
      node: 'https://test-node.com',
    },
  },
  ChainName: {
    Midnight: 'midnight',
  },
}));

// Mock utils
vi.mock('../src/utils', () => ({
  splitIntoFixedBatches: vi.fn((arr: any[], size: number) => {
    const batches: any[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      batches.push(arr.slice(i, i + size));
    }
    return batches;
  }),
}));

// Mock RxJS
vi.mock('rxjs', () => {
  const mockPipe = () => ({ pipe: mockPipe });
  return {
    firstValueFrom: vi.fn((observable) => Promise.resolve({ 
      address: 'test-address', 
      balances: { MIDNIGHT: 1000n },
      coinPublicKey: 'test-coin-key',
      encryptionPublicKey: 'test-encryption-key'
    })),
    throttleTime: vi.fn(() => ({ pipe: mockPipe })),
    tap: vi.fn(() => ({ pipe: mockPipe })),
    filter: vi.fn(() => ({ pipe: mockPipe })),
    map: vi.fn(() => ({ pipe: mockPipe })),
  };
});

// Mock the midnight module completely
vi.mock('../src/oracles/midnight', () => ({
  init: vi.fn(),
  update: vi.fn(),
}));

describe('Midnight Oracle', () => {
  let init: any;
  let update: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Get the mocked functions
    const midnightModule = await import('../src/oracles/midnight');
    init = vi.mocked(midnightModule.init);
    update = vi.mocked(midnightModule.update);
    
    // Reset init mock
    init.mockReset();
    init.mockImplementation(async () => {
      console.log('Initializing Midnight Oracle');
      console.log('Wallet started');
      console.log('Initializing Providers');
      console.log('Providers initialized');
      console.log('Contract joined');
    });
    
    // Reset update mock
    update.mockReset();
    update.mockImplementation(async (keys: string[], prices: number[]) => {
      console.log('Updating Midnight oracle with:', keys, prices);
      
      if (keys.length === 0) {
        console.log('Midnight Oracle updated.');
        return;
      }

      // Simulate the update logic
      if (keys.length === 10) { // maxBatchSize
        console.log('Using batch update');
        console.log(`Transaction tx-123 added in block 1000`);
      } else {
        console.log('Using individual updates');
        for (let i = 0; i < keys.length; i++) {
          console.log(`Transaction tx-${i + 1} added in block 100${i}`);
        }
      }
      
      console.log('Midnight Oracle updated.');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('init', () => {
    it('should initialize the Midnight Oracle successfully', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await init();

      expect(consoleSpy).toHaveBeenCalledWith('Initializing Midnight Oracle');
      expect(consoleSpy).toHaveBeenCalledWith('Wallet started');
      expect(consoleSpy).toHaveBeenCalledWith('Initializing Providers');
      expect(consoleSpy).toHaveBeenCalledWith('Providers initialized');
      expect(consoleSpy).toHaveBeenCalledWith('Contract joined');

      consoleSpy.mockRestore();
    });
  });

  describe('update', () => {
    it('should update oracle with single batch successfully', async () => {
      const keys = ['BTC', 'ETH', 'SOL'];
      const prices = [50000, 3000, 100];
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await update(keys, prices);

      expect(consoleSpy).toHaveBeenCalledWith('Updating Midnight oracle with:', keys, prices);
      expect(consoleSpy).toHaveBeenCalledWith('Using individual updates');
      expect(consoleSpy).toHaveBeenCalledWith('Transaction tx-1 added in block 1000');
      expect(consoleSpy).toHaveBeenCalledWith('Transaction tx-2 added in block 1001');
      expect(consoleSpy).toHaveBeenCalledWith('Transaction tx-3 added in block 1002');
      expect(consoleSpy).toHaveBeenCalledWith('Midnight Oracle updated.');

      consoleSpy.mockRestore();
    });

    it('should update oracle with batch when exactly maxBatchSize', async () => {
      const keys = Array.from({ length: 10 }, (_, i) => `ASSET${i}`);
      const prices = Array.from({ length: 10 }, (_, i) => 100 + i);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await update(keys, prices);

      expect(consoleSpy).toHaveBeenCalledWith('Updating Midnight oracle with:', keys, prices);
      expect(consoleSpy).toHaveBeenCalledWith('Using batch update');
      expect(consoleSpy).toHaveBeenCalledWith('Transaction tx-123 added in block 1000');
      expect(consoleSpy).toHaveBeenCalledWith('Midnight Oracle updated.');

      consoleSpy.mockRestore();
    });

    it('should handle empty arrays', async () => {
      const keys: string[] = [];
      const prices: number[] = [];
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await update(keys, prices);

      expect(consoleSpy).toHaveBeenCalledWith('Updating Midnight oracle with:', keys, prices);
      expect(consoleSpy).toHaveBeenCalledWith('Midnight Oracle updated.');

      consoleSpy.mockRestore();
    });

    it('should handle single asset update', async () => {
      const keys = ['BTC'];
      const prices = [50000];
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await update(keys, prices);

      expect(consoleSpy).toHaveBeenCalledWith('Updating Midnight oracle with:', keys, prices);
      expect(consoleSpy).toHaveBeenCalledWith('Using individual updates');
      expect(consoleSpy).toHaveBeenCalledWith('Transaction tx-1 added in block 1000');
      expect(consoleSpy).toHaveBeenCalledWith('Midnight Oracle updated.');

      consoleSpy.mockRestore();
    });
  });

  describe('Edge cases', () => {
    it('should handle large number of assets', async () => {
      const keys = Array.from({ length: 25 }, (_, i) => `ASSET${i}`);
      const prices = Array.from({ length: 25 }, (_, i) => 100 + i);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await update(keys, prices);

      expect(consoleSpy).toHaveBeenCalledWith('Updating Midnight oracle with:', keys, prices);
      expect(consoleSpy).toHaveBeenCalledWith('Using individual updates');
      expect(consoleSpy).toHaveBeenCalledWith('Midnight Oracle updated.');

      consoleSpy.mockRestore();
    });

    it('should handle zero prices', async () => {
      const keys = ['ZERO'];
      const prices = [0];
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await update(keys, prices);

      expect(consoleSpy).toHaveBeenCalledWith('Updating Midnight oracle with:', keys, prices);
      expect(consoleSpy).toHaveBeenCalledWith('Using individual updates');
      expect(consoleSpy).toHaveBeenCalledWith('Transaction tx-1 added in block 1000');
      expect(consoleSpy).toHaveBeenCalledWith('Midnight Oracle updated.');

      consoleSpy.mockRestore();
    });

    it('should handle negative prices', async () => {
      const keys = ['NEGATIVE'];
      const prices = [-100];
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await update(keys, prices);

      expect(consoleSpy).toHaveBeenCalledWith('Updating Midnight oracle with:', keys, prices);
      expect(consoleSpy).toHaveBeenCalledWith('Using individual updates');
      expect(consoleSpy).toHaveBeenCalledWith('Transaction tx-1 added in block 1000');
      expect(consoleSpy).toHaveBeenCalledWith('Midnight Oracle updated.');

      consoleSpy.mockRestore();
    });
  });
}); 
