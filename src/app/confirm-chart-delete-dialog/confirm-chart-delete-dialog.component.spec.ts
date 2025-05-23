import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConfirmChartDeleteDialogComponent } from './confirm-chart-delete-dialog.component';

describe('ConfirmChartDeleteDialogComponent', () => {
  let component: ConfirmChartDeleteDialogComponent;
  let fixture: ComponentFixture<ConfirmChartDeleteDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmChartDeleteDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ConfirmChartDeleteDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
