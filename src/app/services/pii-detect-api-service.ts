import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { PiiDetectRequest, PiiDetectResponse } from '../models/secure-flow.model';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class PiiDetectApiService {
  private readonly endpoint = `${environment.apiUrl}/api/internal/pii/detect`;
  private readonly http = inject(HttpClient);

  detect(payload: PiiDetectRequest): Observable<PiiDetectResponse> {
    return this.http.post<PiiDetectResponse>(this.endpoint, payload);
  }
}
