import type { Observable, Subscription } from 'rxjs';

export function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      clearTimeout(timeout);
      resolve();
    }, ms);
  });
}

export type AsyncQueueOptions = {
  timeout?: number;
  onError?: (err: unknown) => void;
};

export function createAsyncQueue(options: AsyncQueueOptions = {}) {
  const queue: (() => Promise<void>)[] = [];

  return (fn: () => Promise<void>) => {
    queue.push(async () => {
      try {
        await fn();
      } catch (err: unknown) {
        if (options.onError) {
          options.onError(err);
        } else {
          console.error(`Erorr in async queue: ${err}`);
        }
      }

      if (options.timeout) {
        await sleep(options.timeout);
      }

      if (queue.length >= 1) {
        queue.shift();
        if (queue.length) {
          queue[0]();
        }
      }
    });

    if (queue.length === 1) {
      queue[0]();
    }
  };
}

export function intoAsyncIterable<T>(observable: Observable<T>): AsyncIterable<T> {
  // Implementation is taken from https://github.com/ReactiveX/rxjs/pull/7189
  return {
    [Symbol.asyncIterator](): AsyncGenerator<T, void, void> {
      let subscription: Subscription | undefined;
      let hasError = false;
      let error: unknown;

      let completed = false;
      const values: T[] = [];
      const deferreds: [(value: IteratorResult<T>) => void, (reason: any) => void][] = [];

      const handleError = (err: unknown) => {
        hasError = true;
        error = err;
        while (deferreds.length) {
          deferreds.shift()![1](err);
        }
      };

      const handleComplete = () => {
        completed = true;
        while (deferreds.length) {
          deferreds.shift()![0]({ value: undefined, done: true });
        }
      };

      return {
        next: (): Promise<IteratorResult<T>> => {
          if (!subscription) {
            subscription = observable.subscribe({
              next: (value) => {
                if (deferreds.length) {
                  deferreds.shift()![0]({ value, done: false });
                } else {
                  values.push(value);
                }
              },
              error: handleError,
              complete: handleComplete,
            });
          }

          if (values.length) {
            return Promise.resolve({ value: values.shift()!, done: false });
          }
          if (completed) {
            return Promise.resolve({ value: undefined, done: true });
          }
          if (hasError) {
            return Promise.reject(error);
          }
          return new Promise((resolve, reject) => deferreds.push([resolve, reject]));
        },
        throw: (err): Promise<IteratorResult<T>> => {
          subscription?.unsubscribe();
          handleError(err);
          return Promise.reject(err);
        },
        return: (): Promise<IteratorResult<T>> => {
          subscription?.unsubscribe();
          handleComplete();
          return Promise.resolve({ value: undefined, done: true });
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
    },
  };
}
