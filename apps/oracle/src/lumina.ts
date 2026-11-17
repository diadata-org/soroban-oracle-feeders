// Lumina data source: reads prices from DIA Lasernet instead of the DIA API. By default from the
// OracleIntentRegistry (`getLatestIntentByType`), the signed intents DIA's attestors publish; with
// LUMINA_SOURCE=metacontract from the DIAOracleV2 metacontract (`getValue`) as before.
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  defineChain,
  formatUnits,
  http,
  parseAbi,
} from 'viem';
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

// IOracleIntentRegistry and OracleIntentUtils.OracleIntent in diadata-org/Spectra-interoperability.
// The errors let viem name a revert instead of reporting raw bytes.
const oracleIntentRegistryAbi = parseAbi([
  'struct OracleIntent { string intentType; string version; uint256 chainId; uint256 nonce; uint256 expiry; string symbol; uint256 price; uint256 timestamp; string source; bytes signature; address signer; }',
  'function getLatestIntentByType(string intentType, string symbol) external view returns (OracleIntent intent)',
  'error NoIntentForSymbol()',
  'error IntentNotFound()',
  'error SignerNotAuthorized(address signer)',
]);

type LuminaValue = { value: bigint; timestamp: bigint };

async function withBackup<T>(key: string, read: (c: typeof client) => Promise<T>): Promise<T> {
  try {
    return await read(client);
  } catch (err) {
    // A revert is the contract's answer, not an RPC failure: asking the backup RPC changes nothing.
    if (!backupClient || isRevert(err)) {
      throw err;
    }
    console.log(`Using backup DIA Lasernet RPC to retrieve price data for ${key}`);
    return read(backupClient);
  }
}

const isRevert = (err: unknown) =>
  err instanceof BaseError && err.walk((e) => e instanceof ContractFunctionRevertedError) !== null;

// The registry reverts when it has no usable intent for a symbol; say which case it was.
function describeRevert(err: unknown): string | undefined {
  if (!(err instanceof BaseError)) {
    return undefined;
  }
  const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
  if (!(revert instanceof ContractFunctionRevertedError)) {
    return undefined;
  }
  switch (revert.data?.errorName) {
    case 'NoIntentForSymbol':
    case 'IntentNotFound':
      return `no "${config.lumina.intentType}" intent registered for it`;
    case 'SignerNotAuthorized':
      return `its latest intent was signed by ${String(revert.data.args?.[0])}, which is no longer an authorized signer`;
    default:
      return revert.shortMessage;
  }
}

async function readLatest(key: string): Promise<LuminaValue> {
  if (config.lumina.source === 'metacontract') {
    const [value, timestamp] = await withBackup(key, (c) =>
      c.readContract({
        address: config.lumina.oracleV2Address,
        abi: diaOracleV2MetaAbi,
        functionName: 'getValue',
        args: [key],
      }),
    );
    return { value, timestamp };
  }
  const intent = await withBackup(key, (c) =>
    c.readContract({
      address: config.lumina.intentRegistryAddress,
      abi: oracleIntentRegistryAbi,
      functionName: 'getLatestIntentByType',
      args: [config.lumina.intentType, key],
    }),
  );
  // The registry stores an intent under the symbol it was signed for; guard against a mismatch.
  if (intent.symbol !== key) {
    throw new Error(`intent registry returned an intent for ${intent.symbol}`);
  }
  return { value: intent.price, timestamp: intent.timestamp };
}

export type LuminaAsset = { symbol: string; luminaKey: string };

const sourceName = () =>
  config.lumina.source === 'metacontract' ? 'metacontract' : 'OracleIntentRegistry';

// Returns prices keyed by asset symbol, like the other data sources, so the rest of the update
// pipeline (deviation checks, guardians, `<symbol>/USD` oracle keys) stays unchanged.
export async function getLuminaPrices(assets: readonly LuminaAsset[]) {
  const results = await Promise.allSettled(assets.map((a) => readLatest(a.luminaKey)));
  const prices = new Map<string, number>();
  const now = BigInt(Math.floor(Date.now() / 1000));

  for (const [index, result] of results.entries()) {
    const { symbol, luminaKey } = assets[index];

    if (result.status === 'rejected') {
      const reason = describeRevert(result.reason);
      if (reason) {
        console.error(
          `No price for ${luminaKey} from the DIA Lasernet ${sourceName()}: ${reason}`,
        );
      } else {
        // viem's errors carry the whole request and ABI; its short message says what failed.
        const message =
          result.reason instanceof BaseError ? result.reason.shortMessage : String(result.reason);
        console.error(
          `Failed to retrieve quotation data for ${luminaKey} from DIA Lasernet: ${message}`,
        );
      }
      continue;
    }

    const { value, timestamp } = result.value;
    if (!value || !timestamp) {
      console.error(`Value not found in the DIA Lasernet ${sourceName()}:`, luminaKey);
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
