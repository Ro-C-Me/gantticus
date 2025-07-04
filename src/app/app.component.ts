import { Component, ViewChild, ElementRef, OnInit } from '@angular/core';
import { GanttItem, GanttViewType, GanttDragEvent, GanttTableDragDroppedEvent, GanttGroup, GanttToolbarOptions, GanttLinkType, GanttLinkDragEvent, GanttLineClickEvent, GanttSelectedEvent } from '@worktile/gantt';
import { Dependency, DependencyType, Group, Task } from './domain/Task';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TaskEditModalComponent } from './task-edit-modal/task-edit-modal.component';
import { GroupEditModalComponent } from './group-edit-modal/group-edit-modal.component';
import { Chart } from './domain/Chart';
import { ChartStorageService } from './chart-storage.service';
import { ConfirmChartDeleteDialogComponent } from './confirm-chart-delete-dialog/confirm-chart-delete-dialog.component';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  standalone: false
})
export class AppComponent implements OnInit {
onSelect($event: GanttSelectedEvent<unknown>) {
  const item = $event.selectedValue as GanttItem<unknown>;

  if (item.origin instanceof Task) {
    this.startTaskEditDialog(item.origin);
  }
}

lineClick($event: GanttLineClickEvent<unknown>) {
  if ($event.target.origin instanceof Task) {
    $event.target.origin.dependencies = $event.target.origin.dependencies.filter(d => d.taskId != $event.source.id);
    this.updateGanttItems();
  } 
}

onLinkFinished(event: GanttLinkDragEvent<unknown>) {
  if (event.target && event.type) {
    const dependency : Dependency  = new Dependency(); 
    dependency.taskId = event.source.id;
    dependency.type = mapType(event.type);

    const task : Task | undefined = this.chart.tasks.find(t => t.id == event.target!.id);
    if (task) {
      task.dependencies.push(dependency);
      this.updateGanttItems();
    }
  }

  function mapType(type: GanttLinkType): DependencyType {
    switch (type) {
      case GanttLinkType.fs:
        return DependencyType.FS;
      case GanttLinkType.ff:
        return DependencyType.FF;
      case GanttLinkType.ss:
        return DependencyType.SS;
      case GanttLinkType.ss:
        return DependencyType.SF;
      default:
        throw new Error(`Unbekannter DependencyType: ${type}`);
    }
  }
}

  toolbarOptions: GanttToolbarOptions = {
    viewTypes: [
        GanttViewType.day,
        GanttViewType.week,
        GanttViewType.month,
        GanttViewType.quarter,
        GanttViewType.year
    ]
};

onNewChart() {
  this.initWithNewChart();
}

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

  title = 'Gantticus';

  chart : Chart = new Chart();

  isEditingName = false;

  items: GanttItem[] = [];
  groups: GanttGroup[] = [];

  viewType : GanttViewType = GanttViewType.day;

  showDeleteIcon : boolean = false;
  
  constructor(private modalService: NgbModal, private chartStorage: ChartStorageService, private route: ActivatedRoute) {
    this.initWithNewChart();

    this.availableCharts = this.chartStorage.getChartList();
  }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['example'] === 'true') {
        this.initializeExampleTasksAndGroups();
      }
    });
  }
  
  private initializeExampleTasksAndGroups(): void {
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

    let group0 = new Group();
    group0.id = 'group0';
    group0.title = 'Group 0';
    this.chart.groups.push(group0);
    
    let task4 = new Task();
    task4.id = '000004';
    task4.title = 'Task 4';
    task4.start = new Date("2025-05-25");
    task4.end = new Date("2025-05-25");
    task4.milestone = true;
    this.chart.tasks.push(task4);
    task4.computedStart = task4.start ? task4.start : new Date();
    task4.computedEnd = task4.end ? task4.end : new Date();
    task4.group = group0.id;
    task4.scheduleFinalized = true;
    

    const dependency = new Dependency();
    dependency.type = DependencyType.FS;
    dependency.taskId = task1.id;

    task0.dependencies = [dependency];
    task2.dependencies = [dependency];
    task3.dependencies = [dependency];
    task4.dependencies = [dependency];

    this.updateGanttItems();

  }
  
  private initWithNewChart() {
    this.chart = new Chart();
    this.chart.id = this.createId();
    this.chart.name = 'New Gantt chart';
    this.updateGanttItems();
  }

onGroupTitleClick(id: string) {
  if (this.getGroupById(id)) {
    console.log("edit a group");
    this.startGroupEditDialog(this.getGroupById(id)!);
  }
}

  onTaskDelete(id: string) {
    this.deleteTaskById(id);
    this.updateGanttItems();
  }

  private deleteTaskById(id: string) {
    console.log("delete task with id: " + id);
    const task = this.getTaskById(id);
    if (task) {
      this.deleteTask(task);
    }
  }

  private deleteTask(task: Task) {
    console.log("delete a task");
    const idx = this.chart.tasks.indexOf(task);
    this.chart.tasks.splice(idx, 1);

    // delete reference in other tasks (dependsOn)
    this.chart.tasks.forEach(t => {
      t.dependencies = t.dependencies.filter(d => d.taskId !== task.id);
    });
  }

  onGroupDelete(id: string) {
    const group = this.getGroupById(id);
    if (!group) {
      console.log("no group to delete with id " + id);
    }
    else {
      this.deleteGroup(group!);
    }
  }

  private deleteGroup(group: Group) {
    let toDelete = this.chart.tasks.filter(t => t.group == group.id);
    toDelete.forEach(t => {
      this.deleteTask(t);
    });
    this.chart.groups = this.chart.groups.filter(g => g.id != group.id);
    this.updateGanttItems();
  }

  private startTaskEditDialog(taskToEdit: Task) {
    const modalRef = this.modalService.open(TaskEditModalComponent, { centered: true });
    modalRef.componentInstance.task = taskToEdit;
    modalRef.componentInstance.tasks = this.chart.tasks;

    modalRef.result.then(
      (result) => {
        this.replaceTaskById(result);
        
        this.recomputeTasks(result);
        this.updateGanttItems();
      },
      (reason) => {

        if (!taskToEdit.title || taskToEdit.title == '') {
          console.log("will delete created task again because user clicked cancel");
          this.deleteTask(taskToEdit);
        }
        this.updateGanttItems();
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
        this.updateGanttItems();
      },
      (reason) => {

        if (!toEdit.title || toEdit.title == '') {
          console.log("will delete created group again because user clicked cancel");
          this.deleteGroup(toEdit);
        }
        this.updateGanttItems();
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

        const taskToMove = this.getTaskById(id);
      
        if (!taskToMove) {
          console.error("No task to move with id " + id);
          return;
        }
        else {
          
          let targetIndex = this.chart.tasks.findIndex(t => t.id == $event.target.id);
          if (targetIndex == -1) {
            console.error("No task to insert before / after with id " + id);
            return;
          }

          if (!$event.target.origin) {
            console.error("origin not set!");
            return;
          }
          else if (!($event.target.origin instanceof Task)){
            console.error("origin is no Task!");
            return;
          }
          else if (taskToMove.group != $event.target.origin.group) {
            console.log("group changed by drag&drop from " + taskToMove.group + " to " + $event.target.origin.group);
            taskToMove.group = $event.target.origin.group;
          }

          if ($event.dropPosition == "after") {
            targetIndex++;
          }
          this.chart.tasks.splice(this.chart.tasks.indexOf(taskToMove), 1);
          this.chart.tasks.splice(targetIndex, 0, taskToMove);
        }

        this.updateGanttItems();
      }



  onAddTask(group? : string) {
    let id = this.createId();
    let newTask: Task = new Task();
    newTask.group = group;
    newTask.id = id;
    newTask.title = '';
    newTask.start = new Date("2025-05-01");
    newTask.end = new Date("2025-05-01");
    console.log(newTask.start);
    newTask.computedStart = newTask.start ? newTask.start : new Date();
    newTask.computedEnd = newTask.end ? newTask.end : new Date();
    this.chart.tasks.push(newTask);
    this.updateGanttItems();
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
    this.updateGanttItems();
    this.startGroupEditDialog(newGroup);
  }

  updateGanttItems() {
    let itemById = new Map<string, GanttItem>();
    let requiresDefaultGroup = false;

    this.items = [];

    this.chart.tasks.forEach( t => {
      let item : GanttItem = {title : t.title, id : t.id}; 
      item.origin = t;
      item.start = t.computedStart;
      item.end = t.computedEnd;
      if (t.color) {
        item.color = t.color;
      } else if (t.group &&  this.getGroupById(t.group)) {
        item.color = this.getGroupById(t.group)!.color;
      }
      if (t.group) {
        item.group_id = t.group;
      }
      else {
        requiresDefaultGroup = true;
        item.group_id = Group.DEFAULT_GROUP_ID;
      }
      item.draggable = !t.scheduleFinalized;
      this.items.push(item);
      itemById.set(t.id, item);
    });

    this.chart.tasks.forEach(t => {
     t.dependencies.forEach(d => {
        if (!itemById.get(d.taskId)) {
          console.warn(t.id + " seem to depend on unknown task " + d.taskId);
        }
        else {
          if (!itemById.get(d.taskId)!.links) {
            itemById.get(d.taskId)!.links = [];
          }
          itemById.get(d.taskId)!.links?.push(createGanttLink(t.id, d.type));
        }
     }) 
    });
    console.log("this.items: ");
    console.log(this.items);
    
    this.groups = [];
    this.chart.groups.forEach( g => {
      let item : GanttGroup = {title : g.title, id : g.id}; 
      item.origin = g;
      this.groups.push(item);
    });

    if (this.groups.length>0 && this.items.filter(i => i.group_id == Group.DEFAULT_GROUP_ID).length > 0) {
      this.groups.push({id : Group.DEFAULT_GROUP_ID, title: ''});
    }
    
    console.log("this.groups: ");
    console.log(this.groups);

    function createGanttLink(taskId: string, type: DependencyType): import("@worktile/gantt").GanttLink {
      return { link: taskId, type: mapType(type) };

      function mapType(type: DependencyType): GanttLinkType {
        switch (type) {
          case DependencyType.FS:
            return GanttLinkType.fs;
          case DependencyType.FF:
            return GanttLinkType.ff;
          case DependencyType.SS:
            return GanttLinkType.ss;
          case DependencyType.SF:
            return GanttLinkType.sf;
          default:
            throw new Error(`Unbekannter DependencyType: ${type}`);
        }
      }
    }
  }

  onOpenChart(chart: { id: string; name: string; }) {
    const loadedChart = this.chartStorage.getChart(chart.id);
    if (!loadedChart) {
      console.log("Couldn't find a chart with id "+ chart.id);
    }
    else {
      this.chart =  loadedChart;
      this.updateGanttItems();
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