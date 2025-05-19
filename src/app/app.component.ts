import { Component } from '@angular/core';
import { NgxGanttModule, GanttItem, GANTT_GLOBAL_CONFIG, GanttI18nLocale, GanttItemType, GanttViewType, GanttDragEvent, GanttTableDragDroppedEvent } from '@worktile/gantt';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { BaseItem, Group, Task } from './domain/Task';
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

  title = 'gannticus';

  tasksById: Map<string, Task> = new Map();
  groupsById : Map<string, Group> = new Map();

  topLevelItems : BaseItem[] = [];
  items: GanttItem[] = [];

  viewTypeOptions = [
    { label: 'Quartal', value: GanttViewType.quarter },
    { label: 'Monat', value: GanttViewType.month },
    { label: 'Woche', value: GanttViewType.week },
    { label: 'Tag', value: GanttViewType.day }
  ];

  viewType : GanttViewType= GanttViewType.day;

  constructor(private modalService: NgbModal) {
    let task0 = new Task({ id: '000000', title: 'Task 0', start: new Date("2025-05-06"), end: new Date("2025-05-08")});
    this.tasksById.set(task0.id, task0);
    task0.computedStart = task0.start ? task0.start : new Date();
    task0.computedEnd = task0.end ? task0.end : new Date();
    
    let task1 = new Task({ id: '000001', title: 'Task 1', start: new Date("2025-05-05"), end: new Date("2025-05-09")});
    this.tasksById.set(task1.id, task1);
    task1.computedStart = task1.start ? task1.start : new Date();
    task1.computedEnd = task1.end ? task1.end : new Date();
    
    let task2 = new Task({ id: '000002', title: 'Task 2', start: new Date("2025-05-10"), end: new Date("2025-05-10")});
    this.tasksById.set(task2.id, task2);
    task2.computedStart = task2.start ? task2.start : new Date();
    task2.computedEnd = task2.end ? task2.end : new Date();

    let task3 = new Task({ id: '000003', title: 'Task 3', start: new Date("2025-05-10"), end: new Date("2025-05-10"), milestone : true});
    this.tasksById.set(task3.id, task3);
    task3.computedStart = task3.start ? task3.start : new Date();
    task3.computedEnd = task3.end ? task3.end : new Date();

    let task4 = new Task({ id: '000004', title: 'Task 4', start: new Date("2025-05-25"), end: new Date("2025-05-25"), milestone : true});
    this.tasksById.set(task4.id, task4);
    task4.computedStart = task4.start ? task4.start : new Date();
    task4.computedEnd = task4.end ? task4.end : new Date();

    let group0 = new Group({id: 'group0', title: 'Group 0'});
    group0.children.push(task4.toBaseItem());
    this.groupsById.set(group0.id, group0);

    task0.dependsOn.push(task1.id);
    task2.dependsOn.push(task1.id);
    task3.dependsOn.push(task1.id);
    task4.dependsOn.push(task1.id);

    this.topLevelItems.push(task0.toBaseItem());
    this.topLevelItems.push(task1.toBaseItem());
    this.topLevelItems.push(task2.toBaseItem());
    this.topLevelItems.push(task3.toBaseItem());
    this.topLevelItems.push(group0.toBaseItem());
    this.updateGanntItems();
  }
  
onIdClick(id: string) {
  console.log("start editing " + id);
  if (this.tasksById.has(id)) {
    console.log("edit a task");
    this.startTaskEditDialog(this.tasksById.get(id)!);
  }
  else if (this.groupsById.has(id)) {
    console.log("edit a group");
    this.startGroupEditDialog(this.groupsById.get(id)!);
  }
  else {
    console.error("No known element with id " + id + " to edit");
  }
}

  private startTaskEditDialog(taskToEdit: Task) {
    const modalRef = this.modalService.open(TaskEditModalComponent, { centered: true });
    // Kopie übergeben, damit Änderungen erst bei OK übernommen werden
    modalRef.componentInstance.task = { ...taskToEdit };
    modalRef.componentInstance.tasks = Array.from(this.tasksById.values());

    modalRef.result.then(
      (result) => {
        this.tasksById.set(result.id, result);
        
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
        this.groupsById.set(result.id, result);
        
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

      const toChange = this.tasksById.get($event.item.id);
      if (!toChange) {
        console.error("no task to change!");
      }
      else {
        toChange.start = this.toDate($event.item.start);
        toChange.end = this.toDate($event.item.end);
        this.recomputeTasks(toChange);
      }
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


    onRowDragDropped($event: GanttTableDragDroppedEvent<unknown>) {
      const id = $event.source.id;
        console.log("drag dropped a row: " + id + " " + $event.dropPosition + " " + $event.target.id + " in " + $event.targetParent?.id);
        console.log($event);

        let sourceParent : BaseItem[] = this.topLevelItems; 
        if ($event.sourceParent && this.groupsById.has($event.sourceParent.id)) {
          sourceParent = this.groupsById.get($event.sourceParent.id)!.children;
        }
        else{
          console.log("We use topLevel here");
        }

        let sourceParentIndex = sourceParent.findIndex(t => t.id == id);

        if (sourceParentIndex == -1) {
          console.error("Can't find element with id " + id + " in given parent source. sourceParent: ");
          console.log(sourceParent);
          return;
        }
        const toMove = sourceParent[sourceParentIndex];
        sourceParent.splice(sourceParentIndex, 1);

        let targetParent : BaseItem[] = this.topLevelItems; 
        let targetIndex = 0;

        //inside a group or task
        if ($event.dropPosition == 'inside') {
          let group = this.groupsById.get($event.target.id);
          if (group) {
            targetParent = group.children;
          }
        }

        else {
          if ($event.targetParent && this.groupsById.has($event.targetParent.id)) {
            targetParent = this.groupsById.get($event.targetParent.id)!.children;
          }

          targetIndex = targetParent.findIndex(t => t.id == $event.target.id);
          if (targetIndex == -1) {
            console.error("can't find element to insert before / after");
            targetIndex = 0;
          } 
          if ($event.dropPosition == 'after') {
            targetIndex++;
          }
        }
        
        targetParent.splice(targetIndex, 0, toMove);

        this.updateGanntItems();
      }



  onAddTask() {
    let id = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    let newTask: Task = new Task({ id: id, title: '', start: new Date("2025-05-01"), end: new Date("2025-05-15") });
    this.tasksById.set(newTask.id, newTask);
    this.topLevelItems.push({id : newTask.id, type: 'task'});
    newTask.computedStart = newTask.start ? newTask.start : new Date();
    newTask.computedEnd = newTask.end ? newTask.end : new Date();
    this.updateGanntItems();
    this.startTaskEditDialog(newTask);

  }

  onAddGroup() {
    let id = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    let newGroup: Group = new Group({ id: id, title: '' });
    this.topLevelItems.push({id : newGroup.id, type: 'group'});
    this.updateGanntItems();
    this.startGroupEditDialog(newGroup);
  }

  updateGanntItems() {
    let tasks : BaseItem[] = this.topLevelItems;
    let items :  GanttItem[] = [];
    let itemMap = new Map<string, GanttItem>();
    let tasksById = this.tasksById;
    let groupsById = this.groupsById;

    updateGanntItems(tasks, items);
    this.items = items;

    function updateGanntItems(tasks: BaseItem[], items : GanttItem[]) {
      console.log("task length:" + tasks.length);
      console.log(tasks);

      tasks.forEach(entry => {
        if (entry.type == 'task') {
          let task = tasksById.get(entry.id);
          if (!task) {
            console.log("error: can't find task with id " + entry.id);
          }
          else {
            let item: GanttItem = {
              id: task.id,
              title: task.title,
              start: task.computedStart,
              end: task.computedEnd,
              links: []
            };
            item.itemDraggable = true;
            if (task.milestone) {
              item.barStyle = {
                clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)'
              };
              item.color = 'red';
            }
  
            itemMap.set(task.id, item);
            items.push(item);
          }
        }
        else if (entry.type == 'group') {
          console.log("Found a group: " + entry.id);
          let group = groupsById.get(entry.id);
          if (!group) {
            console.log("error: can't find group with id " + entry.id);
          }
          else {
          let item: GanttItem = {
            id: group.id,
            title: group.title
          };
          items.push(item);
          if (item.children === undefined) {
            item.children = [];
          }
          updateGanntItems(group.children, item.children);
        }
      }
    });

      tasks.filter(t => t instanceof Task).forEach(t => {
        t.dependsOn.forEach(d => {
          itemMap.get(d)?.links?.push(t.id);
        });
      });

      console.log(items);
    }

    Array.from(this.tasksById.values()).forEach(t => {
      t.dependsOn.forEach(d => {
        let item = itemMap.get(d);
        if (!item) {
          console.error("couldn't find an item for task " + d);
        }
        else {
          if (!item.links) {
            item.links = [];
          }
          item.links.push(t.id);
        }
      });
    });
  }
}
