import os from 'os';
import path from 'path';
import dotenv from 'dotenv';
import { TransactionBuilder } from '@btc-vision/transaction';
import { GqlParams } from './validation';

dotenv.config();

let assetsToParse = '';
let useGql = false;
let useLumina = false;

const assetSources = ['ASSETS', 'GQL_ASSETS', 'LUMINA_ASSETS'].filter((name) => process.env[name]);

if (assetSources.length !== 1) {
  console.error('Use exactly one of the ASSETS, GQL_ASSETS or LUMINA_ASSETS env variables');
  process.exit(1);
} else if (process.env.GQL_ASSETS) {
  assetsToParse = process.env.GQL_ASSETS;
  useGql = true;
} else if (process.env.LUMINA_ASSETS) {
  assetsToParse = process.env.LUMINA_ASSETS;
  useLumina = true;
} else {
  assetsToParse = process.env.ASSETS || '';
}

const assets = assetsToParse.split(';').map((str) => {
  let network = '';
  let address = '';
  let luminaKey = '';
  let symbol: string;
  let entries: string[];

  if (useLumina) {
    // LUMINA_ASSETS: <lumina key>§<symbol>[§<coingecko name>§<cmc name>§<allowed deviation>]
    [luminaKey, symbol, ...entries] = str.split('§').map((str) => str.trim());
    if (!luminaKey || !symbol) {
      console.error(`Invalid LUMINA_ASSETS entry "${str}", expected <lumina key>§<symbol>`);
      process.exit(1);
    }
  } else {
    [network, address, symbol, ...entries] = str
      .replace('-ibc-', '-ibc/')
      .split('§')
      .map((str) => str.trim());
    address = address.replace('ibc/', 'ibc-');
  }

  const currAsset = {
    network,
    address,
    symbol,
    luminaKey,
    coingeckoName: '',
    cmcName: '',
    allowedDeviation: 0.0,
    gqlParams: { FeedSelection: [] } as GqlParams,
  };

  if (entries.length > 1) {
    [currAsset.coingeckoName, currAsset.cmcName] = entries;

    if (currAsset.coingeckoName || currAsset.cmcName) {
      const allowedDeviation = parseFloat(entries[2]);
      if (!isNaN(allowedDeviation)) {
        currAsset.allowedDeviation = allowedDeviation;
      }
    }
  }

  if (entries.length > 3) {
    const gqlQuery = entries[3];
    if (gqlQuery) {
      try {
        currAsset.gqlParams = GqlParams.parse(JSON.parse(gqlQuery));
      } catch (err: unknown) {
        console.error('Error while parsing GQL asset string: ', err);
      }
    }
  }

  return currAsset;
});

const conditionalPairs = process.env.CONDITIONAL_ASSETS?.split(';').map((str) => {
  const [asset0, asset1] = str.split('-').map((s) => parseInt(s, 10));
  return [asset0, asset1] as const;
});

function parseLuminaAddress(value: string | undefined): `0x${string}` {
  const address = (value || '').trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(address) || /^0x0{40}$/.test(address)) {
    console.error(
      'LUMINA_ORACLE_V2_ADDRESS must be set to the DIAOracleV2 address on DIA Lasernet',
    );
    process.exit(1);
  }
  return address as `0x${string}`;
}

export enum ChainName {
  Kadena = 'kadena',
  Soroban = 'soroban',
  Alephium = 'alephium',
  Stacks = 'stacks',
  Opnet = 'opnet',
  Midnight = 'midnight',
}

export default {
  soroban: {
    rpcUrl: process.env.SOROBAN_BLOCKCHAIN_NODE || 'https://soroban-testnet.stellar.org:443',
    secretKey: process.env.SOROBAN_PRIVATE_KEY || '',
    contractId: process.env.SOROBAN_DEPLOYED_CONTRACT || '',
    maxRetryAttempts: 3,
    lifetimeInterval: 30 * 60 * 1000, // 30m
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
    networkId: process.env.MIDNIGHT_NETWORK_ID || 'preprod',
    indexerUrl:
      process.env.MIDNIGHT_INDEXER_URL ||
      'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWsUrl:
      process.env.MIDNIGHT_INDEXER_WS_URL ||
      'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    nodeUrl: process.env.MIDNIGHT_NODE_URL || 'wss://rpc.preprod.midnight.network',
    proofServerUrl: process.env.MIDNIGHT_PROOF_SERVER_URL || 'http://127.0.0.1:6300',
    seed: process.env.MIDNIGHT_SEED || '',
    contractAddress: process.env.MIDNIGHT_CONTRACT || '',
    privateStateDir:
      process.env.MIDNIGHT_PRIVATE_STATE_DIR || path.join(os.tmpdir(), 'midnight-level-db'),
    privateStatePassword:
      process.env.MIDNIGHT_PRIVATE_STATE_PASSWORD || 'Oracle-Private-State-Password-1!',
    syncCacheDir: process.env.MIDNIGHT_SYNC_CACHE_DIR || undefined,
    syncTimeoutMs: parseInt(process.env.MIDNIGHT_SYNC_TIMEOUT_SECONDS || '3600', 10) * 1000,
    // Resync when the wallet has not received an indexer update for this long; 0 disables.
    staleResyncMs: parseInt(process.env.MIDNIGHT_STALE_RESYNC_SECONDS || '900', 10) * 1000,
    maxRetryAttempts: 3,
    // Wait between retries: this, then twice this, ...
    retryDelayMs: parseInt(process.env.MIDNIGHT_RETRY_DELAY_SECONDS || '20', 10) * 1000,
  },

  chainName: (process.env.CHAIN_NAME as ChainName) || ChainName.Soroban,

  intervals: {
    frequency: parseInt(process.env.FREQUENCY_SECONDS || '120', 10) * 1000,
    mandatoryFrequency: parseInt(process.env.MANDATORY_FREQUENCY_SECONDS || '0', 10) * 1000,
  },

  api: {
    useGql,
    useLumina,
    assets,
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
    backupRpcUrl: process.env.LUMINA_BACKUP_RPC_URL || undefined,
    // Only validated when Lumina is the data source, so other setups need not set it.
    oracleV2Address: useLumina
      ? parseLuminaAddress(process.env.LUMINA_ORACLE_V2_ADDRESS)
      : ('0x0000000000000000000000000000000000000000' as const),
    // Values older than this are skipped; 0 disables the check.
    dataAgeTimeout: BigInt(process.env.DATA_AGE_TIMEOUT_SECONDS || '0'),
    // Decimals of the values stored in the Lumina DIAOracleV2 contract.
    decimals: parseInt(process.env.LUMINA_DECIMALS || '18', 10),
  },

  deviationPermille: parseInt(process.env.DEVIATION_PERMILLE || '10', 10),
  conditionalPairs: conditionalPairs || [],

  coingecko: {
    apiKey: process.env.COINGECKO_API_KEY || '',
    url: process.env.COINGECKO_API_URL || 'https://pro-api.coingecko.com',
  },
  cmc: {
    apiKey: process.env.CMC_API_KEY || '',
    url: process.env.CMC_API_URL || 'https://pro-api.coinmarketcap.com',
  },
};
