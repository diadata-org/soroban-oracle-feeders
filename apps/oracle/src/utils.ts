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

/* Midnight Oracletypes */
import { Oracle, type OraclePrivateState } from '@repo/common'; // Compiled from @repo/common

import type { ImpureCircuitId, MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import type { DeployedContract, FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
export type OracleCircuits = ImpureCircuitId<Oracle.Contract<OraclePrivateState>>;
export const OraclePrivateStateId = 'oraclePrivateState';
export type OracleProviders = MidnightProviders<OracleCircuits, typeof OraclePrivateStateId, OraclePrivateState>;
export type OracleContract = Oracle.Contract<OraclePrivateState>;
export type DeployedOracleContract = DeployedContract<OracleContract> | FoundContract<OracleContract>;
