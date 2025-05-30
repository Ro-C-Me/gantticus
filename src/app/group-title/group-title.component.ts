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

  showDeleteIcon = false;

  onTitleClick() {
    this.clicked.emit(this.item);
  }

  onDeleteClick() {
    this.deleted.emit(this.item);
  
  }
}
