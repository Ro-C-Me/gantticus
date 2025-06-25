import { TestBed } from '@angular/core/testing';

import { UndoRedoService } from './undo-redo.service';
import { Chart } from './domain/Chart';
import { Task } from './domain/Task';

describe('UndoRedoService', () => {
  let service: UndoRedoService;
  let chart: Chart;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(UndoRedoService);
    
    chart = new Chart();
    chart.id = 'test-chart';
    chart.name = 'Test Chart';
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should save state and provide undo capability', () => {
    // Initialize with a chart
    service.initStateForChart(chart);
    
    // Initial state should not have undo capability
    let canUndo = false;
    service.canUndo$.subscribe(can => canUndo = can);
    expect(canUndo).toBeFalse();
    
    // Modify chart and save state
    chart.name = 'Modified Chart';
    service.saveState(chart);
    
    // Now we should have undo capability
    expect(canUndo).toBeTrue();
    
    // Undo should restore original chart
    const restoredChart = service.undo(chart);
    expect(restoredChart?.name).toBe('Test Chart');
  });

  it('should provide redo capability after undo', () => {
    service.initStateForChart(chart);
    
    // Modify and save
    chart.name = 'Modified Chart';
    service.saveState(chart);
    
    // Do an undo
    service.undo(chart);
    
    // Check redo capability
    let canRedo = false;
    service.canRedo$.subscribe(can => canRedo = can);
    expect(canRedo).toBeTrue();
    
    // Redo should restore the modified chart
    const redoneChart = service.redo(chart);
    expect(redoneChart?.name).toBe('Modified Chart');
  });

  it('should maintain max history size', () => {
    // Initialize with a chart
    service['maxStackSize'] = 3; // Access private field for testing
    service.initStateForChart(chart);
    
    // Add several states
    for (let i = 0; i < 5; i++) {
      chart.name = `State ${i}`;
      service.saveState(chart);
    }
    
    // Verify we only have maxStackSize + 1 items (initial + max)
    expect(service['undoStack'].length).toBe(4);
    
    // And that the oldest states were removed
    const oldestState = JSON.parse(service['undoStack'][0]);
    expect(oldestState.name).toBe('State 2');
  });
});
