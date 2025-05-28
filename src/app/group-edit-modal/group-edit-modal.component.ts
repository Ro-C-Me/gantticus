import { Component, Input, OnInit } from '@angular/core';
import { NgbActiveModal, NgbDateStruct, NgbDatepickerModule } from '@ng-bootstrap/ng-bootstrap';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Group } from '../domain/Task';

@Component({
  selector: 'app-group-edit-modal',
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './group-edit-modal.component.html',
  styleUrl: './group-edit-modal.component.scss'
})
export class GroupEditModalComponent {
  @Input() group!: Group;

  groupForm!: FormGroup;

  constructor(public activeModal: NgbActiveModal, private fb: FormBuilder) {

  }

  ngOnInit() {
    this.groupForm = this.fb.group({
      title: [this.group.title, Validators.required],
      useColor: [this.group.color],
      color: [{ value: this.group.color || '#6698FF', disabled: !this.group.color }]
    });

    this.groupForm.get('useColor')?.valueChanges.subscribe(useColor => {
      const colorControl = this.groupForm.get('color');
      if (useColor) {
        colorControl?.enable();
        // Optional: Standardfarbe setzen, falls leer
        if (!colorControl?.value) colorControl?.setValue('#6698FF');
      } else {
        colorControl?.disable();
        // Optional: Wert zurücksetzen, falls gewünscht
        // colorControl?.setValue(null);
      }
    });

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
      this.group.color = this.groupForm.value.color;
    }
    else {
      this.group.color = undefined;
    }
    this.activeModal.close(this.group);
  }
}
