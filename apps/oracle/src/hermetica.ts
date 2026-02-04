import axios from 'axios';
import { getGraphqlAssetQuotation } from './api';

const RESERVE_URL = 'https://app.hermetica.fi/api/v1/usdh/backing';
const SUPPLY_URL = 'https://app.hermetica.fi/api/v1/usdh/supply';

interface ReserveResult {
  timestamp: number;
  liquid_stables_amount: string;
  btc_amount: string;
}

interface ReserveResponse {
  result: ReserveResult;
}

interface SupplyResponse {
  result: string;
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

  const reserveUsdValue = liquidStablesAmount * usdcPrice + btcAmount * btcPrice;
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
