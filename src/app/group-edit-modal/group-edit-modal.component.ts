import { Component, Input, OnInit } from '@angular/core';
import { NgbActiveModal, NgbDateStruct, NgbDatepickerModule } from '@ng-bootstrap/ng-bootstrap';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Group } from '../domain/Task';
import { ColorSelectionComponent } from '../color-selection/color-selection.component';

@Component({
  selector: 'app-group-edit-modal',
  imports: [ReactiveFormsModule, CommonModule, ColorSelectionComponent],
  templateUrl: './group-edit-modal.component.html',
  styleUrl: './group-edit-modal.component.scss'
})
export class GroupEditModalComponent {
  @Input() group!: Group;

  groupForm!: FormGroup;
  selectedColor: string = '#6698FF';

  constructor(public activeModal: NgbActiveModal, private fb: FormBuilder) {

  }

  ngOnInit() {
    this.groupForm = this.fb.group({
      title: [this.group.title, Validators.required],
      useColor: [!!this.group.color],
      color: [this.group.color || '#6698FF']
    });

    this.selectedColor = this.group.color || '#6698FF';

  }
  onColorChanged(color: string) {
    this.selectedColor = color;
    this.groupForm.get('color')?.setValue(color);
  }

  onUseColorChanged(useColor: boolean) {
    this.groupForm.get('useColor')?.setValue(useColor);
  }

  onCancel() {
    this.activeModal.dismiss();
  }

  onOk() {
    if (this.groupForm.invalid) {
      this.groupForm.markAllAsTouched();
      return;
    }

    // Änderungen übernehmen
    this.group.title = this.groupForm.value.title;
    if (this.groupForm.value.useColor) {
      this.group.color = this.selectedColor;
    }
    else {
      this.group.color = undefined;
    }
    this.activeModal.close(this.group);
  }
}
