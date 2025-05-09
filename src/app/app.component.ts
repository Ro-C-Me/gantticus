import { Component } from '@angular/core';
import { NgxGanttModule, GanttItem, GANTT_GLOBAL_CONFIG, GanttI18nLocale, GanttItemType, GanttViewType } from '@worktile/gantt';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  standalone: false
})
export class AppComponent {
  title = 'gannticus';

  items: GanttItem[] = [
    { id: '000000', title: 'Task 0', start: new Date("2025-05-06"), end: new Date("2025-05-08"), expandable: true,  color: "#000000", children : [{ id: '0000042', title: 'Task 42', start: new Date("2025-05-10"), end: new Date("2025-05-10") }]},
    { id: '000001', title: 'Task 1', start: new Date("2025-05-05"), end: new Date("2025-05-09"), links: ['000003', '000002', '000000'], expandable: true },
    { id: '000002', title: 'Task 2', start: new Date("2025-05-10"), end: new Date("2025-05-10") },
    { id: '000003', title: 'Task 3', start: new Date("2025-05-10"), end: new Date("2025-05-10"),   barStyle: {
      clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)'
    }, color: 'red'}
  ];

  viewTypeOptions = [
    { label: 'Quartal', value: GanttViewType.quarter },
    { label: 'Monat', value: GanttViewType.month },
    { label: 'Woche', value: GanttViewType.week },
    { label: 'Tag', value: GanttViewType.day }
  ];

  viewType : GanttViewType= GanttViewType.day;

  onAddTask() {
    // Logik zum Hinzufügen eines neuen Tasks
    console.log('Neuer Task wird hinzugefügt');
    this.items = [...this.items, { id: '0000043', title: 'Task 43', start: new Date("2025-05-01"), end: new Date("2025-05-15") }];
    console.log('task added, items size: ' + this.items.length);
  }
}
