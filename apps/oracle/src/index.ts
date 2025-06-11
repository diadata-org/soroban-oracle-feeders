import { interval, map, merge } from 'rxjs';
import { createAsyncQueue, intoAsyncIterable } from '@repo/common';
import { getAssetPrices } from './api';
import type { Asset } from './assets';
import config, { ChainName } from './config';
import { getCmcPrice, getCoingeckoPrice } from './guardian';
import {
  extendOracleTtl,
  restoreOracle,
  updateOracle as updateSorobanOracle,
} from './oracles/soroban';
import { updateOracle as updateKadenaOracle } from './oracles/kadena';
import { updateOracle as updateAlephiumOracle } from './oracles/alephium';
import { updateOracle as updateStacksOracle } from './oracles/stacks';
import { updateOracle as updateOpNetOracle } from './oracles/opnet';
import { updateOracle as updateMidnightOracle } from './oracles/midnight';
import { setupNock } from '../test/setupNock';

export function checkDeviation(oldPrice: number, newPrice: number) {
  const deviation = config.deviationPermille / 1000;
  return (
    newPrice > 1e-8 &&
    (newPrice > oldPrice * (1 + deviation) || newPrice < oldPrice * (1 - deviation))
  );
}

export async function update(published: Map<string, number>, prices: Map<string, number>) {
  const filtered = [...prices.entries()].filter((entry, index) => {
    const [symbol, price] = entry;

    for (const [asset0, asset1] of config.conditionalPairs) {
      if (asset1 === index) {
        const { symbol: key } = config.assets.cfg[asset0];
        const oldPrice = published.get(key) || 0;
        const newPrice = prices.get(key) || 0;

        if (checkDeviation(oldPrice, newPrice)) {
          return true;
        }
      }
    }

    return checkDeviation(published.get(symbol) || 0, price);
  });

  const updateCollector = new Map<string, number>();
  const priceCollector = new Map(published);

  for (const [symbol, price] of filtered) {
    const asset = config.assets.cfg.find((a) => a.symbol === symbol)!;
    const externalPrices = [];

    if (asset.coingeckoName) {
      try {
        const coingeckoPrice = await getCoingeckoPrice(asset.coingeckoName);
        externalPrices.push(coingeckoPrice);
        console.log(`Coingecko price for ${asset.symbol}: ${coingeckoPrice}`);
      } catch (err: unknown) {
        console.error(`Error retrieving coingecko information for ${symbol}:`, err);
      }
    }
    if (asset.cmcName) {
      try {
        const cmcPrice = await getCmcPrice(asset.cmcName);
        externalPrices.push(cmcPrice);
        console.log(`CMC price for ${asset.symbol}: ${cmcPrice}`);
      } catch (err: unknown) {
        console.error(`Error retrieving CMC information for ${symbol}:`, err);
      }
    }

    if (externalPrices.length) {
      const matched = externalPrices.some((guardianPrice) => {
        return Math.abs(guardianPrice - price) / guardianPrice <= asset.allowedDeviation;
      });

      if (!matched) {
        console.log(`Error: No guardian match found for asset ${symbol} with price ${price}!`);
        continue;
      }
    } else if (asset.coingeckoName || asset.cmcName) {
      console.error('Error: None of the guardians returned a valid result"');
      continue;
    }

    updateCollector.set(symbol, price);

    console.log(
      `Entering deviation based update zone for old price ${
        published.get(symbol) ?? 0
      } of asset ${symbol}. New price: ${price}`,
    );
  }

  if (updateCollector.size) {
    const keys: string[] = [];
    const values: number[] = [];

    for (const [key, value] of updateCollector.entries()) {
      priceCollector.set(key, value);
      keys.push(key + '/USD');
      values.push(value);
    }

    switch (config.chain.name) {
      case ChainName.Kadena:
        await updateKadenaOracle(keys, values);
        break;
      case ChainName.Soroban:
        await updateSorobanOracle(keys, values);
        break;
      case ChainName.Alephium:
        await updateAlephiumOracle(keys, values);
        break;
      case ChainName.Stacks:
        updateStacksOracle(keys, values);
        break;
      case ChainName.Opnet:
        await updateOpNetOracle(keys, values);
        break;
      case ChainName.Midnight:
        await updateMidnightOracle(keys, values);
        break;
    }
    console.log(Object.fromEntries(priceCollector));
  } else {
    console.log('No update necessary');
  }

  return priceCollector;
}

async function main() {
  const queue = createAsyncQueue({ onError: (e) => console.error(e) });

  if (process.env.RUN_MOCK == 'true') {
    // e2e test
    setupNock();
  }

  if (config.chain.name === ChainName.Soroban) {
    // soroban specific
    await restoreOracle();
    await extendOracleTtl();
    setInterval(() => queue(extendOracleTtl), config.chain.soroban.lifetimeInterval);
  }

  let published = new Map<string, number>();

  const executeUpdate = async (assets: Asset[], isMandatory = false) => {
    const prices = await getAssetPrices(assets);

    if (prices.size) {
      queue(async () => {
        if (isMandatory) {
          const emptyMap = new Map<string, number>();
          published = await update(emptyMap, prices);
        } else {
          published = await update(published, prices);
        }
      });
    }
  };

  const ticker = interval(config.intervals.frequency);

  if (config.intervals.mandatoryFrequency > 0) {
    const mandatoryAssets = config.assets.cfg.filter((_, index) => {
      return !config.conditionalPairs.find(
        ([asset0, asset1]) => index === asset0 || index === asset1,
      );
    });

    const mandatoryTicker = interval(config.intervals.mandatoryFrequency);
    const combined = merge(ticker.pipe(map(() => false)), mandatoryTicker.pipe(map(() => true)));

    for await (const isMandatory of intoAsyncIterable(combined)) {
      const assets = isMandatory ? mandatoryAssets : config.assets.cfg;
      await executeUpdate(assets, isMandatory);
    }
  } else {
    for await (const _ of intoAsyncIterable(ticker)) {
      await executeUpdate(config.assets.cfg);
    }
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
