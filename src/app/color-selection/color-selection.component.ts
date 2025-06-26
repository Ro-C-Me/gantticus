import { Component, OnInit, forwardRef, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ColorPickerDirective } from 'ngx-color-picker';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';

@Component({
  selector: 'app-color-selection',
  standalone: true,
  templateUrl: './color-selection.component.html',
  styleUrls: ['./color-selection.component.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ColorPickerDirective
  ],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ColorSelectionComponent),
      multi: true
    }
  ]
})
export class ColorSelectionComponent implements OnInit, ControlValueAccessor {
  @Input() selectedColor: string = '#6698FF';
  @Input() useColor: boolean = false;
  
  @Output() selectedColorChange = new EventEmitter<string>();
  @Output() useColorChange = new EventEmitter<boolean>();
  
  recentColors: string[] = [];
  colorForm!: FormGroup;
  
  // ControlValueAccessor implementation
  onChange: any = () => {};
  onTouch: any = () => {};
  disabled: boolean = false;

  constructor(private fb: FormBuilder) {
    // Lade zuletzt verwendete Farben aus dem localStorage
    const savedColors = localStorage.getItem('recentTaskColors');
    if (savedColors) {
      this.recentColors = JSON.parse(savedColors);
    }
  }

  ngOnInit(): void {
    this.colorForm = this.fb.group({
      useColor: [this.useColor],
      color: [this.selectedColor]
    });

    // Reagiere auf Änderungen in den Formularsteuerungen
    this.colorForm.get('useColor')?.valueChanges.subscribe(value => {
      this.useColor = value;
      this.useColorChange.emit(value);
      this.emitValue();
    });
  }

  onColorPickerOpen(): void {
    this.useColor = true;
    this.useColorChange.emit(true);
    this.colorForm.get('useColor')?.setValue(true);
  }

  onColorChange(color: string): void {
    this.selectedColor = color;
    this.selectedColorChange.emit(color);
    this.emitValue();
    
    // Nur speichern, wenn es sich um eine neue Farbe handelt
    if (!this.recentColors.includes(color)) {
      // Füge die neue Farbe am Anfang hinzu und begrenze auf maximal 10 Farben
      this.recentColors = [color, ...this.recentColors.slice(0, 9)];
      const colorsJson = JSON.stringify(this.recentColors);
      console.log("Aktualisierte zuletzt verwendete Farben: ", colorsJson);
      // Speichere im localStorage
      localStorage.setItem('recentTaskColors', colorsJson);
    }
  }
  
  // ControlValueAccessor Interface Implementierung
  writeValue(value: any): void {
    if (value) {
      if (typeof value === 'object') {
        if ('color' in value) {
          this.selectedColor = value.color || '#6698FF';
        }
        if ('useColor' in value) {
          this.useColor = value.useColor;
        }
      } else {
        this.selectedColor = value;
        this.useColor = !!value;
      }
      
      this.colorForm?.patchValue({
        useColor: this.useColor,
        color: this.selectedColor
      }, { emitEvent: false });
    }
  }
  
  registerOnChange(fn: any): void {
    this.onChange = fn;
  }
  
  registerOnTouched(fn: any): void {
    this.onTouch = fn;
  }
  
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    if (this.colorForm) {
      if (isDisabled) {
        this.colorForm.disable();
      } else {
        this.colorForm.enable();
      }
    }
  }
  
  private emitValue(): void {
    const value = {
      color: this.useColor ? this.selectedColor : undefined,
      useColor: this.useColor
    };
    this.onChange(value);
    this.onTouch();
  }
}
