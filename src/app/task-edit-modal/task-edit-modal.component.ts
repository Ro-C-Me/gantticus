import { Component, Input, OnInit} from '@angular/core';
import { NgbActiveModal, NgbDateStruct, NgbDatepickerModule } from '@ng-bootstrap/ng-bootstrap';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Task } from '../domain/Task';

@Component({
  selector: 'app-task-edit-modal',
  standalone: true,
  templateUrl: './task-edit-modal.component.html',
  styleUrls: ['./task-edit-modal.component.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NgbDatepickerModule
  ]
})
export class TaskEditModalComponent implements OnInit {

  @Input() task!: Task;

  @Input() tasks!: Task[];
  
  selectedDependencies : string[] = [];

  taskForm!: FormGroup;

  constructor(public activeModal: NgbActiveModal, private fb: FormBuilder) {}

  ngOnInit() {
    this.taskForm = this.fb.group({
      title: [this.task.title, Validators.required],
      ticketUrl: [this.task.ticketUrl],
      start: [this.toNgbDate(this.task.start), Validators.required],
      end: [this.toNgbDate(this.task.end), Validators.required],
      milestone: [this.task.milestone],
      scheduleFinalized: [this.task.scheduleFinalized],
      useColor: [this.task.color],
      color: [{ value: this.task.color || '#6698FF', disabled: !this.task.color }]
    });


    this.taskForm.get('useColor')?.valueChanges.subscribe(useColor => {
      const colorControl = this.taskForm.get('color');
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

    this.selectedDependencies = this.task.dependsOn;
  }

  // Hilfsfunktion: Date zu NgbDateStruct
  toNgbDate(date?: Date): NgbDateStruct | null {
    if (!date) return null;
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate()
    };
  }

  // Hilfsfunktion: NgbDateStruct zu Date
  fromNgbDate(ngbDate: NgbDateStruct): Date | null {
    if (!ngbDate) return null;
    return new Date(ngbDate.year, ngbDate.month - 1, ngbDate.day);
  }

  onDependencyToggle(depencyId: string,$event: Event) {
    const checked = ($event.target as HTMLInputElement).checked;
    console.log("dependency to " + depencyId + " changed to " + checked);
    if (checked) {
      this.selectedDependencies.push(depencyId);
    }
    else {
      const index = this.selectedDependencies.indexOf(depencyId);
      if (index > -1) {
        this.selectedDependencies.splice(index, 1);
      }
    }

    console.log(" current dependencies: ");
    console.log(this.selectedDependencies);
  }

  // Validierung: Enddatum nach Startdatum
  isEndAfterStart(): boolean {
    const start = this.fromNgbDate(this.taskForm.value.start);
    const end = this.fromNgbDate(this.taskForm.value.end);
    return !!start && !!end && end > start;
  }

  onCancel() {
    this.activeModal.dismiss();
  }

  onOk() {
    if (this.taskForm.invalid) {
      this.taskForm.markAllAsTouched();
      return;
    }
    if (!this.isEndAfterStart()) {
      alert('Das Enddatum muss nach dem Startdatum liegen.');
      return;
    }
    // Änderungen übernehmen
    this.task.title = this.taskForm.value.title;
    this.task.ticketUrl = this.taskForm.value.ticketUrl;
    this.task.start = this.fromNgbDate(this.taskForm.value.start)!;
    this.task.end = this.fromNgbDate(this.taskForm.value.end)!;
    this.task.milestone = this.taskForm.value.milestone;
    this.task.scheduleFinalized = this.taskForm.value.scheduleFinalized;
    if (this.taskForm.value.useColor) {
      this.task.color = this.taskForm.value.color;
    }
    else {
      this.task.color = undefined;
    }
    this.activeModal.close(this.task);
  }
}
