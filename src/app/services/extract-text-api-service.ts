import { inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  TextExtractRequest,
  TextExtractResponse,
  TextExtractResponseRaw,
} from '../models/secure-flow.model';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class ExtractTextApiService {
  private readonly endpoint = `${environment.apiUrl}/api/documents/upload`;
  private readonly http = inject(HttpClient);

  extract(payload: TextExtractRequest): Observable<TextExtractResponse> {
    const formData = new FormData();
    formData.append('file', payload.file, payload.file.name);
    return this.http.post<TextExtractResponseRaw>(this.endpoint, formData).pipe(
      map((res) => ({
        uploadId: res.uploadId,
        // Accept either key to be forward-compatible if backend later fixes the property name.
        extractedText: res.extractedText ?? res.textPreview ?? '',
      })),
    );
  }
}
