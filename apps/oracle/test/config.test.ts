import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TransactionBuilder } from '@btc-vision/transaction';

// Mock dotenv
vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(),
  },
}));

// Mock @btc-vision/transaction
vi.mock('@btc-vision/transaction', () => ({
  TransactionBuilder: {
    MINIMUM_DUST: 546n,
  },
}));

// Mock validation
vi.mock('../src/validation', () => ({
  GqlParams: {
    parse: vi.fn((data) => data),
  },
}));

describe('Config', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Store original environment variables
    originalEnv = { ...process.env };
    
    // Clear all mocks
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original environment variables
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('environment variable parsing', () => {
    it('should parse ASSETS environment variable correctly', async () => {
      process.env.ASSETS = 'ethereum§0x123456789§BTC§coingecko-btc§cmc-btc§0.5';
      
      const config = await import('../src/config');
      
      expect(config.default.api.assets).toHaveLength(1);
      expect(config.default.api.assets[0]).toEqual({
        network: 'ethereum',
        address: '0x123456789',
        symbol: 'BTC',
        coingeckoName: 'coingecko-btc',
        cmcName: 'cmc-btc',
        allowedDeviation: 0.5,
        gqlParams: { FeedSelection: [] },
      });
      expect(config.default.api.useGql).toBe(false);
    });

    it('should parse GQL_ASSETS environment variable correctly', async () => {
      process.env.GQL_ASSETS = 'ethereum§0x123456789§BTC§coingecko-btc§cmc-btc§0.5§{"FeedSelection":[{"Address":"0x123","Blockchain":"ethereum","LiquidityThreshold":1000}]}';
      
      const config = await import('../src/config');
      
      expect(config.default.api.assets).toHaveLength(1);
      expect(config.default.api.assets[0]).toEqual({
        network: 'ethereum',
        address: '0x123456789',
        symbol: 'BTC',
        coingeckoName: 'coingecko-btc',
        cmcName: 'cmc-btc',
        allowedDeviation: 0.5,
        gqlParams: {
          FeedSelection: [
            {
              Address: '0x123',
              Blockchain: 'ethereum',
              LiquidityThreshold: 1000,
            },
          ],
        },
      });
      expect(config.default.api.useGql).toBe(true);
    });

    it('should handle IBC address formatting', async () => {
      process.env.ASSETS = 'cosmos§ibc-123456789§ATOM§coingecko-atom§cmc-atom§0.5';
      
      const config = await import('../src/config');
      
      expect(config.default.api.assets[0]).toEqual({
        network: 'cosmos',
        address: 'ibc-123456789',
        symbol: 'ATOM',
        coingeckoName: 'coingecko-atom',
        cmcName: 'cmc-atom',
        allowedDeviation: 0.5,
        gqlParams: { FeedSelection: [] },
      });
    });

    it('should handle IBC address with dash formatting', async () => {
      process.env.ASSETS = 'cosmos§ibc/123456789§ATOM§coingecko-atom§cmc-atom§0.5';
      
      const config = await import('../src/config');
      
      expect(config.default.api.assets[0]).toEqual({
        network: 'cosmos',
        address: 'ibc-123456789',
        symbol: 'ATOM',
        coingeckoName: 'coingecko-atom',
        cmcName: 'cmc-atom',
        allowedDeviation: 0.5,
        gqlParams: { FeedSelection: [] },
      });
    });

    it('should handle assets without optional parameters', async () => {
      process.env.ASSETS = 'ethereum§0x123456789§BTC';
      
      const config = await import('../src/config');
      
      expect(config.default.api.assets[0]).toEqual({
        network: 'ethereum',
        address: '0x123456789',
        symbol: 'BTC',
        coingeckoName: '',
        cmcName: '',
        allowedDeviation: 0.0,
        gqlParams: { FeedSelection: [] },
      });
    });

    it('should handle invalid allowedDeviation', async () => {
      process.env.ASSETS = 'ethereum§0x123456789§BTC§coingecko-btc§cmc-btc§invalid';
      
      const config = await import('../src/config');
      
      expect(config.default.api.assets[0].allowedDeviation).toBe(0.0);
    });

    it('should handle invalid GQL params JSON', async () => {
      process.env.GQL_ASSETS = 'ethereum§0x123456789§BTC§coingecko-btc§cmc-btc§0.5§invalid-json';
      
      // Mock console.error to capture error logs
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const config = await import('../src/config');
      
      expect(config.default.api.assets[0].gqlParams).toEqual({ FeedSelection: [] });
      expect(consoleSpy).toHaveBeenCalledWith('Error while parsing GQL asset string: ', expect.any(Error));
      
      consoleSpy.mockRestore();
    });

    it('should handle multiple assets', async () => {
      process.env.ASSETS = 'ethereum§0x123456789§BTC§coingecko-btc§cmc-btc§0.5;ethereum§0x987654321§ETH§coingecko-eth§cmc-eth§0.3';
      
      const config = await import('../src/config');
      
      expect(config.default.api.assets).toHaveLength(2);
      expect(config.default.api.assets[0].symbol).toBe('BTC');
      expect(config.default.api.assets[1].symbol).toBe('ETH');
    });

    it('should exit when neither ASSETS nor GQL_ASSETS is provided', async () => {
      // Mock process.exit
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      
      // Mock console.error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Clear both environment variables
      delete process.env.ASSETS;
      delete process.env.GQL_ASSETS;
      
      await expect(import('../src/config')).rejects.toThrow('process.exit called');
      expect(consoleSpy).toHaveBeenCalledWith('Use either ASSETS or GQL_ASSETS env variable');
      expect(exitSpy).toHaveBeenCalledWith(1);
      
      exitSpy.mockRestore();
      consoleSpy.mockRestore();
    });

    it('should exit when both ASSETS and GQL_ASSETS are provided', async () => {
      // Mock process.exit
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      
      // Mock console.error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      process.env.ASSETS = 'ethereum§0x123456789§BTC';
      process.env.GQL_ASSETS = 'ethereum§0x123456789§BTC';
      
      await expect(import('../src/config')).rejects.toThrow('process.exit called');
      expect(consoleSpy).toHaveBeenCalledWith('Use either ASSETS or GQL_ASSETS env variable');
      expect(exitSpy).toHaveBeenCalledWith(1);
      
      exitSpy.mockRestore();
      consoleSpy.mockRestore();
    });
  });

  describe('conditional pairs parsing', () => {
    it('should parse CONDITIONAL_ASSETS correctly', async () => {
      process.env.ASSETS = 'ethereum§0x123456789§BTC';
      process.env.CONDITIONAL_ASSETS = '0-1;2-3;4-5';
      
      const config = await import('../src/config');
      
      expect(config.default.conditionalPairs).toEqual([[0, 1], [2, 3], [4, 5]]);
    });

    it('should handle empty CONDITIONAL_ASSETS', async () => {
      process.env.ASSETS = 'ethereum§0x123456789§BTC';
      delete process.env.CONDITIONAL_ASSETS;
      
      const config = await import('../src/config');
      
      expect(config.default.conditionalPairs).toEqual([]);
    });

    it('should handle single conditional pair', async () => {
      process.env.ASSETS = 'ethereum§0x123456789§BTC';
      process.env.CONDITIONAL_ASSETS = '0-1';
      
      const config = await import('../src/config');
      
      expect(config.default.conditionalPairs).toEqual([[0, 1]]);
    });
  });

  describe('chain configuration', () => {
    beforeEach(() => {
      process.env.ASSETS = 'ethereum§0x123456789§BTC';
    });

    it('should use default chain name when CHAIN_NAME is not provided', async () => {
      delete process.env.CHAIN_NAME;
      
      const config = await import('../src/config');
      
      expect(config.default.chainName).toBe('soroban');
    });

    it('should use provided CHAIN_NAME', async () => {
      process.env.CHAIN_NAME = 'kadena';
      
      const config = await import('../src/config');
      
      expect(config.default.chainName).toBe('kadena');
    });

    it('should export ChainName enum', async () => {
      const config = await import('../src/config');
      
      expect(config.ChainName).toEqual({
        Kadena: 'kadena',
        Soroban: 'soroban',
        Alephium: 'alephium',
        Stacks: 'stacks',
        Opnet: 'opnet',
      });
    });
  });

  describe('soroban configuration', () => {
    beforeEach(() => {
      process.env.ASSETS = 'ethereum§0x123456789§BTC';
    });

    it('should use default soroban values when environment variables are not provided', async () => {
      const config = await import('../src/config');
      
      expect(config.default.soroban).toEqual({
        rpcUrl: 'https://soroban-testnet.stellar.org:443',
        secretKey: '',
        contractId: '',
        maxRetryAttempts: 3,
        lifetimeInterval: 30 * 60 * 1000,
      });
    });

    it('should use provided soroban environment variables', async () => {
      process.env.SOROBAN_BLOCKCHAIN_NODE = 'https://custom-soroban-node.com';
      process.env.SOROBAN_PRIVATE_KEY = 'custom-secret-key';
      process.env.SOROBAN_DEPLOYED_CONTRACT = 'custom-contract-id';
      
      const config = await import('../src/config');
      
      expect(config.default.soroban).toEqual({
        rpcUrl: 'https://custom-soroban-node.com',
        secretKey: 'custom-secret-key',
        contractId: 'custom-contract-id',
        maxRetryAttempts: 3,
        lifetimeInterval: 30 * 60 * 1000,
      });
    });
  });

  describe('kadena configuration', () => {
    beforeEach(() => {
      process.env.ASSETS = 'ethereum§0x123456789§BTC';
    });

    it('should use default kadena values when environment variables are not provided', async () => {
      const config = await import('../src/config');
      
      expect(config.default.kadena).toEqual({
        rpcUrl: 'https://api.testnet.chainweb.com',
        secretKey: '',
        publicKey: '',
        contract: 'free.dia-oracle',
        networkId: 'testnet04',
        chainId: '0',
        maxAssetsPerTx: 10,
        maxRetryAttempts: 3,
      });
    });

    it('should use provided kadena environment variables', async () => {
      process.env.KADENA_RPC_URL = 'https://custom-kadena-rpc.com';
      process.env.KADENA_PRIVATE_KEY = 'custom-kadena-secret';
      process.env.KADENA_PUBLIC_KEY = 'custom-kadena-public';
      process.env.KADENA_CONTRACT = 'custom.kadena-contract';
      process.env.KADENA_NETWORK_ID = 'mainnet01';
      process.env.KADENA_CHAIN_ID = '1';
      process.env.KADENA_MAX_ASSETS_PER_TX = '5';
      
      const config = await import('../src/config');
      
      expect(config.default.kadena).toEqual({
        rpcUrl: 'https://custom-kadena-rpc.com',
        secretKey: 'custom-kadena-secret',
        publicKey: 'custom-kadena-public',
        contract: 'custom.kadena-contract',
        networkId: 'mainnet01',
        chainId: '1',
        maxAssetsPerTx: 5,
        maxRetryAttempts: 3,
      });
    });
  });

  describe('alephium configuration', () => {
    beforeEach(() => {
      process.env.ASSETS = 'ethereum§0x123456789§BTC';
    });

    it('should use default alephium values when environment variables are not provided', async () => {
      const config = await import('../src/config');
      
      expect(config.default.alephium).toEqual({
        rpcUrl: 'http://localhost:22973',
        secretKey: '',
        contract: '2AsrYbF4PhVtoinHawPzV8iqcwrj26SCE2ghNDkb5Cdm1',
        maxBatchSize: 10,
        maxRetryAttempts: 3,
      });
    });

    it('should use provided alephium environment variables', async () => {
      process.env.ALEPHIUM_RPC_URL = 'https://custom-alephium-rpc.com';
      process.env.ALEPHIUM_PRIVATE_KEY = 'custom-alephium-secret';
      process.env.ALEPHIUM_CONTRACT = 'custom-alephium-contract';
      
      const config = await import('../src/config');
      
      expect(config.default.alephium).toEqual({
        rpcUrl: 'https://custom-alephium-rpc.com',
        secretKey: 'custom-alephium-secret',
        contract: 'custom-alephium-contract',
        maxBatchSize: 10,
        maxRetryAttempts: 3,
      });
    });
  });

  describe('stacks configuration', () => {
    beforeEach(() => {
      process.env.ASSETS = 'ethereum§0x123456789§BTC';
    });

    it('should use default stacks values when environment variables are not provided', async () => {
      const config = await import('../src/config');
      
      expect(config.default.stacks).toEqual({
        rpcUrl: undefined,
        backupRpcUrl: undefined,
        contractName: 'dia-oracle',
        secretKey: '753b7cc01a1a2e86221266a154af739463fce51219d97e4f856cd7200c3bd2a601',
        contract: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        feeRate: BigInt(100),
        maxBatchSize: 10,
        maxRetryAttempts: 3,
      });
    });

    it('should use provided stacks environment variables', async () => {
      process.env.STACKS_RPC_URL = 'https://custom-stacks-rpc.com';
      process.env.STACKS_BACKUP_RPC_URL = 'https://backup-stacks-rpc.com';
      process.env.STACKS_CONTRACT_NAME = 'custom-stacks-contract';
      process.env.STACKS_PRIVATE_KEY = 'custom-stacks-secret';
      process.env.STACKS_CONTRACT = 'custom-stacks-address';
      process.env.STACKS_FEE_RATE = '200';
      
      const config = await import('../src/config');
      
      expect(config.default.stacks).toEqual({
        rpcUrl: 'https://custom-stacks-rpc.com',
        backupRpcUrl: 'https://backup-stacks-rpc.com',
        contractName: 'custom-stacks-contract',
        secretKey: 'custom-stacks-secret',
        contract: 'custom-stacks-address',
        feeRate: BigInt(200),
        maxBatchSize: 10,
        maxRetryAttempts: 3,
      });
    });
  });

  describe('opnet configuration', () => {
    beforeEach(() => {
      process.env.ASSETS = 'ethereum§0x123456789§BTC';
    });

    it('should use default opnet values when environment variables are not provided', async () => {
      const config = await import('../src/config');
      
      expect(config.default.opnet).toEqual({
        rpcUrl: 'https://regtest.opnet.org',
        network: '',
        backupRpcUrl: undefined,
        secretKey: 'cShTHPAqa5rX2p9GxN6QvwsFMnnhHLUx2WRE8ztNTWxqwBGWycH8',
        contract: 'bcrt1q39y3gw0zxaq0hgkr0x3m80tz504p5ta5l8j7y4',
        maxBatchSize: 10,
        maxRetryAttempts: 3,
        feeRate: 100,
        priorityFee: TransactionBuilder.MINIMUM_DUST,
      });
    });

    it('should use provided opnet environment variables', async () => {
      process.env.OPNET_RPC_URL = 'https://custom-opnet-rpc.com';
      process.env.OPNET_NETWORK = 'mainnet';
      process.env.OPNET_BACKUP_RPC_URL = 'https://backup-opnet-rpc.com';
      process.env.OPNET_PRIVATE_KEY = 'custom-opnet-secret';
      process.env.OPNET_CONTRACT = 'custom-opnet-contract';
      process.env.OPNET_FEE_RATE = '150';
      process.env.OPNET_PRIORITY_FEE = '1000';
      
      const config = await import('../src/config');
      
      expect(config.default.opnet).toEqual({
        rpcUrl: 'https://custom-opnet-rpc.com',
        network: 'mainnet',
        backupRpcUrl: 'https://backup-opnet-rpc.com',
        secretKey: 'custom-opnet-secret',
        contract: 'custom-opnet-contract',
        maxBatchSize: 10,
        maxRetryAttempts: 3,
        feeRate: 150,
        priorityFee: BigInt(1000),
      });
    });
  });

  describe('intervals configuration', () => {
    beforeEach(() => {
      process.env.ASSETS = 'ethereum§0x123456789§BTC';
    });

    it('should use default interval values when environment variables are not provided', async () => {
      const config = await import('../src/config');
      
      expect(config.default.intervals).toEqual({
        frequency: 120 * 1000, // 120 seconds
        mandatoryFrequency: 0,
      });
    });

    it('should use provided interval environment variables', async () => {
      process.env.FREQUENCY_SECONDS = '60';
      process.env.MANDATORY_FREQUENCY_SECONDS = '30';
      
      const config = await import('../src/config');
      
      expect(config.default.intervals).toEqual({
        frequency: 60 * 1000, // 60 seconds
        mandatoryFrequency: 30 * 1000, // 30 seconds
      });
    });
  });

  describe('API configuration', () => {
    beforeEach(() => {
      process.env.ASSETS = 'ethereum§0x123456789§BTC';
    });

    it('should use default API values when environment variables are not provided', async () => {
      const config = await import('../src/config');
      
      expect(config.default.api).toEqual({
        useGql: false,
        assets: expect.any(Array),
        http: {
          url: 'https://api.diadata.org/v1/assetQuotation',
        },
        gql: {
          url: 'https://api.diadata.org/graphql/query',
          windowSize: 120,
          methodology: 'vwap',
        },
      });
    });

    it('should use provided GraphQL environment variables', async () => {
      process.env.GQL_WINDOW_SIZE = '300';
      process.env.GQL_METHODOLOGY = 'median';
      
      const config = await import('../src/config');
      
      expect(config.default.api.gql).toEqual({
        url: 'https://api.diadata.org/graphql/query',
        windowSize: 300,
        methodology: 'median',
      });
    });
  });

  describe('external API configuration', () => {
    beforeEach(() => {
      process.env.ASSETS = 'ethereum§0x123456789§BTC';
    });

    it('should use default external API values when environment variables are not provided', async () => {
      const config = await import('../src/config');
      
      expect(config.default.coingecko).toEqual({
        apiKey: '',
        url: 'https://pro-api.coingecko.com',
      });
      
      expect(config.default.cmc).toEqual({
        apiKey: '',
        url: 'https://pro-api.coinmarketcap.com',
      });
    });

    it('should use provided external API environment variables', async () => {
      process.env.COINGECKO_API_KEY = 'coingecko-key';
      process.env.COINGECKO_API_URL = 'https://custom-coingecko.com';
      process.env.CMC_API_KEY = 'cmc-key';
      process.env.CMC_API_URL = 'https://custom-cmc.com';
      
      const config = await import('../src/config');
      
      expect(config.default.coingecko).toEqual({
        apiKey: 'coingecko-key',
        url: 'https://custom-coingecko.com',
      });
      
      expect(config.default.cmc).toEqual({
        apiKey: 'cmc-key',
        url: 'https://custom-cmc.com',
      });
    });
  });

  describe('deviation configuration', () => {
    beforeEach(() => {
      process.env.ASSETS = 'ethereum§0x123456789§BTC';
    });

    it('should use default deviation value when environment variable is not provided', async () => {
      const config = await import('../src/config');
      
      expect(config.default.deviationPermille).toBe(10);
    });

    it('should use provided deviation environment variable', async () => {
      process.env.DEVIATION_PERMILLE = '25';
      
      const config = await import('../src/config');
      
      expect(config.default.deviationPermille).toBe(25);
    });
  });
}); 
