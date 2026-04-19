import { TestBed } from '@angular/core/testing';

import { RehydrateApiService } from './rehydrate-api-service';

describe('RehydrateApiService', () => {
  let service: RehydrateApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RehydrateApiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
