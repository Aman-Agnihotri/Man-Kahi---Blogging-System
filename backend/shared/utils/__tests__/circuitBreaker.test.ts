import {
  CircuitBreaker,
  CircuitOpenError,
  CallTimeoutError,
  CircuitState,
} from '../circuitBreaker';

const FAILURE_THRESHOLD = 3;
const RESET_TIMEOUT_MS = 15000;
const CALL_TIMEOUT_MS = 1000;

function makeBreaker(onStateChange?: (from: CircuitState, to: CircuitState) => void) {
  return new CircuitBreaker({
    failureThreshold: FAILURE_THRESHOLD,
    resetTimeoutMs: RESET_TIMEOUT_MS,
    callTimeoutMs: CALL_TIMEOUT_MS,
    onStateChange,
    name: 'test-breaker',
  });
}

function ok<T>(value: T): () => Promise<T> {
  return () => Promise.resolve(value);
}

function fail(error: Error): () => Promise<never> {
  return () => Promise.reject(error);
}

async function expectRejects(promise: Promise<unknown>, ctor: new (...args: any[]) => Error) {
  await expect(promise).rejects.toBeInstanceOf(ctor);
}

describe('CircuitBreaker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('1. trips CLOSED -> OPEN after exactly N consecutive failures (N-1 failures + success resets count)', async () => {
    const breaker = makeBreaker();

    await expect(breaker.execute(fail(new Error('boom-1')))).rejects.toThrow('boom-1');
    expect(breaker.state).toBe('CLOSED');

    await expect(breaker.execute(ok('recovered'))).resolves.toBe('recovered');
    expect(breaker.state).toBe('CLOSED');

    // Now failureCount should have been reset to 0 by the success above.
    await expect(breaker.execute(fail(new Error('boom-2')))).rejects.toThrow('boom-2');
    expect(breaker.state).toBe('CLOSED');
    await expect(breaker.execute(fail(new Error('boom-3')))).rejects.toThrow('boom-3');
    expect(breaker.state).toBe('CLOSED');
    await expect(breaker.execute(fail(new Error('boom-4')))).rejects.toThrow('boom-4');
    expect(breaker.state).toBe('OPEN');
  });

  test('2. while OPEN, calls short-circuit with CircuitOpenError and the action is NOT invoked', async () => {
    const breaker = makeBreaker();
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await expect(breaker.execute(fail(new Error(`f${i}`)))).rejects.toThrow();
    }
    expect(breaker.state).toBe('OPEN');

    const action = jest.fn(ok('should-not-run'));
    await expectRejects(breaker.execute(action), CircuitOpenError);
    expect(action).not.toHaveBeenCalled();
  });

  test('3. after advanceTimersByTime(resetTimeoutMs), next execute transitions OPEN -> HALF_OPEN and runs the probe', async () => {
    const breaker = makeBreaker();
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await expect(breaker.execute(fail(new Error(`f${i}`)))).rejects.toThrow();
    }
    expect(breaker.state).toBe('OPEN');

    jest.advanceTimersByTime(RESET_TIMEOUT_MS);

    const probe = jest.fn(ok('probe-result'));
    const result = await breaker.execute(probe);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(result).toBe('probe-result');
    expect(breaker.state).toBe('CLOSED');
  });

  test('4. probe success -> CLOSED; subsequent calls execute normally', async () => {
    const breaker = makeBreaker();
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await expect(breaker.execute(fail(new Error(`f${i}`)))).rejects.toThrow();
    }
    jest.advanceTimersByTime(RESET_TIMEOUT_MS);

    await expect(breaker.execute(ok('probe-ok'))).resolves.toBe('probe-ok');
    expect(breaker.state).toBe('CLOSED');

    await expect(breaker.execute(ok('after-1'))).resolves.toBe('after-1');
    await expect(breaker.execute(ok('after-2'))).resolves.toBe('after-2');
    expect(breaker.state).toBe('CLOSED');
  });

  test('5. probe failure -> re-OPEN; subsequent calls short-circuit again until the next window', async () => {
    const breaker = makeBreaker();
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await expect(breaker.execute(fail(new Error(`f${i}`)))).rejects.toThrow();
    }
    jest.advanceTimersByTime(RESET_TIMEOUT_MS);

    await expect(breaker.execute(fail(new Error('probe-fail')))).rejects.toThrow('probe-fail');
    expect(breaker.state).toBe('OPEN');

    const action = jest.fn(ok('should-not-run'));
    await expectRejects(breaker.execute(action), CircuitOpenError);
    expect(action).not.toHaveBeenCalled();

    jest.advanceTimersByTime(RESET_TIMEOUT_MS);
    await expect(breaker.execute(ok('second-probe-ok'))).resolves.toBe('second-probe-ok');
    expect(breaker.state).toBe('CLOSED');
  });

  test('6. call exceeding callTimeoutMs rejects with CallTimeoutError and counts as a failure toward the threshold', async () => {
    const breaker = makeBreaker();

    const neverResolves = () => new Promise<string>(() => {});

    const p1 = breaker.execute(neverResolves);
    const assertion1 = expectRejects(p1, CallTimeoutError);
    await jest.advanceTimersByTimeAsync(CALL_TIMEOUT_MS);
    await assertion1;
    expect(breaker.state).toBe('CLOSED');

    const p2 = breaker.execute(neverResolves);
    const assertion2 = expectRejects(p2, CallTimeoutError);
    await jest.advanceTimersByTimeAsync(CALL_TIMEOUT_MS);
    await assertion2;
    expect(breaker.state).toBe('CLOSED');

    const p3 = breaker.execute(neverResolves);
    const assertion3 = expectRejects(p3, CallTimeoutError);
    await jest.advanceTimersByTimeAsync(CALL_TIMEOUT_MS);
    await assertion3;
    expect(breaker.state).toBe('OPEN');
  });

  test('7. HALF_OPEN single-probe: while probe promise is pending, a concurrent execute throws CircuitOpenError', async () => {
    const breaker = makeBreaker();
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await expect(breaker.execute(fail(new Error(`f${i}`)))).rejects.toThrow();
    }
    jest.advanceTimersByTime(RESET_TIMEOUT_MS);

    let resolveProbe: (value: string) => void;
    const probeAction = () =>
      new Promise<string>((resolve) => {
        resolveProbe = resolve;
      });

    const probePromise = breaker.execute(probeAction);
    expect(breaker.state).toBe('HALF_OPEN');

    const concurrentAction = jest.fn(ok('concurrent'));
    await expectRejects(breaker.execute(concurrentAction), CircuitOpenError);
    expect(concurrentAction).not.toHaveBeenCalled();

    resolveProbe!('probe-done');
    await expect(probePromise).resolves.toBe('probe-done');
    expect(breaker.state).toBe('CLOSED');
  });

  test('8. onStateChange receives exactly the expected (from,to) sequence across a full trip -> probe-fail -> probe-success cycle; not called at construction', async () => {
    const transitions: Array<[CircuitState, CircuitState]> = [];
    const breaker = makeBreaker((from, to) => {
      transitions.push([from, to]);
    });

    expect(transitions).toEqual([]);

    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await expect(breaker.execute(fail(new Error(`f${i}`)))).rejects.toThrow();
    }
    expect(transitions).toEqual([['CLOSED', 'OPEN']]);

    jest.advanceTimersByTime(RESET_TIMEOUT_MS);
    await expect(breaker.execute(fail(new Error('probe-fail')))).rejects.toThrow('probe-fail');
    expect(transitions).toEqual([
      ['CLOSED', 'OPEN'],
      ['OPEN', 'HALF_OPEN'],
      ['HALF_OPEN', 'OPEN'],
    ]);

    jest.advanceTimersByTime(RESET_TIMEOUT_MS);
    await expect(breaker.execute(ok('probe-success'))).resolves.toBe('probe-success');
    expect(transitions).toEqual([
      ['CLOSED', 'OPEN'],
      ['OPEN', 'HALF_OPEN'],
      ['HALF_OPEN', 'OPEN'],
      ['OPEN', 'HALF_OPEN'],
      ['HALF_OPEN', 'CLOSED'],
    ]);
  });

  test('9. state getter reflects each phase', async () => {
    const breaker = makeBreaker();
    expect(breaker.state).toBe('CLOSED');

    for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) {
      await expect(breaker.execute(fail(new Error(`f${i}`)))).rejects.toThrow();
      expect(breaker.state).toBe('CLOSED');
    }
    await expect(breaker.execute(fail(new Error('final')))).rejects.toThrow();
    expect(breaker.state).toBe('OPEN');

    jest.advanceTimersByTime(RESET_TIMEOUT_MS);

    let resolveProbe: (value: string) => void;
    const probePromise = breaker.execute(
      () =>
        new Promise<string>((resolve) => {
          resolveProbe = resolve;
        }),
    );
    expect(breaker.state).toBe('HALF_OPEN');

    resolveProbe!('done');
    await probePromise;
    expect(breaker.state).toBe('CLOSED');
  });

  test('10. original action errors are rethrown unchanged (same Error instance)', async () => {
    const breaker = makeBreaker();
    const originalError = new Error('original-specific-error');

    let caught: unknown;
    try {
      await breaker.execute(fail(originalError));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(originalError);
  });
});
