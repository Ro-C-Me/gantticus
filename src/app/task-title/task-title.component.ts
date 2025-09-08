import type { GanttItem } from '@worktile/gantt';
import { Component, Input, Output, EventEmitter  } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Task, Status } from '../domain/Task';

@Component({
  selector: 'app-task-title',
  standalone : true,
  imports: [CommonModule],
  templateUrl: './task-title.component.html',
  styleUrl: './task-title.component.scss'
})
export class TaskTitleComponent {
  @Input() item!: GanttItem;
  @Output() deleted = new EventEmitter<GanttItem>();
  @Output() clicked = new EventEmitter<GanttItem>();

  showIcons = false;

  getUrl() {
    if (this.item.origin instanceof Task) {
      return this.item.origin.ticketUrl;
    }
    else {
      console.error("origin is no Task!!!");
      return '';
    }
  }

  hasUrl(): boolean {
    if (this.item.origin instanceof Task) {
      return this.item.origin.ticketUrl.trim() != '';
    }
    else {
      console.error("origin is no Task!!!");
      return false;
    }
  }

  onTitleClick(event: MouseEvent) {
    event.stopPropagation();
    this.clicked.emit(this.item);
  }

  onLinkClick(event: MouseEvent) {
    event.stopPropagation();
    window.open(this.getUrl(), '_blank', 'noopener');
  }

  onDeleteClick(event: MouseEvent) {
    event.stopPropagation();
    this.deleted.emit(this.item);
  }
}
