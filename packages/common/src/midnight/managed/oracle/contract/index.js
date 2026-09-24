import * as __compactRuntime from '@midnight-ntwrk/compact-runtime';
__compactRuntime.checkRuntimeVersion('0.16.0');

const _descriptor_0 = new __compactRuntime.CompactTypeBytes(32);

class _ZswapCoinPublicKey_0 {
  alignment() {
    return _descriptor_0.alignment();
  }
  fromValue(value_0) {
    return {
      bytes: _descriptor_0.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_0.toValue(value_0.bytes);
  }
}

const _descriptor_1 = new _ZswapCoinPublicKey_0();

const _descriptor_2 = __compactRuntime.CompactTypeOpaqueString;

const _descriptor_3 = new __compactRuntime.CompactTypeUnsignedInteger(340282366920938463463374607431768211455n, 16);

class _OracleValue_0 {
  alignment() {
    return _descriptor_3.alignment().concat(_descriptor_3.alignment());
  }
  fromValue(value_0) {
    return {
      value: _descriptor_3.fromValue(value_0),
      timestamp: _descriptor_3.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_3.toValue(value_0.value).concat(_descriptor_3.toValue(value_0.timestamp));
  }
}

const _descriptor_4 = new _OracleValue_0();

class _tuple_0 {
  alignment() {
    return _descriptor_2.alignment().concat(_descriptor_4.alignment());
  }
  fromValue(value_0) {
    return [
      _descriptor_2.fromValue(value_0),
      _descriptor_4.fromValue(value_0)
    ]
  }
  toValue(value_0) {
    return _descriptor_2.toValue(value_0[0]).concat(_descriptor_4.toValue(value_0[1]));
  }
}

const _descriptor_5 = new _tuple_0();

const _descriptor_6 = new __compactRuntime.CompactTypeVector(10, _descriptor_5);

const _descriptor_7 = __compactRuntime.CompactTypeBoolean;

const _descriptor_8 = new __compactRuntime.CompactTypeUnsignedInteger(18446744073709551615n, 8);

class _Either_0 {
  alignment() {
    return _descriptor_7.alignment().concat(_descriptor_0.alignment().concat(_descriptor_0.alignment()));
  }
  fromValue(value_0) {
    return {
      is_left: _descriptor_7.fromValue(value_0),
      left: _descriptor_0.fromValue(value_0),
      right: _descriptor_0.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_7.toValue(value_0.is_left).concat(_descriptor_0.toValue(value_0.left).concat(_descriptor_0.toValue(value_0.right)));
  }
}

const _descriptor_9 = new _Either_0();

class _ContractAddress_0 {
  alignment() {
    return _descriptor_0.alignment();
  }
  fromValue(value_0) {
    return {
      bytes: _descriptor_0.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_0.toValue(value_0.bytes);
  }
}

const _descriptor_10 = new _ContractAddress_0();

const _descriptor_11 = new __compactRuntime.CompactTypeUnsignedInteger(255n, 1);

export class Contract {
  witnesses;
  constructor(...args_0) {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`Contract constructor: expected 1 argument, received ${args_0.length}`);
    }
    const witnesses_0 = args_0[0];
    if (typeof(witnesses_0) !== 'object') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor is not an object');
    }
    this.witnesses = witnesses_0;
    this.circuits = {
      get_value: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`get_value: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const key_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('get_value',
                                     'argument 1 (as invoked from Typescript)',
                                     'oracle.compact line 17 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_2.toValue(key_0),
            alignment: _descriptor_2.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._get_value_0(context, partialProofData, key_0);
        partialProofData.output = { value: _descriptor_4.toValue(result_0), alignment: _descriptor_4.alignment() };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      set_value: (...args_1) => {
        if (args_1.length !== 3) {
          throw new __compactRuntime.CompactError(`set_value: expected 3 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const key_0 = args_1[1];
        const value_0 = args_1[2];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('set_value',
                                     'argument 1 (as invoked from Typescript)',
                                     'oracle.compact line 25 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(typeof(value_0) === 'object' && typeof(value_0.value) === 'bigint' && value_0.value >= 0n && value_0.value <= 340282366920938463463374607431768211455n && typeof(value_0.timestamp) === 'bigint' && value_0.timestamp >= 0n && value_0.timestamp <= 340282366920938463463374607431768211455n)) {
          __compactRuntime.typeError('set_value',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'oracle.compact line 25 char 1',
                                     'struct OracleValue<value: Uint<0..340282366920938463463374607431768211456>, timestamp: Uint<0..340282366920938463463374607431768211456>>',
                                     value_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_2.toValue(key_0).concat(_descriptor_4.toValue(value_0)),
            alignment: _descriptor_2.alignment().concat(_descriptor_4.alignment())
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._set_value_0(context,
                                           partialProofData,
                                           key_0,
                                           value_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      set_multiple_values: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`set_multiple_values: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const batch_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('set_multiple_values',
                                     'argument 1 (as invoked from Typescript)',
                                     'oracle.compact line 30 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(Array.isArray(batch_0) && batch_0.length === 10 && batch_0.every((t) => Array.isArray(t) && t.length === 2  && true && typeof(t[1]) === 'object' && typeof(t[1].value) === 'bigint' && t[1].value >= 0n && t[1].value <= 340282366920938463463374607431768211455n && typeof(t[1].timestamp) === 'bigint' && t[1].timestamp >= 0n && t[1].timestamp <= 340282366920938463463374607431768211455n))) {
          __compactRuntime.typeError('set_multiple_values',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'oracle.compact line 30 char 1',
                                     'Vector<10, [Opaque<"string">, struct OracleValue<value: Uint<0..340282366920938463463374607431768211456>, timestamp: Uint<0..340282366920938463463374607431768211456>>]>',
                                     batch_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_6.toValue(batch_0),
            alignment: _descriptor_6.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._set_multiple_values_0(context,
                                                     partialProofData,
                                                     batch_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      change_oracle_updater: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`change_oracle_updater: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const new_oracle_updater_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('change_oracle_updater',
                                     'argument 1 (as invoked from Typescript)',
                                     'oracle.compact line 38 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(typeof(new_oracle_updater_0) === 'object' && new_oracle_updater_0.bytes.buffer instanceof ArrayBuffer && new_oracle_updater_0.bytes.BYTES_PER_ELEMENT === 1 && new_oracle_updater_0.bytes.length === 32)) {
          __compactRuntime.typeError('change_oracle_updater',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'oracle.compact line 38 char 1',
                                     'struct ZswapCoinPublicKey<bytes: Bytes<32>>',
                                     new_oracle_updater_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_1.toValue(new_oracle_updater_0),
            alignment: _descriptor_1.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._change_oracle_updater_0(context,
                                                       partialProofData,
                                                       new_oracle_updater_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      }
    };
    this.impureCircuits = {
      get_value: this.circuits.get_value,
      set_value: this.circuits.set_value,
      set_multiple_values: this.circuits.set_multiple_values,
      change_oracle_updater: this.circuits.change_oracle_updater
    };
    this.provableCircuits = {
      get_value: this.circuits.get_value,
      set_value: this.circuits.set_value,
      set_multiple_values: this.circuits.set_multiple_values,
      change_oracle_updater: this.circuits.change_oracle_updater
    };
  }
  initialState(...args_0) {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const constructorContext_0 = args_0[0];
    if (typeof(constructorContext_0) !== 'object') {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'constructorContext' in argument 1 (as invoked from Typescript) to be an object`);
    }
    if (!('initialZswapLocalState' in constructorContext_0)) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript)`);
    }
    if (typeof(constructorContext_0.initialZswapLocalState) !== 'object') {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript) to be an object`);
    }
    const state_0 = new __compactRuntime.ContractState();
    let stateValue_0 = __compactRuntime.StateValue.newArray();
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    state_0.data = new __compactRuntime.ChargedState(stateValue_0);
    state_0.setOperation('get_value', new __compactRuntime.ContractOperation());
    state_0.setOperation('set_value', new __compactRuntime.ContractOperation());
    state_0.setOperation('set_multiple_values', new __compactRuntime.ContractOperation());
    state_0.setOperation('change_oracle_updater', new __compactRuntime.ContractOperation());
    const context = __compactRuntime.createCircuitContext(__compactRuntime.dummyContractAddress(), constructorContext_0.initialZswapLocalState.coinPublicKey, state_0.data, constructorContext_0.initialPrivateState);
    const partialProofData = {
      input: { value: [], alignment: [] },
      output: undefined,
      publicTranscript: [],
      privateTranscriptOutputs: []
    };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_11.toValue(0n),
                                                                                              alignment: _descriptor_11.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue({ bytes: new Uint8Array(32) }),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_11.toValue(1n),
                                                                                              alignment: _descriptor_11.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    const tmp_0 = this._ownPublicKey_0(context, partialProofData);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_11.toValue(0n),
                                                                                              alignment: _descriptor_11.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(tmp_0),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    state_0.data = new __compactRuntime.ChargedState(context.currentQueryContext.state.state);
    return {
      currentContractState: state_0,
      currentPrivateState: context.currentPrivateState,
      currentZswapLocalState: context.currentZswapLocalState
    }
  }
  _ownPublicKey_0(context, partialProofData) {
    const result_0 = __compactRuntime.ownPublicKey(context);
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_1.toValue(result_0),
      alignment: _descriptor_1.alignment()
    });
    return result_0;
  }
  _get_value_0(context, partialProofData, key_0) {
    if (!_descriptor_7.fromValue(__compactRuntime.queryLedgerState(context,
                                                                   partialProofData,
                                                                   [
                                                                    { dup: { n: 0 } },
                                                                    { idx: { cached: false,
                                                                             pushPath: false,
                                                                             path: [
                                                                                    { tag: 'value',
                                                                                      value: { value: _descriptor_11.toValue(1n),
                                                                                               alignment: _descriptor_11.alignment() } }] } },
                                                                    { push: { storage: false,
                                                                              value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(key_0),
                                                                                                                           alignment: _descriptor_2.alignment() }).encode() } },
                                                                    'member',
                                                                    { popeq: { cached: true,
                                                                               result: undefined } }]).value))
    {
      return { value: 0n, timestamp: 0n };
    } else {
      return _descriptor_4.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_11.toValue(1n),
                                                                                                   alignment: _descriptor_11.alignment() } }] } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_2.toValue(key_0),
                                                                                                   alignment: _descriptor_2.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
    }
  }
  _set_value_0(context, partialProofData, key_0, value_0) {
    this._assert_oracle_updater_0(context, partialProofData);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_11.toValue(1n),
                                                                  alignment: _descriptor_11.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(key_0),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_4.toValue(value_0),
                                                                                              alignment: _descriptor_4.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    return [];
  }
  _set_multiple_values_0(context, partialProofData, batch_0) {
    this._assert_oracle_updater_0(context, partialProofData);
    this._folder_0(context,
                   partialProofData,
                   ((context, partialProofData, t_0, entry_0) =>
                    {
                      const tmp_0 = entry_0[0];
                      const tmp_1 = entry_0[1];
                      __compactRuntime.queryLedgerState(context,
                                                        partialProofData,
                                                        [
                                                         { idx: { cached: false,
                                                                  pushPath: true,
                                                                  path: [
                                                                         { tag: 'value',
                                                                           value: { value: _descriptor_11.toValue(1n),
                                                                                    alignment: _descriptor_11.alignment() } }] } },
                                                         { push: { storage: false,
                                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(tmp_0),
                                                                                                                alignment: _descriptor_2.alignment() }).encode() } },
                                                         { push: { storage: true,
                                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_4.toValue(tmp_1),
                                                                                                                alignment: _descriptor_4.alignment() }).encode() } },
                                                         { ins: { cached: false,
                                                                  n: 1 } },
                                                         { ins: { cached: true,
                                                                  n: 1 } }]);
                      return t_0;
                    }),
                   [],
                   batch_0);
    return [];
  }
  _change_oracle_updater_0(context, partialProofData, new_oracle_updater_0) {
    this._assert_oracle_updater_0(context, partialProofData);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_11.toValue(0n),
                                                                                              alignment: _descriptor_11.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(new_oracle_updater_0),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    return [];
  }
  _assert_oracle_updater_0(context, partialProofData) {
    __compactRuntime.assert(this._equal_0(this._ownPublicKey_0(context,
                                                               partialProofData),
                                          _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                    partialProofData,
                                                                                                    [
                                                                                                     { dup: { n: 0 } },
                                                                                                     { idx: { cached: false,
                                                                                                              pushPath: false,
                                                                                                              path: [
                                                                                                                     { tag: 'value',
                                                                                                                       value: { value: _descriptor_11.toValue(0n),
                                                                                                                                alignment: _descriptor_11.alignment() } }] } },
                                                                                                     { popeq: { cached: false,
                                                                                                                result: undefined } }]).value)),
                            'Caller is not the oracle updater');
    return [];
  }
  _folder_0(context, partialProofData, f, x, a0) {
    for (let i = 0; i < 10; i++) { x = f(context, partialProofData, x, a0[i]); }
    return x;
  }
  _equal_0(x0, y0) {
    {
      let x1 = x0.bytes;
      let y1 = y0.bytes;
      if (!x1.every((x, i) => y1[i] === x)) { return false; }
    }
    return true;
  }
}
export function ledger(stateOrChargedState) {
  const state = stateOrChargedState instanceof __compactRuntime.StateValue ? stateOrChargedState : stateOrChargedState.state;
  const chargedState = stateOrChargedState instanceof __compactRuntime.StateValue ? new __compactRuntime.ChargedState(stateOrChargedState) : stateOrChargedState;
  const context = {
    currentQueryContext: new __compactRuntime.QueryContext(chargedState, __compactRuntime.dummyContractAddress()),
    costModel: __compactRuntime.CostModel.initialCostModel()
  };
  const partialProofData = {
    input: { value: [], alignment: [] },
    output: undefined,
    publicTranscript: [],
    privateTranscriptOutputs: []
  };
  return {
    get oracle_updater() {
      return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_11.toValue(0n),
                                                                                                   alignment: _descriptor_11.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
    },
    values: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_7.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_11.toValue(1n),
                                                                                                     alignment: _descriptor_11.alignment() } }] } },
                                                                          'size',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_8.toValue(0n),
                                                                                                                                 alignment: _descriptor_8.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_8.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_11.toValue(1n),
                                                                                                     alignment: _descriptor_11.alignment() } }] } },
                                                                          'size',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        return _descriptor_7.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_11.toValue(1n),
                                                                                                     alignment: _descriptor_11.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(key_0),
                                                                                                                                 alignment: _descriptor_2.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      lookup(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`lookup: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        return _descriptor_4.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_11.toValue(1n),
                                                                                                     alignment: _descriptor_11.alignment() } }] } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_2.toValue(key_0),
                                                                                                     alignment: _descriptor_2.alignment() } }] } },
                                                                          { popeq: { cached: false,
                                                                                     result: undefined } }]).value);
      },
      [Symbol.iterator](...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`iter: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[1];
        return self_0.asMap().keys().map(  (key) => {    const value = self_0.asMap().get(key).asCell();    return [      _descriptor_2.fromValue(key.value),      _descriptor_4.fromValue(value.value)    ];  })[Symbol.iterator]();
      }
    }
  };
}
const _emptyContext = {
  currentQueryContext: new __compactRuntime.QueryContext(new __compactRuntime.ContractState().data, __compactRuntime.dummyContractAddress())
};
const _dummyContract = new Contract({ });
export const pureCircuits = {};
export const contractReferenceLocations =
  { tag: 'publicLedgerArray', indices: { } };
//# sourceMappingURL=index.js.map
