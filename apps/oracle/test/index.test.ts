import { jest } from '@jest/globals';
import { Keypair, Contract } from '@stellar/stellar-sdk';
import { getAssetPrices } from '../src/api';
import {
  extendOracleTtl,
  restoreOracle,
  updateOracle as updateSorobanOracle,
  init as initSoroban,
} from '../src/oracles/soroban';
import config, { ChainName } from '../src/config';
import { checkDeviation, update } from '../src/index'; // Adjust the import to the correct path

jest.mock('../src/api');
jest.mock('../src/oracles/soroban');
jest.mock('@stellar/stellar-sdk', () => {
  const originalModule: object = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...originalModule,
    Keypair: {
      fromSecret: jest.fn().mockReturnValue({
        publicKey: jest
          .fn()
          .mockReturnValue('GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'),
        secret: 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      }),
    },
    Contract: jest.fn().mockImplementation(() => ({
      call: jest.fn(),
    })),
  };
});

jest.mock('../src/config', () => ({
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
}));

describe('checkDeviation', () => {
  it('should return true when the price deviates significantly', () => {
    expect(checkDeviation(100, 106)).toBe(true);
    expect(checkDeviation(100, 94)).toBe(true);
  });

  it('should return false when the price does not deviate significantly', () => {
    expect(checkDeviation(100, 104)).toBe(false);
    expect(checkDeviation(100, 96)).toBe(false);
  });
});

describe('update', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update oracle with new prices when deviation is significant', async () => {
    const published = new Map<string, number>([['ETH', 1000]]);
    const prices = new Map<string, number>([['ETH', 1100]]);

    const result = await update(published, prices);

    expect(updateSorobanOracle).toHaveBeenCalledWith(['ETH/USD'], [1100]);
    expect(result.get('ETH')).toBe(1100);
  });

  it('should not update oracle if no significant deviation', async () => {
    const published = new Map<string, number>([['ETH', 1000]]);
    const prices = new Map<string, number>([['ETH', 1001]]);

    const result = await update(published, prices);

    expect(updateSorobanOracle).not.toHaveBeenCalled();
    expect(result.get('ETH')).toBe(1000);
  });

  it('should handle conditional pairs and update appropriately', async () => {
    config.conditionalPairs = [[0, 1]]; // Mock conditional pairs

    const published = new Map<string, number>([
      ['ETH', 1000],
      ['BNB', 300],
    ]);
    const prices = new Map<string, number>([
      ['ETH', 1100],
      ['BNB', 350],
    ]);

    const result = await update(published, prices);

    expect(updateSorobanOracle).toHaveBeenCalledWith(['ETH/USD', 'BNB/USD'], [1100, 350]);
    expect(result.get('ETH')).toBe(1100);
    expect(result.get('BNB')).toBe(350);
  });
});
