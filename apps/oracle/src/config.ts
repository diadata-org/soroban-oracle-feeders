import dotenv from 'dotenv';
import { TransactionBuilder } from '@btc-vision/transaction';
import { AssetSource, parseAssets } from './assets';
import { parseAddress } from './utils';

export enum ChainName {
  Kadena = 'kadena',
  Soroban = 'soroban',
  Alephium = 'alephium',
  Stacks = 'stacks',
  Opnet = 'opnet',
  Midnight = 'midnight',
}

let source;
let assetsToParse;

dotenv.config();

if (process.env.LUMINA_ASSETS) {
  source = AssetSource.Lumina;
  assetsToParse = process.env.LUMINA_ASSETS;
} else if (process.env.ASSETS && !process.env.GQL_ASSETS) {
  source = AssetSource.Rest;
  assetsToParse = process.env.ASSETS;
} else if (!process.env.ASSETS && process.env.GQL_ASSETS) {
  source = AssetSource.Gql;
  assetsToParse = process.env.GQL_ASSETS;
} else {
  console.error('Use either ASSETS or GQL_ASSETS env variable');
  process.exit(1);
}

const conditionalPairs = process.env.CONDITIONAL_ASSETS?.split(';').map((str) => {
  const [asset0, asset1] = str.split('-').map((s) => parseInt(s, 10));
  return [asset0, asset1] as const;
});

const soroban = {
  rpcUrl: process.env.SOROBAN_BLOCKCHAIN_NODE || 'https://soroban-testnet.stellar.org:443',
  secretKey: process.env.SOROBAN_PRIVATE_KEY || '',
  contractId: process.env.SOROBAN_DEPLOYED_CONTRACT || '',
  maxRetryAttempts: 3,
  lifetimeInterval: 30 * 60 * 1000, // 30m
};

const kadena = {
  rpcUrl: process.env.KADENA_RPC_URL || 'https://api.testnet.chainweb.com',
  secretKey: process.env.KADENA_PRIVATE_KEY || '',
  publicKey: process.env.KADENA_PUBLIC_KEY || '',
  contract: process.env.KADENA_CONTRACT || 'free.dia-oracle',
  networkId: process.env.KADENA_NETWORK_ID || 'testnet04',
  chainId: process.env.KADENA_CHAIN_ID || '0',
  maxAssetsPerTx: parseInt(process.env.KADENA_MAX_ASSETS_PER_TX || '10', 10),
  maxRetryAttempts: 3,
};

const alephium = {
  rpcUrl: process.env.ALEPHIUM_RPC_URL || 'http://localhost:22973',
  secretKey: process.env.ALEPHIUM_PRIVATE_KEY || '',
  contract: process.env.ALEPHIUM_CONTRACT || '2AsrYbF4PhVtoinHawPzV8iqcwrj26SCE2ghNDkb5Cdm1',
  maxBatchSize: 10, // max number of prices to update in a single transaction
  maxRetryAttempts: 3,
};

const stacks = {
  rpcUrl: process.env.STACKS_RPC_URL,
  backupRpcUrl: process.env.STACKS_BACKUP_RPC_URL,
  contractName: process.env.STACKS_CONTRACT_NAME || 'dia-oracle',
  secretKey:
    process.env.STACKS_PRIVATE_KEY ||
    '753b7cc01a1a2e86221266a154af739463fce51219d97e4f856cd7200c3bd2a601',
  contract: process.env.STACKS_CONTRACT || 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
  feeRate: BigInt(process.env.STACKS_FEE_RATE || '100'),
  maxBatchSize: 10,
  maxRetryAttempts: 3,
};

const opnet = {
  rpcUrl: process.env.OPNET_RPC_URL || 'https://regtest.opnet.org',
  network: process.env.OPNET_NETWORK || '',
  backupRpcUrl: process.env.OPNET_BACKUP_RPC_URL,
  secretKey:
    process.env.OPNET_PRIVATE_KEY || 'cShTHPAqa5rX2p9GxN6QvwsFMnnhHLUx2WRE8ztNTWxqwBGWycH8',
  contract: process.env.OPNET_CONTRACT || 'bcrt1q39y3gw0zxaq0hgkr0x3m80tz504p5ta5l8j7y4',
  maxBatchSize: 10, // max number of prices to update in a single transaction
  maxRetryAttempts: 3,
  feeRate: parseInt(process.env.OPNET_FEE_RATE || '100', 10),
  priorityFee: BigInt(process.env.OPNET_PRIORITY_FEE || TransactionBuilder.MINIMUM_DUST),
};

const midnight = {
  network: process.env.MIDNIGHT_NETWORK || '2',
  maxRetryAttempts: 3,
  maxBatchSize: 10, // max number of prices to update in a single transaction
  secretKey: process.env.MIDNIGHT_PRIVATE_KEY,
  contractAddress: process.env.MIDNIGHT_CONTRACT_ADDRESS, //counter contract for tests
  indexer:
    process.env.MIDNIGHT_INDEXER || 'https://indexer.testnet-02.midnight.network/api/v1/graphql',
  indexerWS:
    process.env.MIDNIGHT_INDEXER_WS ||
    'wss://indexer.testnet-02.midnight.network/api/v1/graphql/ws',
  proofServer: process.env.MIDNIGHT_PROOF_SERVER || 'http://127.0.0.1:6300',
  node: process.env.MIDNIGHT_NODE || 'https://rpc.testnet-02.midnight.network',
};

export default {
  chain: {
    name: (process.env.CHAIN_NAME as ChainName) || ChainName.Soroban,
    soroban,
    kadena,
    alephium,
    stacks,
    opnet,
    midnight,
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
  stacks: {
    rpcUrl: process.env.STACKS_RPC_URL,
    backupRpcUrl: process.env.STACKS_BACKUP_RPC_URL,
    contractName: process.env.STACKS_CONTRACT_NAME || 'dia-oracle',
    secretKey:
      process.env.STACKS_PRIVATE_KEY ||
      '753b7cc01a1a2e86221266a154af739463fce51219d97e4f856cd7200c3bd2a601',
    contract: process.env.STACKS_CONTRACT || 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
    feeRate: BigInt(process.env.STACKS_FEE_RATE || '100'),
    maxBatchSize: 10,
    maxRetryAttempts: 3,
  },
  opnet: {
    rpcUrl: process.env.OPNET_RPC_URL || 'https://regtest.opnet.org',
    network: process.env.OPNET_NETWORK || '',
    backupRpcUrl: process.env.OPNET_BACKUP_RPC_URL,
    secretKey:
      process.env.OPNET_PRIVATE_KEY || 'cShTHPAqa5rX2p9GxN6QvwsFMnnhHLUx2WRE8ztNTWxqwBGWycH8',
    contract: process.env.OPNET_CONTRACT || 'bcrt1q39y3gw0zxaq0hgkr0x3m80tz504p5ta5l8j7y4',
    maxBatchSize: 10, // max number of prices to update in a single transaction
    maxRetryAttempts: 3,
    feeRate: parseInt(process.env.OPNET_FEE_RATE || '100', 10),
    priorityFee: BigInt(process.env.OPNET_PRIORITY_FEE || TransactionBuilder.MINIMUM_DUST),
  },
  midnight: {
    network: process.env.MIDNIGHT_NETWORK || '2',
    maxRetryAttempts: 3,
    maxBatchSize: 10, // max number of prices to update in a single transaction
    seed: process.env.MIDNIGHT_SEED || '',
    contractAddress: process.env.MIDNIGHT_CONTRACT_ADDRESS,
    indexer:
      process.env.MIDNIGHT_INDEXER || 'https://indexer.testnet-02.midnight.network/api/v1/graphql',
    indexerWS:
      process.env.MIDNIGHT_INDEXER_WS ||
      'wss://indexer.testnet-02.midnight.network/api/v1/graphql/ws',
    proofServer: process.env.MIDNIGHT_PROOF_SERVER || 'http://127.0.0.1:6300',
    node: process.env.MIDNIGHT_NODE || 'https://rpc.testnet-02.midnight.network',
  },

  chainName: (process.env.CHAIN_NAME as ChainName) || ChainName.Soroban,

  intervals: {
    frequency: parseInt(process.env.FREQUENCY_SECONDS || '120', 10) * 1000,
    mandatoryFrequency: parseInt(process.env.MANDATORY_FREQUENCY_SECONDS || '0', 10) * 1000,
  },
  assets: {
    source,
    cfg: parseAssets(source, assetsToParse),
  },
  api: {
    http: {
      url: 'https://api.diadata.org/v1/assetQuotation',
    },
    gql: {
      url: 'https://api.diadata.org/graphql/query',
      windowSize: parseInt(process.env.GQL_WINDOW_SIZE || '120', 10),
      methodology: process.env.GQL_METHODOLOGY || 'vwap',
    },
  },
  lumina: {
    rpcUrl: process.env.LUMINA_RPC_URL || 'https://rpc.diadata.org',
    backupRpcUrl: process.env.LUMINA_BACKUP_RPC_URL,
    oracleV2Address: parseAddress(process.env.LUMINA_ORACLE_V2_ADDRESS),
    dataAgeTimeout: BigInt(process.env.DATA_AGE_TIMEOUT_SECONDS || '0'),
  },
  guardian: {
    coingecko: {
      apiKey: process.env.COINGECKO_API_KEY || '',
      url: process.env.COINGECKO_API_URL || 'https://pro-api.coingecko.com',
    },
    cmc: {
      apiKey: process.env.CMC_API_KEY || '',
      url: process.env.CMC_API_URL || 'https://pro-api.coinmarketcap.com',
    },
  },
  deviationPermille: parseInt(process.env.DEVIATION_PERMILLE || '10', 10),
  conditionalPairs: conditionalPairs || [],
};
