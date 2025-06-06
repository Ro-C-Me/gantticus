import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DependencyManagementComponent } from './dependency-management.component';

describe('DependencyManagementComponent', () => {
  let component: DependencyManagementComponent;
  let fixture: ComponentFixture<DependencyManagementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DependencyManagementComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DependencyManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
