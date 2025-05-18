import { Component } from '@angular/core';
import { NgxGanttModule, GanttItem, GANTT_GLOBAL_CONFIG, GanttI18nLocale, GanttItemType, GanttViewType, GanttDragEvent, GanttTableDragDroppedEvent } from '@worktile/gantt';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Group, Task } from './domain/Task';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TaskEditModalComponent } from './task-edit-modal/task-edit-modal.component';
import { GroupEditModalComponent } from './group-edit-modal/group-edit-modal.component';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  standalone: false
})
export class AppComponent {

onIdClick(id: string) {
  console.log("start editing " + id);
  const toEdit = this.findById(id, this.tasks);
  if (!toEdit) {
    console.warn("Unknown Group | Task to edit");
  }
  else if (toEdit instanceof Task) {
    console.log("edit a task");
    this.startTaskEditDialog(toEdit);
  }
  else if (toEdit instanceof Group) {
    console.log("edit a group");
    this.startGroupEditDialog(toEdit);
  }
  else {
    console.log("edit sth else");
  }
}

  private findById(id: string, tasks: (Task | Group) []) : Task | Group | undefined {
    for (const item of tasks) {
      if (item.id === id) {
        return item;
      } else if (item instanceof Group) {
        let taskFound : Task | Group | undefined = this.findById(id, item.children);
        if (taskFound != undefined) {
          return taskFound;
        }
      }
    }
    return undefined;
  }

  private replaceItemWithSameId(newItem: Task | Group, tasks: (Task | Group) []) : boolean {
    console.log(newItem instanceof Task);
    const idx = tasks.findIndex(t => t.id === newItem.id);
    console.log("new index: " + idx);
    if (idx != -1) {
      tasks[idx] = newItem;
      return true;
    }

    for (const t of tasks) {
      if (t instanceof Group) {
        if (this.replaceItemWithSameId(newItem, t.children)) {
          return true;
        }
      }
    }
  
    return false;
  }



  private startTaskEditDialog(taskToEdit: Task) {
    const modalRef = this.modalService.open(TaskEditModalComponent, { centered: true });
    // Kopie übergeben, damit Änderungen erst bei OK übernommen werden
    modalRef.componentInstance.task = { ...taskToEdit };

    modalRef.result.then(
      (result) => {
        // Änderungen übernehmen
        const idx = this.tasks.findIndex(t => t.id === result.id);
        if (!this.replaceItemWithSameId(new Task(result), this.tasks)) {
          console.error("Unknown edited task (id: " + result.id + ")");
          return;
        }
        this.recomputeTasks(result);
        this.updateGanntItems();
      },
      (reason) => {
      }
    );
  }

  private startGroupEditDialog(toEdit: Group) {
    console.log("start editing a group:");
    console.log(toEdit);
    const modalRef = this.modalService.open(GroupEditModalComponent, { centered: true });
    // Kopie übergeben, damit Änderungen erst bei OK übernommen werden
    modalRef.componentInstance.group = { ...toEdit };


    modalRef.result.then(
      (result) => {
        // Änderungen übernehmen
        const idx = this.tasks.findIndex(t => t.id === result.id);
        if (!this.replaceItemWithSameId(new Task(result), this.tasks)) {
          console.error("Unknown edited group (id: " + result.id + ")");
          return;
        }
        this.recomputeTasks(result);
        this.updateGanntItems();
      },
      (reason) => {
      }
    );
  }

  recomputeTasks(t: Task) {
    t.computedStart = t.start ? t.start : new Date();;
    t.computedEnd = t.end ? t.end : new Date();
  }

    dragEnded($event: GanttDragEvent) {
      console.log("drag ended:");
      console.log($event);
      console.log($event.item.id + "now starts at " + $event.item.start + " and ends at " + $event.item.end);

      this.tasks.filter(t => t instanceof Task).forEach(element => {
          if (element.id == $event.item.id) {
            element.start = this.toDate($event.item.start);
            element.end = this.toDate($event.item.end);
            this.recomputeTasks(element);
            this.updateGanntItems();
          }
      });
    }

    toDate(value: number | Date | undefined): Date | undefined {
      if (typeof value === 'number') {
        return new Date(value * 1000); // number wird zu Date umgewandelt
      }
      if (value instanceof Date) {
        return value; // bereits ein Date
      }
      return undefined; // undefined bleibt undefined
    }

    dragStarted($event: GanttDragEvent) {
      console.log("drag started:");
      console.log($event);
    }
  title = 'gannticus';

tasks : (Task | Group) [] = [];

  items: GanttItem[] = [
  ];

  viewTypeOptions = [
    { label: 'Quartal', value: GanttViewType.quarter },
    { label: 'Monat', value: GanttViewType.month },
    { label: 'Woche', value: GanttViewType.week },
    { label: 'Tag', value: GanttViewType.day }
  ];

  viewType : GanttViewType= GanttViewType.day;

  constructor(private modalService: NgbModal) {
    let task0 = new Task({ id: '000000', title: 'Task 0', start: new Date("2025-05-06"), end: new Date("2025-05-08")});
    task0.computedStart = task0.start ? task0.start : new Date();
    task0.computedEnd = task0.end ? task0.end : new Date();
    
    let task1 = new Task({ id: '000001', title: 'Task 1', start: new Date("2025-05-05"), end: new Date("2025-05-09")});
    task1.computedStart = task1.start ? task1.start : new Date();
    task1.computedEnd = task1.end ? task1.end : new Date();
    
    let task2 = new Task({ id: '000002', title: 'Task 2', start: new Date("2025-05-10"), end: new Date("2025-05-10")});
    task2.computedStart = task2.start ? task2.start : new Date();
    task2.computedEnd = task2.end ? task2.end : new Date();

    let task3 = new Task({ id: '000003', title: 'Task 3', start: new Date("2025-05-10"), end: new Date("2025-05-10"), milestone : true});
    task3.computedStart = task3.start ? task3.start : new Date();
    task3.computedEnd = task3.end ? task3.end : new Date();

    let task4 = new Task({ id: '000004', title: 'Task 4', start: new Date("2025-05-25"), end: new Date("2025-05-25"), milestone : true});
    task4.computedStart = task4.start ? task4.start : new Date();
    task4.computedEnd = task4.end ? task4.end : new Date();
    let group0 = new Group({id: 'group0', title: 'Group 0'});
    group0.children.push(task4);

    task0.dependsOn.push(task1);
    task2.dependsOn.push(task1);
    task3.dependsOn.push(task1);
    task4.dependsOn.push(task1);
    this.tasks = [task0, task1, task2, task3, group0];

    this.updateGanntItems();
  }

  onAddTask() {
    let id = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    let newTask: Task = new Task({ id: id, title: '', start: new Date("2025-05-01"), end: new Date("2025-05-15") });
    this.tasks.push(newTask);
    newTask.computedStart = newTask.start ? newTask.start : new Date();
    newTask.computedEnd = newTask.end ? newTask.end : new Date();
    this.updateGanntItems();
    this.startTaskEditDialog(newTask);

  }

  onAddGroup() {
    let id = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    let newGroup: Group = new Group({ id: id, title: '' });
    this.tasks.push(newGroup);
    this.updateGanntItems();
    this.startGroupEditDialog(newGroup);
  }

  updateGanntItems() {
    let tasks : (Task | Group)[] = this.tasks;
    let items :  GanttItem[] = [];
    let itemMap = new Map<string, GanttItem>();

    updateGanntItems(tasks, items);
    this.items = items;

    function updateGanntItems(tasks: (Task | Group)[], items :  GanttItem[]) {
      console.log("task length:" + tasks.length);
      console.log(tasks);

      tasks.forEach(task => {
        if (task instanceof Task) {
          let item: GanttItem = {
            id: task.id,
            title: task.title,
            start: task.computedStart,
            end: task.computedEnd,
            links: []
          };
          item.itemDraggable = false;
          if (task.milestone) {
            item.barStyle = {
              clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)'
            };
            item.color = 'red';
          }

          itemMap.set(task.id, item);
          items.push(item);
        }


        else if (task instanceof Group) {
          let item: GanttItem = {
            id: task.id,
            title: task.title
          };
          items.push(item);
          if (item.children === undefined) {
            item.children = [];
          }
          updateGanntItems(task.children, item.children);
        }
      });

      tasks.filter(t => t instanceof Task).forEach(t => {
        t.dependsOn.forEach(d => {
          console.log(t.id + " depends on " + d.id);
          itemMap.get(d.id)?.links?.push(t.id);
        });
      });

      console.log(items);
    }
  }
}
