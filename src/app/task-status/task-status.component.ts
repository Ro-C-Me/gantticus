import { Component, EventEmitter, Input, Output, model} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Task, Status } from '../domain/Task';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { UndoRedoService } from '../undo-redo.service';
import { Chart } from '../domain/Chart';
import { TaskStructureCache } from '../task-structure.cache';

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
  
  // Neue Inputs für Validation
  @Input() task!: Task; // Der aktuelle Task
  
  // Neuer Output für Validation-Errors
  @Output() validationError = new EventEmitter<string>();
  
  // Referenz auf das aktuelle Chart, um Änderungen zu speichern
  @Input() chart?: Chart;
  
  constructor(private undoRedoService: UndoRedoService, private taskStructure: TaskStructureCache) {}

  onProgressChange() {
    this.progressChange.emit(this.progress);
  }

  changeProgress($event: WheelEvent) {
    $event.preventDefault(); // Verhindert das Scrollen der Seite
    
    // Prüfen ob dieser Task von seinen Kindern abgeleitet wird
    if (this.isTaskDerived()) {
      // Für abgeleitete Tasks keine Progress-Änderung erlauben
      this.validationError.emit('Der Fortschritt dieses Tasks wird automatisch aus seinen Unter-Tasks berechnet und kann nicht manuell geändert werden.');
      return;
    }
    
    const step = 0.05; // Schrittweite, z.B. 2 Prozent pro "Klick"
    if ($event.deltaY < 0) {
      // Mausrad nach oben: Fortschritt erhöhen
      this.progress = Math.min(1.0, this.progress + step);
    } else if ($event.deltaY > 0) {
      // Mausrad nach unten: Fortschritt verringern
      this.progress = Math.max(0, this.progress - step);
    }
    
    // Debounced Speicherung des Zustands
    if (this.chart) {
      this.undoRedoService.debouncedSaveState(this.chart);
    }
    
    this.onProgressChange(); // Emit the new progress value
    console.log(this.progress);
  }

  // Change the status on icon click
  changeStatus(event: MouseEvent): void {
    event.stopPropagation();
    
    // Prüfen ob dieser Task von seinen Kindern abgeleitet wird
    if (this.isTaskDerived()) {
      // Für abgeleitete Tasks keine Statusänderung erlauben
      this.validationError.emit('Der Status dieses Tasks wird automatisch aus seinen Unter-Tasks berechnet und kann nicht manuell geändert werden.');
      return;
    }
    
    const newStatus = this.getNextStatus(this.status);
    
    // Validation BEVOR die Änderung gemacht wird
    const validation = this.validateStatusChange(newStatus);
    if (!validation.allowed) {
      // Validation-Error emittieren statt Toast direkt zu zeigen
      this.validationError.emit(validation.reason!);
      return; // Status bleibt unverändert
    }
    
    // Nur wenn erlaubt: Status ändern
    this.status = newStatus;
    if (newStatus === Status.DONE) {
      this.progress = 1.0;
      this.onProgressChange();
    }
    
    this.statusChange.emit(this.status);
  }

  // Prüft ob der Status dieses Tasks aus seinen Kindern abgeleitet wird
  isTaskDerived(): boolean {
    return this.task?.computeFromChildren === true;
  }

  private getNextStatus(currentStatus: Status): Status {
    switch (currentStatus) {
      case Status.OPEN:
        return Status.IN_PROGRESS;
      case Status.IN_PROGRESS:
        return Status.DONE;
      case Status.DONE:
        return Status.ARCHIVED;
      case Status.ARCHIVED:
        return Status.OPEN;
      default:
        return Status.OPEN;
    }
  }

  private validateStatusChange(newStatus: Status): { allowed: boolean, reason?: string } {
    if (!this.task) {
      return { allowed: false, reason: 'Task nicht verfügbar für Validation' };
    }

    // Validierung nur für Parent-Tasks mit Children
    const childTasks = this.getChildTasks(this.task.id);
    if (childTasks.length === 0) {
      return { allowed: true }; // Child-Tasks oder Tasks ohne Children können frei geändert werden
    }

    // Parent-Task Validierungen
    if (newStatus === Status.DONE) {
      const allChildrenDone = childTasks.every(child => child.status === Status.DONE);
      if (!allChildrenDone) {
        const openChildren = childTasks.filter(child => child.status !== Status.DONE);
        return { 
          allowed: false, 
          reason: `Parent-Task kann nicht auf DONE gesetzt werden. ${openChildren.length} Child-Task(s) sind noch nicht abgeschlossen.` 
        };
      }
    } else if (newStatus === Status.ARCHIVED) {
      const allChildrenArchived = childTasks.every(child => child.status === Status.ARCHIVED);
      if (!allChildrenArchived) {
        const nonArchivedChildren = childTasks.filter(child => child.status !== Status.ARCHIVED);
        return { 
          allowed: false, 
          reason: `Parent-Task kann nicht archiviert werden. ${nonArchivedChildren.length} Child-Task(s) sind noch nicht archiviert.` 
        };
      }
    }

    return { allowed: true };
  }

  private getChildTasks(parentId: string): Task[] {
    const parentTask = this.taskStructure.getAllTasks().find(t => t.id === parentId);
    if (!parentTask || !parentTask.children) {
      return [];
    }
    
    // Child-Task-IDs in tatsächliche Task-Objekte umwandeln
    return parentTask.children
      .map(childId => this.taskStructure.getAllTasks().find(t => t.id === childId))
      .filter((task): task is Task => task !== undefined);
  }
}