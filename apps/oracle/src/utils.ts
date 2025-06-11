import { Counter, type CounterPrivateState } from '@repo/common';
import type { ImpureCircuitId, MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import type { DeployedContract, FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import { getAddress, isAddress, zeroAddress } from 'viem';

export function splitIntoFixedBatches<T>(items: T[], batchSize: number): T[][] {
  let batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

type FixedLengthArray<T, L extends number, R extends T[] = []> = R['length'] extends L
  ? R
  : FixedLengthArray<T, L, [T, ...R]>;

export function fillArray<T>(
  inputArray: T[],
  desiredSize: number,
  fillItem: T,
): FixedLengthArray<T, 10> {
  const outputArray = [...inputArray];
  while (outputArray.length < desiredSize) {
    outputArray.push(fillItem);
  }
  return outputArray as FixedLengthArray<T, 10>; // limitation on array size due to fixed length of Contract method
}

export function parseAddress(value?: string) {
  if (!value || !isAddress(value)) {
    return zeroAddress;
  }
  return getAddress(value);
}

/* Midnight types */

export type CounterCircuits = ImpureCircuitId<Counter.Contract<CounterPrivateState>>;

export const CounterPrivateStateId = 'counterPrivateState';

export type CounterProviders = MidnightProviders<
  CounterCircuits,
  typeof CounterPrivateStateId,
  CounterPrivateState
>;

export type CounterContract = Counter.Contract<CounterPrivateState>;

export type DeployedCounterContract =
  | DeployedContract<CounterContract>
  | FoundContract<CounterContract>;
