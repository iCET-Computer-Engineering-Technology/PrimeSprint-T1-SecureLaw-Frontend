import { TestBed } from '@angular/core/testing';

import { ExternalAiApiService } from './external-ai-api-service';

describe('ExternalAiApiService', () => {
  let service: ExternalAiApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ExternalAiApiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
