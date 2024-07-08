import { interval } from 'rxjs';
import { createAsyncQueue, intoAsyncIterable } from '@repo/common';
import config, { ChainName } from './config';
import {
  extendOracleTtl,
  getLastRound as getLastSorobanRound,
  restoreOracle,
  updateOracle as updateSorobanOracle,
} from './oracles/soroban';
import {
  updateOracle as updateAlephiumOracle,
  getLastRound as getLastAlephiumRound,
} from './oracles/alephium';
import { fetchRandomValue } from './api';

async function main() {
  const queue = createAsyncQueue({ onError: (e) => console.error(e) });
  let lastRound: number;

  switch (config.chainName) {
    case ChainName.SOROBAN:
      await restoreOracle();
      await extendOracleTtl();
      setInterval(() => queue(extendOracleTtl), config.soroban.lifetimeInterval);
      lastRound = await getLastSorobanRound();
      break;
    case ChainName.ALEPHIUM:
      lastRound = await getLastAlephiumRound();
      break;
  }

  const ticker = interval(config.intervals.frequency);

  for await (const _ of intoAsyncIterable(ticker)) {
    const value = await fetchRandomValue();
    queue(async () => {
      if (value.round !== lastRound) {
        switch (config.chainName) {
          case ChainName.SOROBAN:
            await updateSorobanOracle(value);
            break;
          case ChainName.ALEPHIUM:
            await updateAlephiumOracle(value);
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
