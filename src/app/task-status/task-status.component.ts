import { Component, EventEmitter, Input, Output, model} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Task, Status } from '../domain/Task';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-task-status',
  templateUrl: './task-status.component.html',
  styleUrls: ['./task-status.component.scss'],
  imports: [NgbModule, CommonModule]
})
export class TaskStatusComponent {

  @Input() status: Status = Status.OPEN; // Default status
  @Output() statusChange = new EventEmitter<Status>(); // Emit status changes

  @Input() progress : number = 0.0;
  @Output() progressChange = new EventEmitter<number>();

  @Input() showProgress: boolean = true;

  onProgressChange() {
    this.progressChange.emit(this.progress);
  }

  changeProgress($event: WheelEvent) {
    $event.preventDefault(); // Verhindert das Scrollen der Seite
    const step = 0.05; // Schrittweite, z.B. 2 Prozent pro "Klick"
    if ($event.deltaY < 0) {
      // Mausrad nach oben: Fortschritt erhöhen
      this.progress = Math.min(1.0, this.progress + step);
    } else if ($event.deltaY > 0) {
      // Mausrad nach unten: Fortschritt verringern
      this.progress = Math.max(0, this.progress - step);
    }
    this.onProgressChange(); // Emit the new progress value
    console.log(this.progress);
  }

  // Change the status on icon click
  changeStatus(event: MouseEvent): void {
    event.stopPropagation()
    switch (this.status) {
      case Status.OPEN:
        this.status = Status.IN_PROGRESS;
        break;
      case Status.IN_PROGRESS:
        this.status = Status.DONE;
        this.progress = 1.0;
        this.onProgressChange();
        break;
      case Status.DONE:
        this.status = Status.OPEN;
        break;
    }
    this.statusChange.emit(this.status); // Emit the updated status
  }
}