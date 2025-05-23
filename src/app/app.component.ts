import { Component, ViewChild, ElementRef } from '@angular/core';
import { NgxGanttModule, GanttItem, GANTT_GLOBAL_CONFIG, GanttI18nLocale, GanttItemType, GanttViewType, GanttDragEvent, GanttTableDragDroppedEvent } from '@worktile/gantt';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { BaseItem, Group, Task } from './domain/Task';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TaskEditModalComponent } from './task-edit-modal/task-edit-modal.component';
import { GroupEditModalComponent } from './group-edit-modal/group-edit-modal.component';
import { Chart } from './domain/Chart';
import { ChartStorageService } from './chart-storage.service';
import { ConfirmChartDeleteDialogComponent } from './confirm-chart-delete-dialog/confirm-chart-delete-dialog.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  standalone: false
})
export class AppComponent {

onDeleteChart(arg0: Chart) {
  const modalRef = this.modalService.open(ConfirmChartDeleteDialogComponent, { size: 'sm' });
  modalRef.componentInstance.title = 'Chart löschen';
  modalRef.componentInstance.message = `Möchten Sie das Chart "${this.chart.name}" wirklich löschen?`;
  modalRef.componentInstance.btnOkText = 'Löschen';
  modalRef.componentInstance.btnCancelText = 'Abbrechen';

  modalRef.result.then((confirmed) => {
    if (confirmed) {
      this.chartStorage.deleteChart(this.chart);
      this.initWithNewChart();
    }
  }).catch(() => {
    // Dialog wurde geschlossen ohne Bestätigung
  });
}

availableCharts: {
  id: string;
  name: string;
}[] = [];


@ViewChild('nameInput') nameInput!: ElementRef<HTMLInputElement>;

  title = 'Gannticus';

  chart : Chart = new Chart();

  isEditingName = false;

  items: GanttItem[] = [];

  viewTypeOptions = [
    { label: 'Quartal', value: GanttViewType.quarter },
    { label: 'Monat', value: GanttViewType.month },
    { label: 'Woche', value: GanttViewType.week },
    { label: 'Tag', value: GanttViewType.day }
  ];

  viewType : GanttViewType = GanttViewType.day;

  constructor(private modalService: NgbModal, private chartStorage: ChartStorageService) {
    this.initWithNewChart();

    this.availableCharts = this.chartStorage.getChartList();
    let task0 = new Task();
    task0.id = '000000';
    task0.title = 'Task 0';
    task0.start = new Date("2025-05-06");
    task0.end = new Date("2025-05-08");
    this.chart.tasks.push(task0);

    task0.computedStart = task0.start ? task0.start : new Date();
    task0.computedEnd = task0.end ? task0.end : new Date();
    
    let task1 = new Task();
    task1.id = '000001';
    task1.title = 'Task 1';
    task1.start = new Date("2025-05-05");
    task1.end = new Date("2025-05-09");
    this.chart.tasks.push(task1);
    task1.computedStart = task1.start ? task1.start : new Date();
    task1.computedEnd = task1.end ? task1.end : new Date();
    
    let task2 = new Task();
    task2.id = '000002';
    task2.title = 'Task 2';
    task2.start = new Date("2025-05-10");
    task2.end = new Date("2025-05-10");
    this.chart.tasks.push(task2);
    task2.computedStart = task2.start ? task2.start : new Date();
    task2.computedEnd = task2.end ? task2.end : new Date();

    let task3 = new Task();
    task3.id = '000003';
    task3.title = 'Task 3';
    task3.start = new Date("2025-05-10");
    task3.end = new Date("2025-05-10");
    task3.milestone = true;
    this.chart.tasks.push(task3);
    task3.computedStart = task3.start ? task3.start : new Date();
    task3.computedEnd = task3.end ? task3.end : new Date();

    let task4 = new Task();
    task4.id = '000004';
    task4.title = 'Task 4';
    task4.start = new Date("2025-05-25");
    task4.end = new Date("2025-05-25");
    task4.milestone = true;
    this.chart.tasks.push(task4);
    task4.computedStart = task4.start ? task4.start : new Date();
    task4.computedEnd = task4.end ? task4.end : new Date();

    let group0 = new Group();
    group0.id = 'group0';
    group0.title = 'Group 0';
    group0.children.push(task4.toBaseItem());
    this.chart.groups.push(group0);

    task0.dependsOn.push(task1.id);
    task2.dependsOn.push(task1.id);
    task3.dependsOn.push(task1.id);
    task4.dependsOn.push(task1.id);

    this.chart.topLevelItems.push(task0.toBaseItem());
    this.chart.topLevelItems.push(task1.toBaseItem());
    this.chart.topLevelItems.push(task2.toBaseItem());
    this.chart.topLevelItems.push(task3.toBaseItem());
    this.chart.topLevelItems.push(group0.toBaseItem());
    this.updateGanntItems();

  }
  
  private initWithNewChart() {
    this.chart = new Chart();
    this.chart.id = this.createId();
    this.chart.name = 'New Gantt chart';
    this.updateGanntItems();
  }

onIdClick(id: string) {
  console.log("start editing " + id);
  const task = this.getTaskById(id);
  if (task) {
    console.log("edit a task");
    this.startTaskEditDialog(task);
  }
  else if (this.getGroupById(id)) {
    console.log("edit a group");
    this.startGroupEditDialog(this.getGroupById(id)!);
  }
  else {
    console.error("No known element with id " + id + " to edit");
  }
}

  private startTaskEditDialog(taskToEdit: Task) {
    const modalRef = this.modalService.open(TaskEditModalComponent, { centered: true });
    // Kopie übergeben, damit Änderungen erst bei OK übernommen werden
    modalRef.componentInstance.task = { ...taskToEdit };
    modalRef.componentInstance.tasks = this.chart.tasks;

    modalRef.result.then(
      (result) => {
        this.replaceTaskById(result);
        
        this.recomputeTasks(result);
        this.updateGanntItems();
      },
      (reason) => {
      }
    );
  }

  private replaceTaskById(task: Task) {
    const index = this.chart.tasks.findIndex(t => t.id === task.id);
    if (index == -1) {
      console.log("Couldn't find task with id " + task.id);
    }
    else {
      this.chart.tasks.splice(index, 1, task);
    }
  }
  
  private replaceGroupById(group: Group) {
    const index = this.chart.groups.findIndex(g => g.id === group.id);
    if (index == -1) {
      console.log("Couldn't find task with id " + group.id);
    }
    else {
      this.chart.groups.splice(index, 1, group);
    }
  }

  private startGroupEditDialog(toEdit: Group) {
    console.log("start editing a group:");
    console.log(toEdit);
    const modalRef = this.modalService.open(GroupEditModalComponent, { centered: true });
    // Kopie übergeben, damit Änderungen erst bei OK übernommen werden
    modalRef.componentInstance.group = { ...toEdit };


    modalRef.result.then(
      (result) => {
        this.replaceGroupById(result);
        
        this.recomputeTasks(result);
        this.updateGanntItems();
      },
      (reason) => {
      }
    );
  }

  getTaskById(id: string) : Task | undefined{
    return this.chart.tasks.find(t => t.id == id);
  }

  getGroupById(id: string) : Group | undefined{
    return this.chart.groups.find(t => t.id == id);
  }

  recomputeTasks(t: Task) {
    t.computedStart = t.start ? t.start : new Date();;
    t.computedEnd = t.end ? t.end : new Date();
  }
    
    dragEnded($event: GanttDragEvent) {
      console.log("drag ended:");
      console.log($event);
      console.log($event.item.id + "now starts at " + $event.item.start + " and ends at " + $event.item.end);

      const toChange = this.getTaskById($event.item.id);
      
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

        let sourceParent : BaseItem[] = this.chart.topLevelItems; 
        if ($event.sourceParent && this.getGroupById($event.sourceParent.id)) {
          sourceParent = this.getGroupById($event.sourceParent.id)!.children;
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

        let targetParent : BaseItem[] = this.chart.topLevelItems; 
        let targetIndex = 0;

        //inside a group or task
        if ($event.dropPosition == 'inside') {
          let group = this.getGroupById($event.target.id);
          if (group) {
            targetParent = group.children;
          }
        }

        else {
          if ($event.targetParent && this.getGroupById($event.targetParent.id)) {
            targetParent = this.getGroupById($event.targetParent.id)!.children;
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
    let id = this.createId();
    let newTask: Task = new Task();
    newTask.id = id;
    newTask.title = '';
    newTask.start = new Date("2025-05-01");
    newTask.end = new Date("2025-05-15");
    this.chart.tasks.push(newTask);
    this.chart.topLevelItems.push({id : newTask.id, type: 'task'});
    newTask.computedStart = newTask.start ? newTask.start : new Date();
    newTask.computedEnd = newTask.end ? newTask.end : new Date();
    this.updateGanntItems();
    this.startTaskEditDialog(newTask);

  }

  private createId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  onAddGroup() {
    let id = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    let newGroup: Group = new Group();
    newGroup.id = id;
    newGroup.title = '';
    this.chart.groups.push(newGroup);
    this.chart.topLevelItems.push({id : newGroup.id, type: 'group'});
    this.updateGanntItems();
    this.startGroupEditDialog(newGroup);
  }

  updateGanntItems() {
    let tasks : BaseItem[] = this.chart.topLevelItems;
    let items :  GanttItem[] = [];
    let itemMap = new Map<string, GanttItem>();














    const updateGanntItems = (tasks: BaseItem[], items: GanttItem[]) => {
      console.log("task length:" + tasks.length);
      console.log(tasks);

      tasks.forEach(entry => {
        if (entry.type == 'task') {
          let task = this.getTaskById(entry.id);
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
          let group = this.getGroupById(entry.id);
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

    updateGanntItems(tasks, items);
    this.items = items;

    this.chart.tasks.forEach(t => {
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

  onOpenChart(chart: { id: string; name: string; }) {
    const loadedChart = this.chartStorage.getChart(chart.id);
    if (!loadedChart) {
      console.log("Couldn't find a chart with id "+ chart.id);
    }
    else {
      this.chart =  loadedChart;
      this.updateGanntItems();
    }
  }
  onSave() {
    console.log("Start saving");
    this.chartStorage.saveChart(this.chart);
    console.log("Finished saving");
  }
    
  onEditName() {
    this.isEditingName = true;
    setTimeout(() => this.nameInput?.nativeElement.focus(), 0);
  }
  
  onSaveName(newName: string) {
    this.chart.name = newName;
    this.isEditingName = false;
  }
  
  onCancelEdit() {
    this.isEditingName = false;
  }
}