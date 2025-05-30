import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { GanttGroup } from '@worktile/gantt';

@Component({
  selector: 'app-group-title',
  imports: [CommonModule],
  templateUrl: './group-title.component.html',
  styleUrl: './group-title.component.scss'
})
export class GroupTitleComponent {

  @Input() item!: GanttGroup;
  @Output() clicked = new EventEmitter<GanttGroup>();
  @Output() deleted = new EventEmitter<GanttGroup>();
  @Output() taskAdded = new EventEmitter<GanttGroup>();

  showIcons = false;

  onTitleClick(event: MouseEvent) {
    event.stopPropagation();
    this.clicked.emit(this.item);
  }

  onDeleteClick(event: MouseEvent) {
    event.stopPropagation();
    this.deleted.emit(this.item);
  }

  onAddClick(event: MouseEvent) {
    event.stopPropagation();
    this.taskAdded.emit(this.item);
  }
}
