// translator/js/rateLimiter.js — Concurrency + rate-limit throttle (FIFO, Promise-based)
'use strict';

const MINUTE = 60_000;
const RESET_ERROR = 'Rate limiter reset';

// ---- private helpers -------------------------------------------------------

function purge(timestamps, now) {
  const cutoff = now - MINUTE;
  while (timestamps.length && timestamps[0] <= cutoff) timestamps.shift();
}

function hasCapacity(state) {
  purge(state.timestamps, Date.now());
  return state.active < state.maxConcurrent
      && state.timestamps.length < state.requestsPerMinute;
}

function flush(state) {
  while (state.queue.length && hasCapacity(state)) {
    const req = state.queue.shift();
    state.active++;
    state.timestamps.push(Date.now());
    req.resolve();
  }
}

// ---- public API ------------------------------------------------------------

/**
 * Create a rate limiter for translation API calls.
 *
 * @param {Object}  [config]
 * @param {number}  [config.maxConcurrent=5]     Max simultaneous in-flight requests
 * @param {number}  [config.requestsPerMinute=60] Max requests per sliding 1-minute window
 * @param {number}  [config.retryDelay=1000]      ms to wait when `wait()` is called
 * @returns {{ acquire, release, wait, reset }}
 */
export function createRateLimiter(config = {}) {
  const maxConcurrent     = Math.max(1, config.maxConcurrent ?? 5);
  const requestsPerMinute = Math.max(1, config.requestsPerMinute ?? 60);
  const retryDelay        = Math.max(0, config.retryDelay ?? 1000);

  const state = {
    maxConcurrent,
    requestsPerMinute,
    active: 0,
    timestamps: [],           // request start times in current window
    queue: []                 // { resolve, reject } — FIFO
  };

  /**
   * Acquire a rate-limit slot.
   * Resolves when both a concurrency slot AND a rate-limit token are available.
   * Always follow with `release()` when the work is done.
   * @returns {Promise<void>}
   */
  function acquire() {
    return new Promise((resolve, reject) => {
      state.queue.push({ resolve, reject });
      flush(state);
    });
  }

  /**
   * Release a previously acquired slot so the next queued caller can proceed.
   */
  function release() {
    if (state.active > 0) state.active--;
    flush(state);
  }

  /**
   * Wait for `retryDelay` ms (useful after a 429 / rate-limit response).
   * Does NOT acquire a slot — pair with `acquire()` after the delay.
   * @returns {Promise<void>}
   */
  function wait() {
    return new Promise(resolve => setTimeout(resolve, retryDelay));
  }

  /**
   * Reset all state: clear the queue (pending acquires are rejected),
   * reset concurrency count, and wipe the rate-limit window.
   */
  function reset() {
    state.active = 0;
    state.timestamps.length = 0;
    while (state.queue.length) {
      state.queue.shift().reject(new Error(RESET_ERROR));
    }
  }

  return { acquire, release, wait, reset };
}
