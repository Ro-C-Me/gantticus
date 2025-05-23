import { TestBed } from '@angular/core/testing';

import { ChartStorageService } from './chart-storage.service';

describe('ChartStorageService', () => {
  let service: ChartStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ChartStorageService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
