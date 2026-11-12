import { endpointPricedReserveUsd } from '../src/hermetica';

jest.mock('../src/config');
jest.mock('../src/api');

// The /usdh/backing response of 2026-11-12 20:00 UTC, the first with SATA in it.
const BACKING_2026_11_12 = {
  liquid_stables_amount: '1746388.8621',
  strc_amount: '10720.09122221',
  strc_in_usd: '1071580.3186',
  strc_usd_price: '99.9600',
  sata_amount: '2100.00000000',
  sata_in_usd: '205411.5000',
  sata_usd_price: '97.8150',
  btc_amount: '0.28933231',
  btc_in_usd: '20710.4125',
  btc_usd_price: '71580.0197',
  timestamp: 1794513600000,
};

describe('endpointPricedReserveUsd', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('counts every endpoint-priced leg, including SATA', () => {
    const strc = 10720.09122221 * 99.96;
    const sata = 2100 * 97.815;
    expect(endpointPricedReserveUsd(BACKING_2026_11_12)).toBeCloseTo(strc + sata, 6);
  });

  it('leaves stables and BTC to the DIA-priced terms', () => {
    const onlyDiaPriced = {
      liquid_stables_amount: '1000',
      btc_amount: '1',
      btc_usd_price: '70000',
      timestamp: 0,
    };
    expect(endpointPricedReserveUsd(onlyDiaPriced)).toBe(0);
  });

  it('keeps the reserve fully backed with SATA counted', () => {
    // DIA BTC and USDC at the backing timestamp, from the GraphQL feed the oracle uses.
    const btcPrice = 71626.98605908011;
    const usdcPrice = 0.9998479857524653;
    const supply = 3042387.86034247;
    const reserve =
      1746388.8621 * usdcPrice +
      0.28933231 * btcPrice +
      endpointPricedReserveUsd(BACKING_2026_11_12);
    expect(reserve / supply).toBeGreaterThan(1);
  });

  it('throws on a leg with no price instead of undercounting it', () => {
    const unpriced = { ...BACKING_2026_11_12, xyz_amount: '500' };
    expect(() => endpointPricedReserveUsd(unpriced)).toThrow(/reserve leg "xyz"/);
  });

  it('throws on a leg whose price does not parse', () => {
    const badPrice = { ...BACKING_2026_11_12, sata_usd_price: '' };
    expect(() => endpointPricedReserveUsd(badPrice)).toThrow(/reserve leg "sata"/);
  });
});
