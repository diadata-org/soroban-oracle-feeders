// Lumina data source: reads prices from a DIAOracleV2 contract on DIA Lasernet instead of the DIA
// API. Ported from the `midnight_deliverable` branch (apps/oracle/src/api/lumina.ts).
import { createPublicClient, defineChain, formatUnits, http, parseAbi } from 'viem';
import config from './config';

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

const backupClient = config.lumina.backupRpcUrl
  ? createPublicClient({ chain: diaLasernet, transport: http(config.lumina.backupRpcUrl) })
  : undefined;

const diaOracleV2MetaAbi = parseAbi([
  'function getValue(string memory key) external view returns (uint128, uint128)',
]);

async function getValue(key: string): Promise<readonly [bigint, bigint]> {
  const params = {
    address: config.lumina.oracleV2Address,
    abi: diaOracleV2MetaAbi,
    functionName: 'getValue',
    args: [key],
  } as const;

  try {
    return await client.readContract(params);
  } catch (err) {
    if (!backupClient) {
      throw err;
    }
    console.log(`Using backup DIA Lasernet RPC to retrieve price data for ${key}`);
    return backupClient.readContract(params);
  }
}

export type LuminaAsset = { symbol: string; luminaKey: string };

// Returns prices keyed by asset symbol, like the other data sources, so the rest of the update
// pipeline (deviation checks, guardians, `<symbol>/USD` oracle keys) stays unchanged.
export async function getLuminaPrices(assets: readonly LuminaAsset[]) {
  const results = await Promise.allSettled(assets.map((a) => getValue(a.luminaKey)));
  const prices = new Map<string, number>();
  const now = BigInt(Math.floor(Date.now() / 1000));

  for (const [index, result] of results.entries()) {
    const { symbol, luminaKey } = assets[index];

    if (result.status === 'rejected') {
      console.error(
        `Failed to retrieve quotation data for ${luminaKey} from DIA Lasernet:`,
        result.reason,
      );
      continue;
    }

    const [value, timestamp] = result.value;
    if (!value || !timestamp) {
      console.error('Value not found in DIAOracleV2 storage:', luminaKey);
      continue;
    }

    const { dataAgeTimeout } = config.lumina;
    if (dataAgeTimeout && now > timestamp + dataAgeTimeout) {
      console.error(`Value retrieved from DIA Lasernet for ${luminaKey} is too old: ${timestamp}`);
      continue;
    }

    // Lumina values have 18 decimals (the DIA API feeds used 8). Converting here keeps the price a
    // plain USD number, so the oracle adapters apply their own on-chain scaling as before.
    prices.set(symbol, Number(formatUnits(value, config.lumina.decimals)));
  }

  return prices;
}
