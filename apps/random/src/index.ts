import { interval } from 'rxjs';
import { createAsyncQueue, intoAsyncIterable } from '@repo/common';
import config, { ChainName } from './config.js';
import {
  extendOracleTtl,
  getLastRound as getLastSorobanRound,
  restoreOracle,
  updateOracle as updateSorobanOracle,
} from './oracles/soroban.js';
import {
  updateOracle as updateAlephiumOracle,
  getLastRound as getLastAlephiumRound,
} from './oracles/alephium.js';
import {
  updateOracle as updateStacksOracle,
  getLastRound as getLastStacksRound,
} from './oracles/stacks.js';
import { fetchRandomValue } from './api.js';
import { setupNock } from '../test/setupNock.js';

async function main() {
  const queue = createAsyncQueue({ onError: (e) => console.error(e) });
  let lastRound: number;

  if (process.env.RUN_MOCK == 'true') {
    // e2e test
    setupNock();
  }

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
    case ChainName.STACKS:
      lastRound = await getLastStacksRound();
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
          case ChainName.STACKS:
            await updateStacksOracle(value);
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
