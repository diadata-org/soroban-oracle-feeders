import axios from 'axios';
import { getGraphqlAssetQuotation } from './api';

const RESERVE_URL = 'https://app.hermetica.fi/api/v1/usdh/backing';
const SUPPLY_URL = 'https://app.hermetica.fi/api/v1/usdh/supply';

// Reserve legs DIA prices itself. Every other `<leg>_amount` in the backing response is priced
// at Hermetica's own `<leg>_usd_price`, which is how STRC has been priced since it was added.
// Hermetica adds reserve legs without notice (STRC in April 2026, Strive's SATA on 2026-11-12),
// so legs are discovered from the response rather than listed here: a hard-coded list read the
// SATA-backed reserve as 0.933 and the CoinGecko guardian then dropped USDh from every update.
const DIA_PRICED_LEGS = new Set(['liquid_stables', 'btc']);

interface ReserveResult {
  timestamp: number;
  liquid_stables_amount: string;
  btc_amount: string;
  /** Endpoint-priced legs: `<leg>_amount`, `<leg>_usd_price`, `<leg>_in_usd` (e.g. strc, sata). */
  [field: string]: string | number;
}

interface ReserveResponse {
  result: ReserveResult;
}

interface SupplyResponse {
  result: string;
}

/**
 * USD value of the reserve legs Hermetica prices itself (every leg except stables and BTC).
 * Throws on a leg with no usable price: undercounting the reserve would publish a USDh price
 * below peg, while a throw leaves USDh un-updated, which the staleness monitoring catches.
 */
export function endpointPricedReserveUsd(backing: ReserveResult): number {
  let total = 0;
  for (const field of Object.keys(backing)) {
    if (!field.endsWith('_amount')) continue;
    const leg = field.slice(0, -'_amount'.length);
    if (DIA_PRICED_LEGS.has(leg)) continue;

    const amount = parseFloat(String(backing[field]));
    const price = parseFloat(String(backing[`${leg}_usd_price`] ?? 'NaN'));
    if (!Number.isFinite(amount) || !Number.isFinite(price)) {
      throw new Error(
        `Hermetica backing has reserve leg "${leg}" without a usable ${leg}_usd_price ` +
          `(amount ${backing[field]}, price ${backing[`${leg}_usd_price`]})`,
      );
    }
    const legUsd = amount * price;
    console.log(
      `${leg.toUpperCase()} amount: ${amount}, USD price (from backing): ${price}, reserve USD: ${legUsd}`,
    );
    total += legUsd;
  }
  return total;
}

export async function getHermeticaUsdhPrice(): Promise<number> {
  console.log('get USDh price from Hermetica API');

  console.log(`get Hermetica reserve data from ${RESERVE_URL}`);
  const reserveResponse = await axios.get<ReserveResponse>(RESERVE_URL);
  const reserveData = reserveResponse.data;
  console.log(`Reserve data: ${JSON.stringify(reserveData, null, 2)}`);

  console.log(`get Hermetica supply data from ${SUPPLY_URL}`);
  const supplyResponse = await axios.get<SupplyResponse>(SUPPLY_URL);
  const supplyData = supplyResponse.data;
  console.log(`Supply data: ${JSON.stringify(supplyData, null, 2)}`);

  // Get timestamp from reserve data (convert from ms to seconds)
  const timestamp = reserveData.result.timestamp / 1000;
  console.log(`Fetching DIA prices at timestamp: ${timestamp}`);
   const [btcPrice, usdcPrice] = await Promise.all([
    getGraphqlAssetQuotation('Bitcoin', '0x0000000000000000000000000000000000000000', undefined, timestamp),
    getGraphqlAssetQuotation('Ethereum', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', undefined, timestamp),
  ]);

  console.log(`BTC price at timestamp from dia gql: ${btcPrice}`);
  console.log(`USDC price at timestamp from dia gql: ${usdcPrice}`);

  const supply = parseFloat(supplyData.result);
  const liquidStablesAmount = parseFloat(reserveData.result.liquid_stables_amount);
  const btcAmount = parseFloat(reserveData.result.btc_amount);

  console.log(`Supply: ${supply}`);
  console.log(`Liquid stables amount: ${liquidStablesAmount}`);
  console.log(`BTC amount: ${btcAmount}`);

  const reserveUsdValue =
    liquidStablesAmount * usdcPrice + btcAmount * btcPrice + endpointPricedReserveUsd(reserveData.result);
  console.log(`Reserve USD value: ${reserveUsdValue}`);

  const usdhCalculatedPrice = reserveUsdValue/supply;

  console.log(`Calculated USDh price before min check: ${usdhCalculatedPrice.toFixed(8)} USD`);

  const usdhPrice = Math.min(1, usdhCalculatedPrice);

  console.log(`Calculated USDh price: ${usdhPrice.toFixed(8)} USD`);

  return usdhPrice;
}

export function isHermeticaUsdh(address: string): boolean {
  return address.includes('usdh-token-v1');
}
