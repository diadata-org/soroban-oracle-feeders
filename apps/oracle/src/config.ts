import dotenv from 'dotenv';
import { GqlParams } from './validation';

dotenv.config();

let assetsToParse = '';
let useGql = false;

if (process.env.ASSETS && !process.env.GQL_ASSETS) {
  assetsToParse = process.env.ASSETS;
} else if (!process.env.ASSETS && process.env.GQL_ASSETS) {
  assetsToParse = process.env.GQL_ASSETS;
  useGql = true;
} else {
  console.error('Use either ASSETS or GQL_ASSETS env variable');
  process.exit(1);
}

const assets = assetsToParse.split(';').map((str) => {
  const [network, address, symbol, ...entries] = str
    .replace('-ibc-', '-ibc/')
    .split('-')
    .map((str) => str.trim());

  const currAsset = {
    network,
    address: address.replace('ibc/', 'ibc-'),
    symbol,
    gqlParams: { FeedSelection: [] } as GqlParams,
  };

  if (entries.length && useGql) {
    const gqlQuery = entries.join('-');
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

export enum ChainName {
  KADENA = 'kadena',
  SOROBAN = 'soroban',
  ALEPHIUM = 'alephium',
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

  chainName: (process.env.CHAIN_NAME as ChainName) || ChainName.SOROBAN,

  intervals: {
    frequency: parseInt(process.env.FREQUENCY_SECONDS || '120', 10) * 1000,
    mandatoryFrequency: parseInt(process.env.MANDATORY_FREQUENCY_SECONDS || '0', 10) * 1000,
  },
  api: {
    useGql,
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
  deviationPermille: parseInt(process.env.DEVIATION_PERMILLE || '10', 10),
  conditionalPairs: conditionalPairs || [],
};
