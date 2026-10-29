// Small in-memory sliding-window rate limiter for the unauthenticated routes.
// One process holds all state (the server is single-process, PGlite makes it
// so), so a Map is enough. Counts are lost on restart, which is fine for abuse
// control.
import type { Request, Response, NextFunction } from 'express';

export class SlidingWindow {
  private hits = new Map<string, number[]>();
  private windowMs: number;
  private max: number;
  constructor(windowMs: number, max: number) {
    this.windowMs = windowMs;
    this.max = max;
  }

  /** Record a hit for `key`. False when the key is over its limit. */
  hit(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) this.sweep(now);
    return true;
  }

  /** Seconds until the key may try again. */
  retryAfter(key: string, now = Date.now()): number {
    const first = (this.hits.get(key) ?? []).find((t) => now - t < this.windowMs);
    return first === undefined ? 0 : Math.max(1, Math.ceil((first + this.windowMs - now) / 1000));
  }

  private sweep(now: number) {
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(key);
    }
  }
}

/** Express middleware limiting each client IP to `max` requests per window. */
export function rateLimit({ windowMs, max, message = 'Too many requests, please try again shortly.' }: { windowMs: number; max: number; message?: string }) {
  const window = new SlidingWindow(windowMs, max);
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? 'unknown';
    if (window.hit(key)) return next();
    res.setHeader('Retry-After', String(window.retryAfter(key)));
    res.status(429).json({ message });
  };
}
