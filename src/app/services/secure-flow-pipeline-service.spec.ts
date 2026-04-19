import { TestBed } from '@angular/core/testing';

import { SecureFlowPipelineService } from './secure-flow-pipeline-service';

describe('SecureFlowPipelineService', () => {
  let service: SecureFlowPipelineService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SecureFlowPipelineService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
