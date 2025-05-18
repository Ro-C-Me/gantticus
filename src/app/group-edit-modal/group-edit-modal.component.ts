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
    this.groupForm = this.fb.group({
      title: ['', Validators.required],
    });
  }

  ngOnInit() {
    console.log("This is INIT!!!");
    this.groupForm = this.fb.group({
      title: [this.group.title, Validators.required],
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
    this.activeModal.close(this.group);
  }
}
