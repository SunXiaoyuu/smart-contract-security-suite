/* tslint:disable:no-unused-variable */

import { TestBed, async, inject } from '@angular/core/testing';
import { WorkflowDataService } from './workflow-data.service';

describe('Service: WorkflowData', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [WorkflowDataService]
    });
  });

  it('should ...', inject([WorkflowDataService], (service: WorkflowDataService) => {
    expect(service).toBeTruthy();
  }));
});
