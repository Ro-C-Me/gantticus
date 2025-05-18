import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GroupEditModalComponent } from './group-edit-modal.component';

describe('GroupEditModalComponent', () => {
  let component: GroupEditModalComponent;
  let fixture: ComponentFixture<GroupEditModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GroupEditModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GroupEditModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
