import { TestBed } from '@angular/core/testing';

import { ExtractTextApiService } from './extract-text-api-service';

describe('ExtractTextApiService', () => {
  let service: ExtractTextApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ExtractTextApiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
