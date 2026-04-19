import { TestBed } from '@angular/core/testing';

import { MaskApiService } from './mask-api-service';

describe('MaskApiService', () => {
  let service: MaskApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MaskApiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
