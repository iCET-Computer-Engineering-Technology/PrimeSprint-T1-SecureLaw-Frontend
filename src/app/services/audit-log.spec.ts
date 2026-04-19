import { TestBed } from '@angular/core/testing';

import { AuditLog } from './audit-log';

describe('AuditLog', () => {
  let service: AuditLog;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AuditLog);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
