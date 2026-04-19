import { TestBed } from '@angular/core/testing';

import { PiiDetectApiService } from './pii-detect-api-service';

describe('PiiDetectApiService', () => {
  let service: PiiDetectApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PiiDetectApiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
