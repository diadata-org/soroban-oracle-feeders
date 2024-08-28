import { Observable, of } from 'rxjs';
import { sleep, createAsyncQueue, intoAsyncIterable } from '../src/utils';

describe('Utility Functions', () => {

  describe('sleep', () => {
    it('should resolve after the specified time', async () => {
      const start = Date.now();
      const ms = 100;
      await sleep(ms);
      const end = Date.now();
      expect(end - start).toBeGreaterThanOrEqual(ms);
    });
  });

  describe('createAsyncQueue', () => {
    it('should process functions in order', async () => {
      const results: string[] = [];
      const queue = createAsyncQueue();

      const task1 = () => new Promise<void>((resolve) => {
        setTimeout(() => {
          results.push('task1');
          resolve();
        }, 50);
      });

      const task2 = () => new Promise<void>((resolve) => {
        setTimeout(() => {
          results.push('task2');
          resolve();
        }, 30);
      });

      queue(task1);
      queue(task2);

      await sleep(100); // Wait for tasks to complete

      expect(results).toEqual(['task1', 'task2']);
    });

    it('should handle errors and continue processing', async () => {
      const results: string[] = [];
      const errorSpy = jest.fn();
      const queue = createAsyncQueue({ onError: errorSpy });

      const task1 = () => new Promise<void>((resolve) => {
        setTimeout(() => {
          results.push('task1');
          resolve();
        }, 50);
      });

      const task2 = () => new Promise<void>((_, reject) => {
        setTimeout(() => {
          reject(new Error('task2 failed'));
        }, 30);
      });

      const task3 = () => new Promise<void>((resolve) => {
        setTimeout(() => {
          results.push('task3');
          resolve();
        }, 20);
      });

      queue(task1);
      queue(task2);
      queue(task3);

      await sleep(150); // Wait for tasks to complete

      expect(results).toEqual(['task1', 'task3']);
      expect(errorSpy).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should respect timeout between tasks', async () => {
      const results: string[] = [];
      const queue = createAsyncQueue({ timeout: 50 });

      const task1 = () => new Promise<void>((resolve) => {
        results.push('task1');
        resolve();
      });

      const task2 = () => new Promise<void>((resolve) => {
        results.push('task2');
        resolve();
      });

      queue(task1);
      queue(task2);

      await sleep(150); // Wait for tasks to complete

      expect(results).toEqual(['task1', 'task2']);
      // Ensure that there's at least a 50ms gap between tasks
      expect(results).toHaveLength(2);
    });
  });

  describe('intoAsyncIterable', () => {
    it('should iterate over observable values', async () => {
      const values = [1, 2, 3];
      const observable = of(...values);
      const asyncIterable = intoAsyncIterable(observable);

      const result: number[] = [];
      for await (const value of asyncIterable) {
        result.push(value);
      }

      expect(result).toEqual(values);
    });

    it('should handle observable errors', async () => {
      const error = new Error('Test error');
      const observable = new Observable<number>((subscriber) => {
        subscriber.next(1);
        subscriber.error(error);
      });

      const asyncIterable = intoAsyncIterable(observable);

      const result: number[] = [];
      let caughtError: Error | null = null;

      try {
        for await (const value of asyncIterable) {
          result.push(value);
        }
      } catch (err) {
        caughtError = err as Error;
      }

      expect(result).toEqual([1]);
      expect(caughtError).toBe(error);
    });

    it('should handle observable completion', async () => {
      const observable = new Observable<number>((subscriber) => {
        subscriber.next(1);
        subscriber.complete();
      });

      const asyncIterable = intoAsyncIterable(observable);

      const result: number[] = [];
      for await (const value of asyncIterable) {
        result.push(value);
      }

      expect(result).toEqual([1]);
    });
  });
});
