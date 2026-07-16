export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  callTimeoutMs: number;
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
  name?: string;
}

export class CircuitOpenError extends Error {
  readonly code = 'CIRCUIT_OPEN';

  constructor(message = 'Circuit is open') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

export class CallTimeoutError extends Error {
  readonly code = 'CIRCUIT_TIMEOUT';

  constructor(message = 'Call timed out') {
    super(message);
    this.name = 'CallTimeoutError';
  }
}

export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly callTimeoutMs: number;
  private readonly onStateChange?: (from: CircuitState, to: CircuitState) => void;
  private readonly name?: string;

  private currentState: CircuitState = 'CLOSED';
  private failureCount = 0;
  private openedAt = 0;
  private halfOpenProbeInFlight = false;

  constructor(options: CircuitBreakerOptions) {
    this.failureThreshold = options.failureThreshold;
    this.resetTimeoutMs = options.resetTimeoutMs;
    this.callTimeoutMs = options.callTimeoutMs;
    this.onStateChange = options.onStateChange;
    this.name = options.name;
  }

  get state(): CircuitState {
    return this.currentState;
  }

  async execute<T>(action: () => Promise<T>): Promise<T> {
    if (this.currentState === 'OPEN') {
      if (Date.now() < this.openedAt + this.resetTimeoutMs) {
        throw new CircuitOpenError(
          this.name ? `Circuit "${this.name}" is open` : 'Circuit is open',
        );
      }
      this.transition('OPEN', 'HALF_OPEN');
    }

    if (this.currentState === 'HALF_OPEN') {
      if (this.halfOpenProbeInFlight) {
        throw new CircuitOpenError(
          this.name
            ? `Circuit "${this.name}" is half-open (probe in flight)`
            : 'Circuit is half-open (probe in flight)',
        );
      }
      this.halfOpenProbeInFlight = true;
    }

    try {
      const result = await this.runWithTimeout(action);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    } finally {
      this.halfOpenProbeInFlight = false;
    }
  }

  private async runWithTimeout<T>(action: () => Promise<T>): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        action(),
        new Promise<T>((_resolve, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(
              new CallTimeoutError(
                this.name ? `Circuit "${this.name}" call timed out` : 'Call timed out',
              ),
            );
          }, this.callTimeoutMs);
        }),
      ]);
    } finally {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.currentState === 'HALF_OPEN') {
      this.transition('HALF_OPEN', 'CLOSED');
    }
  }

  private onFailure(): void {
    if (this.currentState === 'HALF_OPEN') {
      this.openedAt = Date.now();
      this.transition('HALF_OPEN', 'OPEN');
      return;
    }

    if (this.currentState === 'CLOSED') {
      this.failureCount += 1;
      if (this.failureCount >= this.failureThreshold) {
        this.openedAt = Date.now();
        this.transition('CLOSED', 'OPEN');
      }
    }
  }

  private transition(from: CircuitState, to: CircuitState): void {
    this.currentState = to;
    if (this.onStateChange) {
      this.onStateChange(from, to);
    }
  }
}
