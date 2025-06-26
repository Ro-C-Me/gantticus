import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ColorSelectionComponent } from './color-selection.component';
import { CommonModule } from '@angular/common';

describe('ColorSelectionComponent', () => {
  let component: ColorSelectionComponent;
  let fixture: ComponentFixture<ColorSelectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        CommonModule, 
        ReactiveFormsModule,
        ColorSelectionComponent
      ],
      providers: [FormBuilder]
    }).compileComponents();

    fixture = TestBed.createComponent(ColorSelectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle useColor when color picker opens', () => {
    component.useColor = false;
    component.onColorPickerOpen();
    expect(component.useColor).toBeTrue();
  });

  it('should update color and emit events when color changes', () => {
    spyOn(component.selectedColorChange, 'emit');
    const testColor = '#FF0000';
    
    component.onColorChange(testColor);
    
    expect(component.selectedColor).toBe(testColor);
    expect(component.selectedColorChange.emit).toHaveBeenCalledWith(testColor);
  });
});
