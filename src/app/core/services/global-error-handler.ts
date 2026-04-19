import { ErrorHandler, Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Connectivity } from './connectivity';

const OUTAGE_HTTP_STATUSES = new Set([0, 502, 503, 504]);

function isBackendUrl(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }

  try {
    const backendOrigin = new URL(environment.apiUrl).origin;
    const reqOrigin = new URL(url, globalThis.location?.origin).origin;
    return reqOrigin === backendOrigin;
  } catch {
    return false;
  }
}

function isAbortLikeStatus0(err: HttpErrorResponse): boolean {
  if (err.status !== 0) {
    return false;
  }

  const anyErr = err as unknown as { error?: unknown };
  const e = anyErr.error;
  if (typeof ProgressEvent !== 'undefined' && e instanceof ProgressEvent) {
    return (e.type ?? '').toLowerCase() === 'abort';
  }

  if (typeof e === 'object' && e !== null && 'type' in e) {
    const t = (e as { type?: unknown }).type;
    if (typeof t === 'string' && t.toLowerCase() === 'abort') {
      return true;
    }
  }

  return false;
}

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly connectivity = inject(Connectivity);

  handleError(error: unknown): void {
    if (this.connectivity.offline()) {
      return;
    }

    if (error instanceof HttpErrorResponse) {
      if (!isBackendUrl(error.url)) {
        return;
      }

      if (isAbortLikeStatus0(error)) {
        return;
      }

      if (OUTAGE_HTTP_STATUSES.has(error.status)) {
        this.connectivity.markServerDown();
      }
    }
  }
}
