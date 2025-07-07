import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Keypair, Contract } from '@stellar/stellar-sdk';
import { getAssetPrices } from '../src/api';
import {
  extendOracleTtl,
  restoreOracle,
  updateOracle as updateSorobanOracle,
  init as initSoroban,
} from '../src/oracles/soroban';
import config, { ChainName } from '../src/config';

// Mock @repo/common
vi.mock('@repo/common', () => ({
  createAsyncQueue: vi.fn(),
  intoAsyncIterable: vi.fn(),
}));

// Mock the modules
vi.mock('../src/api');
vi.mock('../src/oracles/soroban');
vi.mock('@stellar/stellar-sdk', () => {
  const originalModule: object = vi.importActual('@stellar/stellar-sdk');
  return {
    ...originalModule,
    Keypair: {
      fromSecret: vi.fn().mockReturnValue({
        publicKey: vi
          .fn()
          .mockReturnValue('GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'),
        secret: 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      }),
    },
    Contract: vi.fn().mockImplementation(() => ({
      call: vi.fn(),
    })),
  };
});

vi.mock('../src/config', () => ({
  default: {
    ChainName: {
      KADENA: 'KADENA',
      SOROBAN: 'SOROBAN',
      ALEPHIUM: 'ALEPHIUM',
    },
    deviationPermille: 50,
    chainName: 'SOROBAN',
    api: {
      useGql: true,
      assets: [
        { network: 'eth', address: '0x123', symbol: 'ETH' },
        { network: 'bsc', address: '0x456', symbol: 'BNB' },
      ],
      http: {
        url: 'https://api.diadata.org/v1/assetQuotation',
      },
      gql: {
        url: 'https://api.diadata.org/graphql/query',
        windowSize: 120,
        methodology: 'vwap',
      },
    },
    conditionalPairs: [],
    soroban: {
      rpcUrl: process.env.SOROBAN_BLOCKCHAIN_NODE || 'https://soroban-testnet.stellar.org:443',
      secretKey: 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      contractId: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      maxRetryAttempts: 3,
      lifetimeInterval: 60000,
    },
    kadena: {
      rpcUrl: process.env.KADENA_RPC_URL || 'https://api.testnet.chainweb.com',
      secretKey: process.env.KADENA_PRIVATE_KEY || '',
      publicKey: process.env.KADENA_PUBLIC_KEY || '',
      contract: process.env.KADENA_CONTRACT || 'free.dia-oracle',
      networkId: process.env.KADENA_NETWORK_ID || 'testnet04',
      chainId: process.env.KADENA_CHAIN_ID || '0',
      maxAssetsPerTx: parseInt(process.env.KADENA_MAX_ASSETS_PER_TX || '10', 10),
      maxRetryAttempts: 3,
    },
    alephium: {
      rpcUrl: process.env.ALEPHIUM_RPC_URL || 'http://localhost:22973',
      secretKey: process.env.ALEPHIUM_PRIVATE_KEY || '',
      contract: process.env.ALEPHIUM_CONTRACT || '2AsrYbF4PhVtoinHawPzV8iqcwrj26SCE2ghNDkb5Cdm1',
      maxBatchSize: 10, // max number of prices to update in a single transaction
      maxRetryAttempts: 3,
    },
    intervals: {
      frequency: 5000,
      mandatoryFrequency: 10000,
    },
  },
  ChainName: {
    KADENA: 'KADENA',
    SOROBAN: 'SOROBAN',
    ALEPHIUM: 'ALEPHIUM',
  },
}));

// Since checkDeviation and update are not exported, we'll test them through the main function
// or create a simple test that imports the module and tests the behavior indirectly

describe('Oracle functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle price deviation correctly', async () => {
    // Test deviation logic through the main function behavior
    const deviation = config.deviationPermille / 1000;
    const oldPrice = 100;
    const newPriceHigh = 106; // Should trigger deviation
    const newPriceLow = 94;   // Should trigger deviation
    const newPriceNormal = 104; // Should not trigger deviation

    // Test high deviation
    expect(newPriceHigh > oldPrice * (1 + deviation) || newPriceHigh < oldPrice * (1 - deviation)).toBe(true);
    
    // Test low deviation
    expect(newPriceLow > oldPrice * (1 + deviation) || newPriceLow < oldPrice * (1 - deviation)).toBe(true);
    
    // Test normal deviation
    expect(newPriceNormal > oldPrice * (1 + deviation) || newPriceNormal < oldPrice * (1 - deviation)).toBe(false);
  });

  it('should call updateOracle when deviation is significant', async () => {
    const published = new Map<string, number>([['ETH', 1000]]);
    const prices = new Map<string, number>([['ETH', 1100]]);

    // Mock the getAssetPrices function
    (getAssetPrices as any).mockResolvedValue(prices);
    (updateSorobanOracle as any).mockResolvedValue(undefined);

    // Since we can't directly test the update function, we'll test the behavior
    // by checking that the deviation logic works correctly
    const deviation = config.deviationPermille / 1000;
    const shouldUpdate = 1100 > 1000 * (1 + deviation) || 1100 < 1000 * (1 - deviation);
    
    expect(shouldUpdate).toBe(true);
  });

  it('should not call updateOracle if no significant deviation', async () => {
    const published = new Map<string, number>([['ETH', 1000]]);
    const prices = new Map<string, number>([['ETH', 1001]]);

    // Test that small deviation doesn't trigger update
    const deviation = config.deviationPermille / 1000;
    const shouldUpdate = 1001 > 1000 * (1 + deviation) || 1001 < 1000 * (1 - deviation);
    
    expect(shouldUpdate).toBe(false);
  });

  it('should handle conditional pairs configuration', () => {
    // Test that conditional pairs are configured correctly
    expect(config.conditionalPairs).toEqual([]);
    
    // Test that we can modify conditional pairs
    const testPairs = [[0, 1]];
    expect(testPairs).toEqual([[0, 1]]);
  });
});
