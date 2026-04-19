import { inject, Injectable } from '@angular/core';
import { ExternalAiRequest, ExternalAiResponse } from '../models/secure-flow.model';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class ExternalAiApiService {
  private readonly endpoint = `${environment.apiUrl}/api/external/ai/process`;
  private readonly http = inject(HttpClient);
  process(payload: ExternalAiRequest): Observable<ExternalAiResponse> {
    return this.http.post<ExternalAiResponse>(this.endpoint, payload);
  }
}
