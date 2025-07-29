import { type Asset, AssetSource } from '../assets.js';
import config from '../config.js';
import { getAssetQuotation, getGraphqlAssetQuotation } from './dia.js';
import * as lumina from './lumina.js';

export async function getAssetPrices(assets: readonly Asset[]) {
  if (config.assets.source === AssetSource.Lumina) {
    const keys = assets.map((a) => a.luminaKey);
    return lumina.getAssetPrices(keys);
  }

  const useGql = config.assets.source === AssetSource.Gql;

  const fetch = useGql
    ? (a: Asset) => getGraphqlAssetQuotation(a.network, a.address, a.gqlParams)
    : (a: Asset) => getAssetQuotation(a.network, a.address);

  const reqs = assets.map(async (asset) => {
    const price = await fetch(asset);
    return { key: asset.symbol, value: price };
  });

  const prices = new Map<string, number>();

  for (const result of await Promise.allSettled(reqs)) {
    if (result.status === 'rejected') {
      console.error(`Failed to retrieve quotation data from DIA: ${result.reason}`);
      continue;
    }

    const { key, value } = result.value;
    prices.set(key, value);
  }

  return prices;
}
