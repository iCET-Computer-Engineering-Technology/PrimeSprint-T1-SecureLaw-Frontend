import { HttpErrorResponse, HttpEventType, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, tap, throwError } from 'rxjs';
import { Connectivity } from '../core/services/connectivity';
import { environment } from '../../environments/environment';

const OUTAGE_HTTP_STATUSES = new Set([0, 502, 503, 504]);

function isBackendRequest(url: string): boolean {
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

export const connectivityInterceptor: HttpInterceptorFn = (req, next) => {
  const connectivity = inject(Connectivity);
  const isBackend = isBackendRequest(req.url);

  return next(req).pipe(
    tap((event) => {
      if (event.type === HttpEventType.Response) {
        if (isBackend) {
          connectivity.clearServerDown();
        }
      }
    }),
    catchError((err: unknown) => {
      if (connectivity.offline()) {
        return throwError(() => err);
      }

      if (!isBackend) {
        return throwError(() => err);
      }

      if (err instanceof HttpErrorResponse) {
        if (isAbortLikeStatus0(err)) {
          return throwError(() => err);
        }

        if (OUTAGE_HTTP_STATUSES.has(err.status)) {
          connectivity.markServerDown();
        } else if (err.status > 0) {
          connectivity.clearServerDown();
        }
      }

      return throwError(() => err);
    }),
  );
};
