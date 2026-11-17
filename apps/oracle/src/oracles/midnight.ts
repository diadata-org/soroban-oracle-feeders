import {
  MIDNIGHT_BATCH_SIZE,
  MidnightOracleClient,
  MidnightOracleValue,
  connectMidnightOracle,
} from '@repo/common';
import config, { ChainName } from '../config';

let client: Promise<MidnightOracleClient>;

if (config.chainName === ChainName.Midnight) {
  init();
}

export function init() {
  client = connectMidnightOracle(config.midnight);
}

type Entry = [string, MidnightOracleValue];

// How many other layouts of a batch to try after the node rejects one with custom error 231.
const MAX_ALTERNATIVE_LAYOUTS = 3;

/**
 * The full-size layouts to try for one batch, first one first.
 *
 * The contract takes exactly MIDNIGHT_BATCH_SIZE entries. A short batch is filled with other entries
 * of the same update round (the same values and timestamp, so writing them twice is harmless) rather
 * than its last entry repeated; only when the round as a whole is too small do the batch's own entries
 * repeat, in turn. Each further layout rotates the filler and the order of entries, so the
 * transaction's size and cost differ a little from the previous one.
 */
export function batchLayouts(
  batch: Entry[],
  round: Entry[],
  size = MIDNIGHT_BATCH_SIZE,
): Entry[][] {
  const inBatch = new Set(batch.map(([key]) => key));
  const others = round.filter(([key]) => !inBatch.has(key));
  const filler = others.length > 0 ? others : batch;
  const layouts: Entry[][] = [];
  const seen = new Set<string>();
  for (
    let variant = 0;
    layouts.length <= MAX_ALTERNATIVE_LAYOUTS && variant < size * 2;
    variant++
  ) {
    const rotate = <T>(items: T[], by: number) =>
      items.map((_, i) => items[(i + by) % items.length]);
    const own = rotate(batch, Math.floor(variant / 2) % batch.length);
    const pad = rotate(filler, variant % filler.length);
    const layout = [...own];
    for (let i = 0; layout.length < size; i++) {
      layout.push(pad[i % pad.length]);
    }
    const id = layout.map(([key]) => key).join('|');
    if (!seen.has(id)) {
      seen.add(id);
      layouts.push(layout);
    }
  }
  return layouts;
}

/**
 * The node rejects some contract calls paid with a single DUST spend as too slow to verify for their
 * size: `1010: Invalid Transaction: Custom error: 231`, FeeCalculation(OutsideTimeToDismiss),
 * midnight-ledger#838 (open). The outcome is the same for the same transaction, so retrying it
 * unchanged does not help; a different layout of the batch can pass.
 */
export function isTimeToDismissRejection(error: unknown): boolean {
  const seen = new Set<unknown>();
  const pending: unknown[] = [error];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current == null || seen.has(current)) {
      continue;
    }
    seen.add(current);
    if (
      /Custom error: 231\b|OutsideTimeToDismiss/.test(String((current as any)?.message ?? current))
    ) {
      return true;
    }
    if (typeof current === 'object') {
      pending.push((current as any).cause);
      if (Array.isArray((current as any).errors)) {
        pending.push(...(current as any).errors);
      }
    }
  }
  return false;
}

export async function updateOracle(keys: string[], prices: number[]) {
  console.log('Updating oracle with:', keys, prices);

  const oracle = await client;
  const timestamp = BigInt(Date.now());

  const round = keys.map(
    (key, index): Entry => [
      key,
      { value: BigInt(Math.floor(prices[index] * 100_000_000)), timestamp },
    ],
  );
  const batches: Entry[][] = [];
  for (let i = 0; i < round.length; i += MIDNIGHT_BATCH_SIZE) {
    batches.push(round.slice(i, i + MIDNIGHT_BATCH_SIZE));
  }

  const maxRetries = config.midnight.maxRetryAttempts;

  for (const batch of batches) {
    const layouts = batchLayouts(batch, round);
    let layout = 0;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const result = await oracle.setMultipleValues(layouts[layout]);
        console.log('batch update:', result);
        break;
      } catch (error) {
        if (isTimeToDismissRejection(error) && layout + 1 < layouts.length) {
          layout++;
          console.warn(
            `Node rejected the batch as too slow to verify for its size (custom error 231, ` +
              `midnight-ledger#838); resending it in another layout (${layout + 1}/${layouts.length})`,
          );
          continue;
        }

        attempt++;
        console.error(`Transaction failed. Attempt ${attempt} of ${maxRetries}. Error:`, error);

        if (attempt >= maxRetries) {
          console.error('Max retry attempts reached. Transaction failed.');
          throw error;
        }

        // Give the wallet time to see the result of the failed attempt (e.g. a spent DUST coin
        // and its change) before building the next transaction.
        const delayMs = config.midnight.retryDelayMs * attempt;
        console.log(`Retrying in ${delayMs / 1000}s`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  console.log('Oracle updated');
}
