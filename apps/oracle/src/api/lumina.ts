import { createPublicClient, defineChain, formatUnits, http, parseAbi } from 'viem';
import config from '../config.js';

const diaLasernet = defineChain({
  id: 1050,
  name: 'DIA Lasernet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: ['https://rpc.diadata.org'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Explorer',
      url: 'https://explorer.diadata.org',
    },
  },
  contracts: {},
});

const client = createPublicClient({
  chain: diaLasernet,
  transport: http(config.lumina.rpcUrl),
});

const backupClient = createPublicClient({
  chain: diaLasernet,
  transport: http(config.lumina.backupRpcUrl),
});

const diaOracleV2MetaAbi = parseAbi([
  'function getValue(string memory key) external view returns (uint128, uint128)',
]);

async function getValue(key: string) {
  const params = {
    address: config.lumina.oracleV2Address,
    abi: diaOracleV2MetaAbi,
    functionName: 'getValue',
    args: [key],
  } as const;

  let result: readonly [bigint, bigint];

  try {
    result = await client.readContract(params);
  } catch (err) {
    if (config.lumina.backupRpcUrl) {
      console.log(`Using backup DIA Lasernet RPC to retrieve price data for ${key}`);
      result = await backupClient.readContract(params);
    } else {
      throw err;
    }
  }

  return result;
}

export async function getAssetPrices(assets: readonly string[]) {
  const values = await Promise.allSettled(assets.map(getValue));
  const prices = new Map<string, number>();

  for (const [index, result] of values.entries()) {
    const key = assets[index];

    if (result.status === 'rejected') {
      console.error(
        `Failed to retrieve quotation data for ${key} from DIA Lasernet:`,
        result.reason,
      );
      continue;
    }

    const [value, timestamp] = result.value;
    if (!value || !timestamp) {
      console.error('Value not found in DIAOracleMetaV2 storage:', key);
      continue;
    }

    const { dataAgeTimeout } = config.lumina;
    const now = BigInt(Math.floor(Date.now() / 1000));

    if (dataAgeTimeout && now > timestamp + dataAgeTimeout) {
      console.error(`Value retrieved from DIA Lasernet for ${key} is too old: ${timestamp}`);
      continue;
    }

    const price = Number(formatUnits(value, 8));
    prices.set(assets[index], price);
  }

  return prices;
}
