import { formatUnits } from 'viem';
import { splitIntoFixedBatches, fillArray, toFixedPoint } from '../src/utils';

describe('splitIntoFixedBatches', () => {
  it('should split an array into batches of specified size', () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    const batchSize = 3;
    const expectedBatches = [[1, 2, 3], [4, 5, 6], [7]];

    const result = splitIntoFixedBatches(items, batchSize);

    expect(result).toEqual(expectedBatches);
  });

  it('should handle an empty array', () => {
    const items: number[] = [];
    const batchSize = 3;
    const expectedBatches: number[][] = [];

    const result = splitIntoFixedBatches(items, batchSize);

    expect(result).toEqual(expectedBatches);
  });

  it('should handle a batch size larger than the array', () => {
    const items = [1, 2];
    const batchSize = 5;
    const expectedBatches = [[1, 2]];

    const result = splitIntoFixedBatches(items, batchSize);

    expect(result).toEqual(expectedBatches);
  });

  it('should handle a batch size of 1', () => {
    const items = [1, 2, 3];
    const batchSize = 1;
    const expectedBatches = [[1], [2], [3]];

    const result = splitIntoFixedBatches(items, batchSize);

    expect(result).toEqual(expectedBatches);
  });
});

describe('fillArray', () => {
  it('should fill an array to the desired size with a specified item', () => {
    const inputArray = [1, 2, 3];
    const desiredSize = 10;
    const fillItem = 0;
    const expectedArray = [1, 2, 3, 0, 0, 0, 0, 0, 0, 0];

    const result = fillArray(inputArray, desiredSize, fillItem);

    expect(result).toEqual(expectedArray);
  });

  it('should return the same array if it is already the desired size', () => {
    const inputArray = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const desiredSize = 10;
    const fillItem = 0;
    const expectedArray = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    const result = fillArray(inputArray, desiredSize, fillItem);

    expect(result).toEqual(expectedArray);
  });

  it('should handle an empty array', () => {
    const inputArray: number[] = [];
    const desiredSize = 10;
    const fillItem = 0;
    const expectedArray = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    const result = fillArray(inputArray, desiredSize, fillItem);

    expect(result).toEqual(expectedArray);
  });

  it('should handle a non-default fill item', () => {
    const inputArray = [1, 2, 3];
    const desiredSize = 10;
    const fillItem = 99;
    const expectedArray = [1, 2, 3, 99, 99, 99, 99, 99, 99, 99];

    const result = fillArray(inputArray, desiredSize, fillItem);

    expect(result).toEqual(expectedArray);
  });
});

describe('toFixedPoint', () => {
  it('writes 8 decimals without float rounding errors', () => {
    expect(toFixedPoint(0.29)).toBe(29_000_000n);
    expect(toFixedPoint(4.35)).toBe(435_000_000n);
    expect(toFixedPoint(1.005)).toBe(100_500_000n);
    expect(toFixedPoint(100)).toBe(10_000_000_000n);
    expect(toFixedPoint(0)).toBe(0n);
  });

  it('truncates like Math.floor did, including exponent-form values', () => {
    expect(toFixedPoint(1.123456789)).toBe(112_345_678n);
    expect(toFixedPoint(1e-7)).toBe(10n);
    expect(toFixedPoint(1e-9)).toBe(0n);
  });

  it('rejects values no oracle contract can hold', () => {
    expect(() => toFixedPoint(-1)).toThrow();
    expect(() => toFixedPoint(NaN)).toThrow();
    expect(() => toFixedPoint(1e21)).toThrow();
  });

  it('turns 18-decimal Lumina values into the 8-decimal values the DIA API feeds wrote', () => {
    const lumina = [
      104_523_123456789012345678n,
      3_456_780000000000000000n,
      290000000000000000n,
      999900000000000000n,
      1_000_000000000000000000n,
      123_456789000000000000n,
    ];
    for (const raw of lumina) {
      const price = Number(formatUnits(raw, 18));
      expect(toFixedPoint(price)).toBe(raw / 10n ** 10n);
    }
  });
});
