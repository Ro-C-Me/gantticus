import type { GanttItem } from '@worktile/gantt';
import { Component, Input, Output, EventEmitter  } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-task-title',
  standalone : true,
  imports: [CommonModule],
  templateUrl: './task-title.component.html',
  styleUrl: './task-title.component.scss'
})
export class TaskTitleComponent {

  @Input() item!: GanttItem;
  @Output() clicked = new EventEmitter<GanttItem>();
  @Output() deleted = new EventEmitter<GanttItem>();

  showDeleteIcon = false;

  onTitleClick() {
    this.clicked.emit(this.item);
  }

  onDeleteClick() {
    this.deleted.emit(this.item);
  
  }
}
