import {
  ContractFunctionRevertedError,
  encodeErrorResult,
  parseAbi,
  type PublicClient,
} from 'viem';
import config from '../src/config';
import { getLuminaPrices } from '../src/lumina';

// Both Lasernet clients (primary and backup) share one readContract mock. The clients are created
// when lumina.ts loads, before this file's constants exist, so the mock is looked up per call.
const mockReadContract = jest.fn();
jest.mock('viem', () => ({
  ...jest.requireActual('viem'),
  createPublicClient: jest.fn(
    () =>
      ({
        readContract: (...args: unknown[]) => mockReadContract(...args),
      }) as unknown as PublicClient,
  ),
}));
const readContract = mockReadContract;

jest.mock('../src/config', () => ({
  __esModule: true,
  default: {
    lumina: {
      rpcUrl: 'http://primary',
      backupRpcUrl: undefined,
      source: 'intents',
      intentRegistryAddress: '0x5612599CF48032d7428399d5Fcb99eDcc75c06A7',
      intentType: 'OracleUpdate',
      oracleV2Address: '0x1111111111111111111111111111111111111111',
      dataAgeTimeout: 3600n,
      decimals: 18,
    },
  },
}));

const errorAbi = parseAbi([
  'error NoIntentForSymbol()',
  'error SignerNotAuthorized(address signer)',
]);
const revert = (
  errorName: 'NoIntentForSymbol' | 'SignerNotAuthorized',
  args?: readonly unknown[],
) =>
  new ContractFunctionRevertedError({
    abi: errorAbi,
    functionName: 'getLatestIntentByType',
    data: encodeErrorResult({ abi: errorAbi, errorName, args } as any),
  });

const now = () => BigInt(Math.floor(Date.now() / 1000));
const intent = (symbol: string, price: bigint, timestamp = now() - 30n) => ({
  intentType: 'OracleUpdate',
  version: '1.0',
  chainId: 1050n,
  nonce: 1n,
  expiry: now() + 3600n,
  symbol,
  price,
  timestamp,
  source: 'DIA',
  signature: '0x',
  signer: '0x000000000000000000000000000000000000dEaD',
});

describe('Lumina prices from the OracleIntentRegistry', () => {
  beforeEach(() => {
    readContract.mockReset();
    config.lumina.source = 'intents';
  });

  it('reads getLatestIntentByType("OracleUpdate", key) and scales the 18-decimal price', async () => {
    readContract.mockResolvedValueOnce(intent('BTC/USD', 71643028143977060000000n));

    const prices = await getLuminaPrices([{ symbol: 'BTC', luminaKey: 'BTC/USD' }]);

    expect(prices.get('BTC')).toBeCloseTo(71643.02814397706, 8);
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: '0x5612599CF48032d7428399d5Fcb99eDcc75c06A7',
        functionName: 'getLatestIntentByType',
        args: ['OracleUpdate', 'BTC/USD'],
      }),
    );
  });

  it('skips stale intents, missing symbols, revoked signers and mismatched symbols', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    readContract.mockImplementation(async ({ args: [, key] }: { args: [string, string] }) => {
      switch (key) {
        case 'ETH/USD':
          return intent('ETH/USD', 3123450000000000000000n, now() - 7200n);
        case 'XYZ/USD':
          throw revert('NoIntentForSymbol');
        case 'SOL/USD':
          throw revert('SignerNotAuthorized', ['0x00000000000000000000000000000000000BeeF0']);
        default:
          return intent('OTHER/USD', 1n);
      }
    });

    const prices = await getLuminaPrices(
      ['ETH', 'XYZ', 'SOL', 'BAD'].map((symbol) => ({ symbol, luminaKey: `${symbol}/USD` })),
    );

    expect(prices.size).toBe(0);
    const logged = errors.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged).toContain('ETH/USD is too old');
    expect(logged).toContain(
      'XYZ/USD from the DIA Lasernet OracleIntentRegistry: no "OracleUpdate" intent',
    );
    expect(logged).toContain('which is no longer an authorized signer');
    expect(logged).toContain('intent registry returned an intent for OTHER/USD');
    errors.mockRestore();
  });

  it('reads the DIAOracleV2 metacontract when LUMINA_SOURCE=metacontract', async () => {
    config.lumina.source = 'metacontract';
    readContract.mockResolvedValueOnce([71000000000000000000000n, now()]);

    const prices = await getLuminaPrices([{ symbol: 'BTC', luminaKey: 'BTC/USD' }]);

    expect(prices.get('BTC')).toBe(71000);
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'getValue', args: ['BTC/USD'] }),
    );
  });
});
