import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TaskTitleComponent } from './task-title.component';

describe('TaskTitleComponent', () => {
  let component: TaskTitleComponent;
  let fixture: ComponentFixture<TaskTitleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskTitleComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TaskTitleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
