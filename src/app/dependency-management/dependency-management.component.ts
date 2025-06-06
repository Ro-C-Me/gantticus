// dependency-management.component.ts
import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { Dependency, DependencyType, Task } from '../domain/Task';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-dependency-management',
  imports: [FormsModule],
  templateUrl: './dependency-management.component.html',
  styleUrls: ['./dependency-management.component.scss']
})
export class DependencyManagementComponent implements OnInit {

  @Input() currentTask!: Task;
  @Input() tasks: Task[] = [];
  @Input() dependencies: Dependency[] = [];
  @Output() dependenciesChange = new EventEmitter<Dependency[]>();

  dependencyTypes = [
    { key: DependencyType.FS, label: 'Finish-to-Start (FS)', tooltip: 'Der Task kann erst beginnen, wenn der Vorgänger abgeschlossen ist.' },
    { key: DependencyType.FF, label: 'Finish-to-Finish (FF)', tooltip: 'Der Task kann erst abgeschlossen werden, wenn der Vorgänger abgeschlossen ist.' },
    { key: DependencyType.SS, label: 'Start-to-Start (SS)', tooltip: 'Der Task kann erst beginnen, wenn der Vorgänger begonnen hat.' },
    { key: DependencyType.SF, label: 'Start-to-Finish (SF)', tooltip: 'Der Task kann erst abgeschlossen werden, wenn der Vorgänger begonnen hat.' }
  ];

  // Auswahlmodelle für Dropdowns
  selectedTaskId: string | null = null;
  selectedType: DependencyType = DependencyType.FS;

  // Liste der Tasks ohne den aktuellen Task
  get selectableTasks(): Task[] {
    return this.tasks.filter(t => t.id !== this.currentTask.id);
  }

  ngOnInit(): void {
    // Optional: Vorauswahl auf ersten Task, falls vorhanden
    if (this.selectableTasks.length > 0) {
      this.selectedTaskId = this.selectableTasks[0].id;
    }
  }

  addDependency(): void {
    if (!this.selectedTaskId) return;

    // Prüfen, ob Abhängigkeit schon existiert
    const exists = this.dependencies.some(dep =>
      dep.taskId === this.selectedTaskId && dep.type === this.selectedType
    );
    if (exists) {
      return;
    }

    // Neue Abhängigkeit hinzufügen
    this.dependencies = [...this.dependencies, { taskId: this.selectedTaskId, type: this.selectedType }];
    this.dependenciesChange.emit(this.dependencies);
  }

  removeDependency(depToRemove: Dependency): void {
    this.dependencies = this.dependencies.filter(dep =>
      !(dep.taskId === depToRemove.taskId && dep.type === depToRemove.type)
    );
    this.dependenciesChange.emit(this.dependencies);
  }

  // Hilfsmethode: Task-Name anhand ID
  getTaskTitleById(id: string): string {
    const task = this.tasks.find(t => t.id === id);
    return task ? task.title : '(Unbekannter Task)';
  }

  // Gruppierung der Abhängigkeiten nach Typ
  get dependenciesGroupedByType(): { type: DependencyType, items: Dependency[] }[] {
    return this.dependencyTypes.map(dt => ({
      type: dt.key,
      items: this.dependencies.filter(dep => dep.type === dt.key)
    })).filter(group => group.items.length > 0);
  }


  getLabelByGroupType(type: DependencyType): string {
    const found = this.dependencyTypes.find(dt => dt.key === type);
    return found ? found.label : '';
  }
}
