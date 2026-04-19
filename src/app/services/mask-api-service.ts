import { inject, Injectable } from '@angular/core';
import { MaskRequest, MaskResponse } from '../models/secure-flow.model';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class MaskApiService {
  private readonly endpoint = `${environment.apiUrl}/api/internal/mask`;
  private readonly http = inject(HttpClient);
  mask(payload: MaskRequest): Observable<MaskResponse> {
    return this.http.post<MaskResponse>(this.endpoint, payload);
  }
}
