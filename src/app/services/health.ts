import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, of } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class HealthService {
  private readonly healthUrl = `${environment.apiUrl}/actuator/health`;

  constructor(private readonly http: HttpClient) {}

  checkBackend(): Observable<any> {
    try {
      const backendOrigin = new URL(environment.apiUrl).origin;
      if (backendOrigin !== globalThis.location.origin) {
        return of({ skipped: true, reason: 'cross-origin' });
      }
    } catch {
    }

    return this.http.get(this.healthUrl);
  }
}
