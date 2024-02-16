import { interval, map, merge } from 'rxjs';
import { createAsyncQueue, intoAsyncIterable } from '@repo/common';
import { Asset, getAssetPrices } from './api';
import config from './config';
import { extendOracleTtl, restoreOracle, updateOracle } from './oracle';

function checkDeviation(oldPrice: number, newPrice: number) {
  const deviation = config.deviationPermille / 1000;
  return (
    newPrice > 1e-8 &&
    (newPrice > oldPrice * (1 + deviation) || newPrice < oldPrice * (1 - deviation))
  );
}

async function update(published: Map<string, number>, prices: Map<string, number>) {
  const filtered = [...prices.entries()].filter((entry, index) => {
    const [symbol, price] = entry;

    for (const [asset0, asset1] of config.conditionalPairs) {
      if (asset1 === index) {
        const { symbol: key } = config.api.assets[asset0];
        const oldPrice = published.get(key) || 0;
        const newPrice = prices.get(key) || 0;

        if (checkDeviation(oldPrice, newPrice)) {
          return true;
        }
      }
    }

    return checkDeviation(published.get(symbol) || 0, price);
  });

  const updated = new Map(published);

  if (filtered.length) {
    const keys = Array<string>(filtered.length);
    const values = Array<number>(filtered.length);

    for (const [i, [key, value]] of filtered.entries()) {
      updated.set(key, value);
      keys[i] = key + '/USD';
      values[i] = Math.floor(value * 100_000_000);
    }

    await updateOracle(keys, values);
    console.log(Object.fromEntries(updated));
  } else {
    console.log('No update necessary');
  }

  return updated;
}

async function main() {
  await restoreOracle();
  await extendOracleTtl();

  const queue = createAsyncQueue({ onError: (e) => console.error(e) });
  setInterval(() => queue(extendOracleTtl), config.soroban.lifetimeInterval);

  let published = new Map<string, number>();

  const executeUpdate = async (assets: Asset[]) => {
    const prices = await getAssetPrices(assets);
    if (prices.size) {
      queue(async () => {
        published = await update(published, prices);
      });
    }
  };

  const ticker = interval(config.intervals.frequency);

  if (config.intervals.mandatoryFrequency > 0) {
    const mandatoryAssets = config.api.assets.filter((_, index) => {
      return !config.conditionalPairs.find(
        ([asset0, asset1]) => index === asset0 || index === asset1,
      );
    });

    const mandatoryTicker = interval(config.intervals.mandatoryFrequency);
    const combined = merge(ticker.pipe(map(() => false)), mandatoryTicker.pipe(map(() => true)));

    for await (const isMandatory of intoAsyncIterable(combined)) {
      if (isMandatory) {
        await executeUpdate(mandatoryAssets);
      } else {
        await executeUpdate(config.api.assets);
      }
    }
  } else {
    for await (const _ of intoAsyncIterable(ticker)) {
      await executeUpdate(config.api.assets);
    }
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
