import { TestBed } from '@angular/core/testing';

import { IfastCallServiceService } from './ifast-call-service.service';

describe('IfastCallServiceService', () => {
  let service: IfastCallServiceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(IfastCallServiceService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
