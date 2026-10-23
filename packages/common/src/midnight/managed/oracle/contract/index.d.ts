import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type OracleValue = { value: bigint; timestamp: bigint };

export type Witnesses<PS> = {
}

export type ImpureCircuits<PS> = {
  get_value(context: __compactRuntime.CircuitContext<PS>, key_0: string): __compactRuntime.CircuitResults<PS, OracleValue>;
  set_value(context: __compactRuntime.CircuitContext<PS>,
            key_0: string,
            value_0: OracleValue): __compactRuntime.CircuitResults<PS, []>;
  set_multiple_values(context: __compactRuntime.CircuitContext<PS>,
                      batch_0: [string, OracleValue][]): __compactRuntime.CircuitResults<PS, []>;
  change_oracle_updater(context: __compactRuntime.CircuitContext<PS>,
                        new_oracle_updater_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  get_value(context: __compactRuntime.CircuitContext<PS>, key_0: string): __compactRuntime.CircuitResults<PS, OracleValue>;
  set_value(context: __compactRuntime.CircuitContext<PS>,
            key_0: string,
            value_0: OracleValue): __compactRuntime.CircuitResults<PS, []>;
  set_multiple_values(context: __compactRuntime.CircuitContext<PS>,
                      batch_0: [string, OracleValue][]): __compactRuntime.CircuitResults<PS, []>;
  change_oracle_updater(context: __compactRuntime.CircuitContext<PS>,
                        new_oracle_updater_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  get_value(context: __compactRuntime.CircuitContext<PS>, key_0: string): __compactRuntime.CircuitResults<PS, OracleValue>;
  set_value(context: __compactRuntime.CircuitContext<PS>,
            key_0: string,
            value_0: OracleValue): __compactRuntime.CircuitResults<PS, []>;
  set_multiple_values(context: __compactRuntime.CircuitContext<PS>,
                      batch_0: [string, OracleValue][]): __compactRuntime.CircuitResults<PS, []>;
  change_oracle_updater(context: __compactRuntime.CircuitContext<PS>,
                        new_oracle_updater_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
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

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
