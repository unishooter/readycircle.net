import type { JobHandler } from './types.js';

/**
 * Maps job type strings (carried in each queue message's envelope) to the
 * handler function responsible for them. Centralizing registration here
 * keeps the poller decoupled from any specific job's implementation.
 */
export class JobHandlerRegistry {
  private readonly handlers = new Map<string, JobHandler>();

  register(jobType: string, handler: JobHandler): this {
    if (this.handlers.has(jobType)) {
      throw new Error(`A handler is already registered for job type "${jobType}"`);
    }
    this.handlers.set(jobType, handler);
    return this;
  }

  get(jobType: string): JobHandler | undefined {
    return this.handlers.get(jobType);
  }

  get registeredJobTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}
