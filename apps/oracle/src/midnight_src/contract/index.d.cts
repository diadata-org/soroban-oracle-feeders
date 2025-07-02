import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type OracleValue = { value: bigint; timestamp: bigint };

export type Witnesses<T> = {
}

export type ImpureCircuits<T> = {
  get_value(context: __compactRuntime.CircuitContext<T>, key_0: string): __compactRuntime.CircuitResults<T, OracleValue>;
  set_value(context: __compactRuntime.CircuitContext<T>,
            key_0: string,
            value_0: OracleValue): __compactRuntime.CircuitResults<T, []>;
  set_multiple_values(context: __compactRuntime.CircuitContext<T>,
                      batch_0: [string, OracleValue][]): __compactRuntime.CircuitResults<T, []>;
  change_oracle_updater(context: __compactRuntime.CircuitContext<T>,
                        new_oracle_updater_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<T, []>;
}

export type PureCircuits = {
}

export type Circuits<T> = {
  get_value(context: __compactRuntime.CircuitContext<T>, key_0: string): __compactRuntime.CircuitResults<T, OracleValue>;
  set_value(context: __compactRuntime.CircuitContext<T>,
            key_0: string,
            value_0: OracleValue): __compactRuntime.CircuitResults<T, []>;
  set_multiple_values(context: __compactRuntime.CircuitContext<T>,
                      batch_0: [string, OracleValue][]): __compactRuntime.CircuitResults<T, []>;
  change_oracle_updater(context: __compactRuntime.CircuitContext<T>,
                        new_oracle_updater_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<T, []>;
}

export type Ledger = {
  readonly oracle_updater: { bytes: Uint8Array };
  values: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: string): boolean;
    lookup(key_0: string): OracleValue;
    [Symbol.iterator](): Iterator<[string, OracleValue]>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<T, W extends Witnesses<T> = Witnesses<T>> {
  witnesses: W;
  circuits: Circuits<T>;
  impureCircuits: ImpureCircuits<T>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<T>): __compactRuntime.ConstructorResult<T>;
}

export declare function ledger(state: __compactRuntime.StateValue): Ledger;
export declare const pureCircuits: PureCircuits;
