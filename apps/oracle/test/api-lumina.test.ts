import { getAssetPrices, Asset } from '../src/api';
import { getLuminaPrices } from '../src/lumina';
import { getHermeticaUsdhPrice } from '../src/hermetica';

jest.mock('../src/config', () => ({
  __esModule: true,
  default: {
    api: { useLumina: true, useGql: false, gql: { methodology: 'vwap', windowSize: 120 } },
  },
}));
jest.mock('../src/lumina', () => ({ getLuminaPrices: jest.fn() }));
jest.mock('../src/hermetica', () => ({
  ...jest.requireActual('../src/hermetica'),
  getHermeticaUsdhPrice: jest.fn(),
}));

const asset = (luminaKey: string, symbol: string): Asset => ({
  network: '',
  address: '',
  symbol,
  luminaKey,
  gqlParams: { FeedSelection: [] },
});

describe('getAssetPrices with LUMINA_ASSETS', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads Lumina assets from Lumina and keeps USDh on the Hermetica calculation', async () => {
    (getLuminaPrices as jest.Mock).mockResolvedValue(new Map([['BTC', 104_000.5]]));
    (getHermeticaUsdhPrice as jest.Mock).mockResolvedValue(0.9998);

    const prices = await getAssetPrices([
      asset('BTC/USD', 'BTC'),
      asset('SP000000000000000000002Q6VF78.usdh-token-v1', 'USDh'),
    ]);

    expect(getLuminaPrices).toHaveBeenCalledWith([{ symbol: 'BTC', luminaKey: 'BTC/USD' }]);
    expect(getHermeticaUsdhPrice).toHaveBeenCalledTimes(1);
    expect(prices).toEqual(
      new Map([
        ['BTC', 104_000.5],
        ['USDh', 0.9998],
      ]),
    );
  });

  it('still returns the Lumina prices when Hermetica fails', async () => {
    (getLuminaPrices as jest.Mock).mockResolvedValue(new Map([['STX', 0.61]]));
    (getHermeticaUsdhPrice as jest.Mock).mockRejectedValue(new Error('backing endpoint down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const prices = await getAssetPrices([
      asset('STX/USD', 'STX'),
      asset('SP000000000000000000002Q6VF78.usdh-token-v1', 'USDh'),
    ]);

    expect(prices).toEqual(new Map([['STX', 0.61]]));
  });
});
