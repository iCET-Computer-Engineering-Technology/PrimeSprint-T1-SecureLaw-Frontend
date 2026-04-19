import { Injectable, computed, signal } from '@angular/core';

export type OutageKind = 'server' | 'network';

export interface OutageState {
  kind: OutageKind;
  title: string;
  message: string;
}

@Injectable({
  providedIn: 'root',
})
export class Connectivity {
  private readonly serverDown = signal(false);
  readonly offline = signal<boolean>(globalThis.navigator?.onLine === false);

  private serverDownHits = 0;
  private lastServerDownHitAt = 0;
  private readonly serverDownHitWindowMs = 8000;
  private readonly serverDownHitThreshold = 2;

  readonly outage = computed<OutageState | null>(() => {
    if (this.offline()) {
      return {
        kind: 'network',
        title: 'Network unavailable',
        message: 'You appear to be offline. Check your internet connection and try again.',
      };
    }

    if (this.serverDown()) {
      return {
        kind: 'server',
        title: 'Server unavailable',
        message: 'The server can’t be reached right now. Please try again in a moment.',
      };
    }

    return null;
  });

  constructor() {
    globalThis.window.addEventListener('online', () => {
      this.offline.set(false);
      this.clearServerDown();
    });
    globalThis.window.addEventListener('offline', () => this.offline.set(true));
  }

  markServerDown(): void {
    const now = Date.now();
    if (now - this.lastServerDownHitAt > this.serverDownHitWindowMs) {
      this.serverDownHits = 0;
    }

    this.lastServerDownHitAt = now;
    this.serverDownHits = Math.min(this.serverDownHitThreshold, this.serverDownHits + 1);

    if (this.serverDownHits >= this.serverDownHitThreshold) {
      this.serverDown.set(true);
    }
  }

  clearServerDown(): void {
    this.serverDown.set(false);
    this.serverDownHits = 0;
    this.lastServerDownHitAt = 0;
  }
}
