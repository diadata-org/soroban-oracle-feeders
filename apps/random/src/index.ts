import { interval } from 'rxjs';
import { createAsyncQueue, intoAsyncIterable } from '@repo/common';
import config, { ChainName } from './config';
import { extendOracleTtl, getLastRound, restoreOracle, updateOracle } from './oracle';
import { fetchRandomValue } from './api';

async function main() {
  const queue = createAsyncQueue({ onError: (e) => console.error(e) });

  if (config.chainName === ChainName.SOROBAN) {
    await restoreOracle();
    await extendOracleTtl();
    setInterval(() => queue(extendOracleTtl), config.soroban.lifetimeInterval);
  }

  let lastRound = await getLastRound();
  const ticker = interval(config.intervals.frequency);

  for await (const _ of intoAsyncIterable(ticker)) {
    const value = await fetchRandomValue();
    queue(async () => {
      if (value.round !== lastRound) {
        switch (config.chainName) {
          case ChainName.SOROBAN:
            await updateOracle(value);
            break;
        }
        lastRound = value.round;
        console.log(value);
      } else {
        console.log('No update necessary');
      }
    });
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
