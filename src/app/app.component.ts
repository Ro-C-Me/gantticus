import { Component, ViewChild, ElementRef, OnInit, HostListener } from '@angular/core';
import { GanttItem, GanttViewType, GanttDragEvent, GanttTableDragDroppedEvent, GanttGroup, GanttToolbarOptions, GanttLinkType, GanttLinkDragEvent, GanttLineClickEvent, GanttSelectedEvent, GanttBarClickEvent, GanttItemType, GanttGroupInternal, GanttItemInternal } from '@worktile/gantt';
import { Dependency, DependencyType, Group, Status, Task } from './domain/Task';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TaskEditModalComponent } from './task-edit-modal/task-edit-modal.component';
import { GroupEditModalComponent } from './group-edit-modal/group-edit-modal.component';
import { Chart } from './domain/Chart';
import { ChartStorageService } from './chart-storage.service';
import { UndoRedoService } from './undo-redo.service';
import { ConfirmChartDeleteDialogComponent } from './confirm-chart-delete-dialog/confirm-chart-delete-dialog.component';
import { ActivatedRoute } from '@angular/router';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  standalone: false
})
export class AppComponent implements OnInit {
onExpandChange(event: GanttItemInternal|GanttGroupInternal) {
  console.log("Expand change event:", event);
  
  // Prüfen ob es sich um ein Item oder eine Gruppe handelt
  if ('expanded' in event && event.id) {
    if (event.expanded) {
      // Element wurde ausgeklappt - zur expanded-Liste hinzufügen
      this.chart.expanded.add(event.id);
    } else {
      // Element wurde eingeklappt - aus expanded-Liste entfernen
      this.chart.expanded.delete(event.id);
    }
    console.log("Updated expanded set:", this.chart.expanded);
    
    // Gantt-Items aktualisieren, um aggregierte Dependencies zu refresh'en
    this.updateGanttItems();
  }
}

  // Toast-Benachrichtigungen über Service
  get toasts() {
    return this.toastService.getToasts();
  }

  // Maximale Tiefe der Sub-Task-Hierarchie (konfigurierbar)
  maxHierarchyLevel: number = 5;

  isOverdue(task: Task) : boolean{
    if (!task.end) {
      return false;
    }
    else {
      return task.end <  new Date() && task.status != Status.DONE;
    } 
}
  

  onStatusChange(item: GanttItem): void {
    if (!(item.origin instanceof Task)) {
      console.warn('Item\'s origin is not a Task instance:', item.origin);
      return;
    }
    
    const task = item.origin;
    
    // Status-Änderung ist bereits validiert und erlaubt
    this.saveStateForUndo();
    this.updateGanttItems();
    
    console.log(`Status changed for task ${task.id}: ${task.status}`);
  }

  onValidationError(errorMessage: string): void {
    this.showToast('Status-Änderung nicht möglich', errorMessage, 'error');
  }

  onProgressChange(item: GanttItem): void {
    // Kein explizites saveStateForUndo() hier, da das bereits debounced in der Komponente gemacht wird
    if (item.origin instanceof Task) {
      item.progress = item.origin.progress;
    }
    else {
      console.warn('Item\'s origin is not a Task instance:', item.origin);
    }
    this.updateGanttItems();
  }

barClick($event: GanttBarClickEvent<unknown>) {
  const item = $event.item as GanttItem<unknown>;

  if (item.origin instanceof Task) {
    this.startTaskEditDialog(item.origin);
  }
}
onSelect($event: GanttSelectedEvent<unknown>) {
  const item = $event.selectedValue as GanttItem<unknown>;

  if (item.origin instanceof Task) {
    this.startTaskEditDialog(item.origin);
  }
}

lineClick($event: GanttLineClickEvent<unknown>) {
  if ($event.target.origin instanceof Task) {
    // Erst die Änderung vornehmen
    $event.target.origin.dependencies = $event.target.origin.dependencies.filter(d => d.taskId != $event.source.id);
    // Dann für Undo speichern
    this.saveStateForUndo();
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
      // Erst die Abhängigkeit hinzufügen
      task.dependencies.push(dependency);
      // Dann für Undo speichern
      this.saveStateForUndo();
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

  // Properties für Undo/Redo
  canUndo = false;
  canRedo = false;
  hasUnsavedChanges = false;

  // Filter-Properties sind jetzt in chart.filter enthalten
  
  constructor(
    private modalService: NgbModal, 
    private chartStorage: ChartStorageService, 
    private undoRedoService: UndoRedoService,
    private route: ActivatedRoute,
    private toastService: ToastService
  ) {
    this.initWithNewChart();

    this.availableCharts = this.chartStorage.getChartList();
    
    // Status der Undo/Redo-Buttons abonnieren
    this.undoRedoService.canUndo$.subscribe(can => this.canUndo = can);
    this.undoRedoService.canRedo$.subscribe(can => this.canRedo = can);
    this.undoRedoService.hasUnsavedChanges$.subscribe(has => this.hasUnsavedChanges = has);
  }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['example'] === 'true') {
        this.initializeExampleTasksAndGroups();
      }
    });
  }

  // Tastaturkürzel für Undo (Strg+Z) und Redo (Strg+Y)
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    // Prüfen ob ein modales Fenster geöffnet ist (NgbModal fügt eine .modal.show Klasse hinzu)
    if (document.querySelector('.modal.show')) {
      return; // Modales Fenster aktiv, keine Tastaturkürzel verwenden
    }
    
    // Wenn in einem Eingabefeld, nicht abfangen
    if (document.activeElement instanceof HTMLInputElement || 
        document.activeElement instanceof HTMLTextAreaElement) {
      return;
    }
    
    if (event.ctrlKey && event.key === 'z') {
      event.preventDefault();
      this.onUndo();
    } else if (event.ctrlKey && event.key === 'y') {
      event.preventDefault();
      this.onRedo();
    }
  }
  
  private initializeExampleTasksAndGroups(): void {
    let dependencies: Dependency[] = [];

    let task0 = new Task();
    task0.id = '000000';
    task0.title = 'Task 0';
    task0.start = new Date("2025-05-06");
    task0.end = new Date("2025-05-08");
    this.chart.tasks.push(task0);
    task0.computedStart = task0.start ? task0.start : new Date();
    task0.computedEnd = task0.end ? task0.end : new Date();
    let dependency0 = new Dependency();
    dependency0.taskId = task0.id;
    dependencies.push(dependency0);
    
    let task1 = new Task();
    task1.id = '000001';
    task1.title = 'Task 1';
    task1.computeFromChildren = true;
    task1.computedStart = task1.start ? task1.start : new Date();
    task1.computedEnd = task1.end ? task1.end : new Date();
    this.chart.tasks.push(task1);

    let task1_1 = new Task();
    task1_1.id = '000001_1';
    task1_1.title = 'Task 1.1';
    task1_1.start = new Date("2025-05-05");
    task1_1.end = new Date("2025-05-09");
    this.chart.tasks.push(task1_1);
    task1_1.computedStart = task1_1.start;
    task1_1.computedEnd = task1_1.end;
    let dependency1 = new Dependency();
    dependency1.taskId = task1_1.id;
    dependencies.push(dependency1);
    task1.children.push(task1_1.id);

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
    task3.dependencies = dependencies;
    console.log("DEPENDENCIES", task3.dependencies);
    let group0 = new Group();
    group0.id = 'group0';
    group0.title = 'Group 0';
    this.chart.groups.push(group0);
    
    let dependency1_1_from_2 = new Dependency();
    dependency1_1_from_2.taskId = task2.id;
    task1_1.dependencies.push(dependency1_1_from_2);
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

    this.updateGanttItems();

  }
  
  private initWithNewChart() {
    this.chart = new Chart();
    this.chart.id = this.createId();
    this.chart.name = 'New Gantt chart';
    this.updateGanttItems();
    this.undoRedoService.initStateForChart(this.chart);
  }

onGroupTitleClick(id: string) {
  if (this.getGroupById(id)) {
    console.log("edit a group");
    this.startGroupEditDialog(this.getGroupById(id)!);
  }
}

  onTaskDelete(id: string) {
    // Erst den Task löschen
    this.deleteTaskById(id);
    // Dann für Undo speichern
    this.saveStateForUndo();
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
      // Erst die Gruppe löschen
      this.deleteGroup(group!);
      // Dann für Undo speichern (wird in deleteGroup bereits gemacht)
    }
  }

  private deleteGroup(group: Group) {
    let toDelete = this.chart.tasks.filter(t => t.group == group.id);
    toDelete.forEach(t => {
      this.deleteTask(t);
    });
    this.chart.groups = this.chart.groups.filter(g => g.id != group.id);
    
    // Zustand für Undo speichern
    this.saveStateForUndo();
    this.updateGanttItems();
  }

  private startTaskEditDialog(taskToEdit: Task) {
    const modalRef = this.modalService.open(TaskEditModalComponent, { centered: true });
    modalRef.componentInstance.task = taskToEdit;
    modalRef.componentInstance.tasks = this.chart.tasks;

    modalRef.result.then(
      (result) => {
        // Erst den Task ersetzen
        this.replaceTaskById(result);
        this.recomputeTasks(result);
        
        // Dann für Undo speichern
        this.saveStateForUndo();
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
    const groupCopy = new Group();
    Object.assign(groupCopy, toEdit);
    modalRef.componentInstance.group = groupCopy;


    modalRef.result.then(
      (result) => {
        // Erst die Gruppe ersetzen
        this.replaceGroupById(result);
        this.recomputeTasks(result);
        
        // Dann für Undo speichern
        this.saveStateForUndo();
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
    t.computedStart = t.start;
    t.computedEnd = t.end;
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
        // Erst die Änderungen am Task vornehmen
        toChange.start = this.toDate($event.item.start);
        toChange.end = this.toDate($event.item.end);
        this.recomputeTasks(toChange);
        
        // Danach den Zustand speichern und die Benutzeroberfläche aktualisieren
        this.saveStateForUndo();
        this.updateGanttItems();
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

        // Sub-Task-Logik: Prüfen ob der Task in einen anderen Task (Parent) gedroppt wird
        if ($event.dropPosition === 'inside') {
          this.handleSubTaskCreation(taskToMove, $event.target.id, $event.target.id, "after");
        } else if ($event.targetParent && $event.targetParent.id) {
          this.handleSubTaskCreation(taskToMove, $event.targetParent.id, $event.target.id, $event.dropPosition);
        } else {
          // Normales Drag & Drop ohne Sub-Task-Erstellung
          this.handleNormalDragDrop(taskToMove, $event);
        }

        // Zustand für Undo speichern und UI aktualisieren
        this.saveStateForUndo();
        this.updateGanttItems();
      }

    private handleSubTaskCreation(taskToMove: Task, parentId: string, targetId: string, dropPosition: string) {
      const parentTask = this.getTaskById(parentId);
      if (!parentTask) {
        console.error("Parent task not found: " + parentId);
        return;
      }

      // Task aus bestehender Parent-Beziehung entfernen
      this.removeTaskFromParent(taskToMove.id);

      // Task zum neuen Parent hinzufügen
      if (!parentTask.children) {
        parentTask.children = [];
      }

      // Position innerhalb der Children bestimmen
      const targetIndex = parentTask.children.findIndex(childId => childId === targetId);
      if (targetIndex === -1) {
        // Ziel-Task ist nicht in den Children, einfach anhängen
        parentTask.children.push(taskToMove.id);
      } else {
        // Ziel-Task gefunden, an der richtigen Position einfügen
        const insertIndex = dropPosition === "after" ? targetIndex + 1 : targetIndex;
        parentTask.children.splice(insertIndex, 0, taskToMove.id);
      }

      // Gruppe des Sub-Tasks entfernen, da Sub-Tasks keine eigene Gruppe haben
      // Die Gruppenzugehörigkeit wird durch den Parent-Task bestimmt
      taskToMove.group = undefined;

      console.log("Sub-Task erstellt:", taskToMove.id, "→", parentId, "(Gruppe entfernt)");
    }

    private handleNormalDragDrop(taskToMove: Task, $event: GanttTableDragDroppedEvent<unknown>) {
      // Task wurde aus Parent herausgezogen - zu Top-Level machen
      this.removeTaskFromParent(taskToMove.id);

      let targetIndex = this.chart.tasks.findIndex(t => t.id == $event.target.id);
      if (targetIndex == -1) {
        console.error("No task to insert before / after with id " + $event.target.id);
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

      // Reihenfolge in der Task-Liste anpassen
      if ($event.dropPosition == "after") {
        targetIndex++;
      }
      this.chart.tasks.splice(this.chart.tasks.indexOf(taskToMove), 1);
      this.chart.tasks.splice(targetIndex, 0, taskToMove);

      console.log("Task zu Top-Level gemacht:", taskToMove.id);
    }

    private removeTaskFromParent(taskId: string) {
      // Task aus dem Parent-Children-Array entfernen
      // Normalerweise gibt es nur einen Parent, aber wir prüfen alle für Robustheit
      this.chart.tasks.forEach(task => {
        if (task.children && task.children.includes(taskId)) {
          task.children = task.children.filter(childId => childId !== taskId);
        }
      });
    }

  onAddTask(group? : string) {
    let id = this.createId();
    let newTask: Task = new Task();
    newTask.group = group;
    newTask.id = id;
    newTask.title = '';
    newTask.start = new Date();
    newTask.end = new Date();
    console.log(newTask.start);
    newTask.computedStart = newTask.start ? newTask.start : new Date();
    newTask.computedEnd = newTask.end ? newTask.end : new Date();
    this.chart.tasks.push(newTask);
    
    // Erst den Task erstellen, dann für Undo speichern
    this.saveStateForUndo();
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
    
    // Erst die Gruppe erstellen, dann für Undo speichern
    this.saveStateForUndo();
    this.updateGanttItems();
    this.startGroupEditDialog(newGroup);
  }

  updateGanttItems() {
    let itemById = new Map<string, GanttItem>();
    let childTaskIds = new Set<string>();
    let requiresDefaultGroup = false;
    
    // Lokaler Cache nur für diese Berechnung
    const computedPropertiesCache = new Map<string, boolean>();
    
    // Gefilterte Tasks verwenden statt this.chart.tasks
    const filteredTasks = this.getFilteredTasks();
    
    // Erst alle Child-Task-IDs sammeln (nur von gefilterten Tasks)
    filteredTasks.forEach(t => {
      if (t.children && t.children.length > 0) {
        t.children.forEach(childId => {
          // Nur Children hinzufügen, die auch in der gefilterten Liste sind
          if (filteredTasks.some(ft => ft.id === childId)) {
            childTaskIds.add(childId);
          }
        });
      }
    });

    this.items = [];

    filteredTasks.forEach( t => {
      let item : GanttItem = {title : t.title, id : t.id}; 
      item.progress = t.progress;
      item.origin = t;
      
      // Expanded-Zustand aus dem Chart wiederherstellen
      // Standardmäßig sind alle Tasks geschlossen, außer sie stehen in der expanded-Liste
      item.expanded = this.chart.expanded.has(t.id);
      
      // Start und End berechnen basierend auf computeFromChildren (jetzt rekursiv)
      if (t.computeFromChildren && t.children && t.children.length > 0) {
        const computedDates = this.computePropertiesFromChildren(t, computedPropertiesCache);
        item.start = computedDates.start;
        item.end = computedDates.end;
      } else {
        item.start = t.computedStart;
        item.end = t.computedEnd;
      }
      
      if (t.color) {
        item.color = t.color;
      } else if (t.group &&  this.getGroupById(t.group)) {
        item.color = this.getGroupById(t.group)!.color;
      } else {
        // Für Sub-Tasks: Farbe des Parent-Tasks (bzw. seiner Gruppe) verwenden
        const parentGroup = this.getParentGroupForTask(t.id);
        if (parentGroup) {
          item.color = parentGroup.color;
        }
      }
      if (t.group) {
        item.group_id = t.group;
      }
      else {
        requiresDefaultGroup = true;
        item.group_id = Group.DEFAULT_GROUP_ID;
      }
      item.draggable = !t.scheduleFinalized && !t.computeFromChildren;

      if (t.milestone) {
        item.type = GanttItemType.milestone;
      }
      
      if (!childTaskIds.has(t.id)) {
        this.items.push(item);
      }
      itemById.set(t.id, item);
    });

    // Sub-Tasks (children) zuweisen - nach dem alle Items erstellt sind
    filteredTasks.forEach(t => {
      if (t.children && t.children.length > 0) {
        const parentItem = itemById.get(t.id);
        if (parentItem) {
          parentItem.children = t.children
            .map(childId => itemById.get(childId))
            .filter(child => child !== undefined) as GanttItem[];
        }
      }
    });

    filteredTasks.forEach(t => {
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

    // Aggregierte Dependencies für eingeklappte Parent-Tasks hinzufügen
    this.addAggregatedDependencies(itemById, filteredTasks);
    
    // Gruppen filtern - unterscheide zwischen "wirklich leer" und "leer gefiltert"
    this.groups = [];
    const usedGroupIds = new Set(this.items.map(item => item.group_id));
    
    this.chart.groups.forEach( g => {
      // Prüfe ob Gruppe überhaupt Tasks zugeordnet hat (in allen Tasks, nicht nur gefilterten)
      const allTasksInGroup = this.chart.tasks.filter(task => task.group === g.id);
      const isReallyEmpty = allTasksInGroup.length === 0;
      
      // Wirklich leere Gruppen immer anzeigen
      if (isReallyEmpty) {
        let item : GanttGroup = {title : g.title, id : g.id}; 
        item.origin = g;
        console.log("Group " + g.id + " expanded?" + this.chart.expanded.has(g.id));
        item.expanded = this.chart.expanded.has(g.id);
        this.groups.push(item);
      }
      // Gruppen mit Tasks nur anzeigen wenn sie auch gefilterte Tasks enthalten
      else if (usedGroupIds.has(g.id)) {
        const groupTasks = this.items.filter(item => item.group_id === g.id);
        const hasNonArchivedTasks = groupTasks.some(item => 
          item.origin instanceof Task && item.origin.status !== Status.ARCHIVED
        );
        
        // Zeige Gruppe wenn: hat nicht-archivierte Tasks ODER archivierte Tasks werden angezeigt
        if (hasNonArchivedTasks || this.chart.filter.showArchivedTasks) {
          let item : GanttGroup = {title : g.title, id : g.id}; 
          item.origin = g;
          console.log("Group " + g.id + " expanded?" + this.chart.expanded.has(g.id));
          item.expanded = this.chart.expanded.has(g.id);
          this.groups.push(item);
        }
      }
    });

    // Default-Gruppe nur hinzufügen, wenn sie Tasks enthält
    const defaultGroupTasks = this.items.filter(i => i.group_id == Group.DEFAULT_GROUP_ID);
    if (this.groups.length > 0 && defaultGroupTasks.length > 0) {
      const hasNonArchivedDefaultTasks = defaultGroupTasks.some(item => 
        item.origin instanceof Task && item.origin.status !== Status.ARCHIVED
      );
      
      // Zeige Default-Gruppe wenn: hat nicht-archivierte Tasks ODER archivierte Tasks werden angezeigt
      if (hasNonArchivedDefaultTasks || this.chart.filter.showArchivedTasks) {
        // Default-Gruppe hat auch einen expanded-Zustand
        // Standardmäßig geschlossen, außer explizit in expanded-Liste
        const defaultGroup: GanttGroup = {
          id: Group.DEFAULT_GROUP_ID, 
          title: '',
          expanded: this.chart.expanded.has(Group.DEFAULT_GROUP_ID)
        };
        this.groups.push(defaultGroup);
      }
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

    // Dependency-Aggregation: Sammelt alle Dependencies der Sub-Tasks und fügt sie dem Parent hinzu
    // Wird nur aufgerufen, wenn der Parent eingeklappt ist (!item.expanded)
    this.addAggregatedDependencies(itemById, filteredTasks);
  }

  onOpenChart(chart: { id: string; name: string; }) {
    const loadedChart = this.chartStorage.getChart(chart.id);
    if (!loadedChart) {
      console.log("Couldn't find a chart with id "+ chart.id);
    }
    else {
      this.chart =  loadedChart;
      this.updateGanttItems();
      this.undoRedoService.initStateForChart(this.chart);
    }
  }
  onSave() {
    console.log("Start saving");
    this.chartStorage.saveChart(this.chart);
    this.undoRedoService.markAsSaved(); // Markiere als gespeichert
    console.log("Finished saving");
  }
    
  onEditName() {
    this.isEditingName = true;
    setTimeout(() => this.nameInput?.nativeElement.focus(), 0);
  }
  
  onSaveName(newName: string) {
    if (this.chart.name !== newName) {
      // Erst den Namen ändern
      this.chart.name = newName;
      // Dann für Undo speichern
      this.saveStateForUndo();
    }
    this.isEditingName = false;
  }
  
  onCancelEdit() {
    this.isEditingName = false;
  }

  // Filter-Methoden
  onFilterChange() {
    this.updateGanttItems();
  }

  clearFilter() {
    this.chart.filter.taskFilter = '';
    this.chart.filter.showDownstreamDeps = false;
    this.chart.filter.showUpstreamDeps = false;
    // Status-Filter auf alle anzeigen zurücksetzen
    this.chart.filter.showOpenTasks = true;
    this.chart.filter.showInProgressTasks = true;
    this.chart.filter.showDoneTasks = true;
    this.chart.filter.showArchivedTasks = false;
    this.updateGanttItems();
  }

  private getFilteredTasks(): Task[] {
    // Basis-Tasks durch Textfilter ermitteln
    let filteredTaskIds = new Set<string>();
    const parentTaskIds = new Set<string>();

    if (!this.chart.filter.taskFilter || this.chart.filter.taskFilter.trim() === '') {
      // Wenn kein Textfilter, aber Dependencies aktiviert, alle Tasks als Basis nehmen
      if (this.chart.filter.showDownstreamDeps || this.chart.filter.showUpstreamDeps) {
        this.chart.tasks.forEach(task => filteredTaskIds.add(task.id));
      } else {
        // Status-Filter anwenden
        return this.chart.tasks.filter(task => this.isTaskStatusVisible(task));
      }
    } else {
      const filterText = this.chart.filter.taskFilter.toLowerCase().trim();

      // Ersten Durchgang: Direkte Treffer finden
      this.chart.tasks.forEach(task => {
        if (task.title.toLowerCase().includes(filterText)) {
          filteredTaskIds.add(task.id);
        }
      });

      // Zweiten Durchgang: Parent-Tasks von gefilterten Child-Tasks finden
      this.chart.tasks.forEach(task => {
        if (task.children && task.children.length > 0) {
          const hasMatchingChild = task.children.some(childId => {
            const childTask = this.chart.tasks.find(t => t.id === childId);
            return childTask && childTask.title.toLowerCase().includes(filterText);
          });
          if (hasMatchingChild) {
            parentTaskIds.add(task.id);
            // Child-Tasks hinzufügen, die den Filter erfüllen
            task.children.forEach(childId => {
              const childTask = this.chart.tasks.find(t => t.id === childId);
              if (childTask && childTask.title.toLowerCase().includes(filterText)) {
                filteredTaskIds.add(childId);
              }
            });
          }
        }
      });
    // Alle gefilterten Task-IDs kombinieren
    filteredTaskIds = new Set([...filteredTaskIds, ...parentTaskIds]);
  }

  // Erweiterung NUR in der jeweiligen Richtung, ausgehend von der Textsuche
  let resultIds = new Set(filteredTaskIds);
  if (this.chart.filter.showDownstreamDeps) {
    const downstreamIds = this.getDownstreamDependencies(filteredTaskIds);
    downstreamIds.forEach(id => resultIds.add(id));
  }
  if (this.chart.filter.showUpstreamDeps) {
    const upstreamIds = this.getUpstreamDependencies(filteredTaskIds);
    upstreamIds.forEach(id => resultIds.add(id));
  }    let filtered = this.chart.tasks.filter(task => resultIds.has(task.id));
    // Status-Filter anwenden
    filtered = filtered.filter(task => this.isTaskStatusVisible(task));
    return filtered;
  }

  private getDownstreamDependencies(taskIds: Set<string>): Set<string> {
    const downstreamIds = new Set<string>();
    const visited = new Set<string>();

    // Downstream: Finde alle Tasks, die von den gefilterten Tasks direkt oder indirekt abhängen
    const findDependents = (sourceTaskId: string) => {
      if (visited.has(sourceTaskId)) return;
      visited.add(sourceTaskId);

      // Alle Tasks durchsuchen, die eine Dependency auf sourceTaskId haben
      this.chart.tasks.forEach(task => {
        if (task.dependencies && task.dependencies.some(dep => dep.taskId === sourceTaskId)) {
          if (!downstreamIds.has(task.id)) {
            downstreamIds.add(task.id);
            findDependents(task.id); // Rekursiv weiter suchen
          }
        }
      });
    };

    taskIds.forEach(taskId => findDependents(taskId));
    return downstreamIds;
  }

  private getUpstreamDependencies(taskIds: Set<string>): Set<string> {
    const upstreamIds = new Set<string>();
    const visited = new Set<string>();

    // Upstream: Finde alle Tasks, von denen die gefilterten Tasks direkt oder indirekt abhängen
    const findBlockers = (taskId: string) => {
      if (visited.has(taskId)) return;
      visited.add(taskId);

      const task = this.chart.tasks.find(t => t.id === taskId);
      if (task && task.dependencies) {
        task.dependencies.forEach(dep => {
          if (!upstreamIds.has(dep.taskId)) {
            upstreamIds.add(dep.taskId);
            findBlockers(dep.taskId); // Rekursiv weiter suchen
          }
        });
      }
    };

    taskIds.forEach(taskId => findBlockers(taskId));
    return upstreamIds;
  }

  // Speichert den aktuellen Zustand für Undo
  saveStateForUndo() {
    this.undoRedoService.saveState(this.chart);
  }

  // Undo-Operation ausführen
  onUndo() {
    if (!this.canUndo) return;
    
    const previousChart = this.undoRedoService.undo(this.chart);
    if (previousChart) {
      this.chart = previousChart;
      this.updateGanttItems();
    }
  }

  // Redo-Operation ausführen
  onRedo() {
    if (!this.canRedo) return;

    const nextChart = this.undoRedoService.redo(this.chart);
    if (nextChart) {
      this.chart = nextChart;
      this.updateGanttItems();
    }
  }

  // CSV-Export in die Zwischenablage
  async onCsvExport() {
    try {
      const csvContent = this.generateCsvContent();
      await navigator.clipboard.writeText(csvContent);
      
      // Toast-Benachrichtigung statt Alert
      this.showToast('CSV Export erfolgreich', 'Die Daten wurden in die Zwischenablage kopiert.', 'success');
    } catch (error) {
      console.error('Fehler beim Kopieren in die Zwischenablage:', error);
      this.showToast('Fehler beim Export', 'Die Daten konnten nicht in die Zwischenablage kopiert werden.', 'error');
    }
  }

  // HTML-Export in die Zwischenablage
  async onHtmlExport() {
    try {
      const htmlContent = this.generateHtmlTable();
      
      // HTML sowohl als text/html als auch als text/plain in die Zwischenablage
      const clipboardItem = new ClipboardItem({
        'text/html': new Blob([htmlContent], { type: 'text/html' }),
        'text/plain': new Blob([this.stripHtmlTags(htmlContent)], { type: 'text/plain' })
      });
      
      await navigator.clipboard.write([clipboardItem]);
      
      this.showToast('HTML Export erfolgreich', 'Die formatierte Tabelle wurde in die Zwischenablage kopiert.', 'success');
    } catch (error) {
      console.error('Fehler beim HTML-Export:', error);
      // Fallback: Als reiner Text
      try {
        const htmlContent = this.generateHtmlTable();
        await navigator.clipboard.writeText(htmlContent);
        this.showToast('HTML Export (Fallback)', 'HTML-Code wurde als Text in die Zwischenablage kopiert.', 'info');
      } catch (fallbackError) {
        this.showToast('Fehler beim Export', 'Die Daten konnten nicht in die Zwischenablage kopiert werden.', 'error');
      }
    }
  }

  private generateCsvContent(): string {
    const lines: string[] = [];
    const processedTasks = new Set<string>();
    
    // Header
    lines.push('Name,Status,Start,Ende,URL');
    
    // Gruppierte Tasks
    if (this.chart.groups && this.chart.groups.length > 0) {
      for (const group of this.chart.groups) {
        // Gruppe als eigene Zeile
        lines.push(`"${group.title}","","","",""`);
        
        // Top-Level Tasks der Gruppe (ohne Parent)
        const groupTasks = this.chart.tasks.filter(task => 
          task.group === group.id && !this.isSubTask(task.id)
        );
        
        for (const task of groupTasks) {
          this.addTaskToCsv(task, lines, processedTasks, '');
        }
      }
    }
    
    // Tasks ohne Gruppe (Top-Level)
    const ungroupedTasks = this.chart.tasks.filter(task => 
      (!task.group || task.group === '') && !this.isSubTask(task.id)
    );
    
    if (ungroupedTasks.length > 0) {
      // Leerzeile vor ungroupierten Tasks (falls es Gruppen gibt)
      if (this.chart.groups && this.chart.groups.length > 0) {
        lines.push('');
      }
      
      for (const task of ungroupedTasks) {
        this.addTaskToCsv(task, lines, processedTasks, '');
      }
    }
    
    return lines.join('\n');
  }

  private addTaskToCsv(task: Task, lines: string[], processedTasks: Set<string>, indent: string): void {
    if (processedTasks.has(task.id)) return;
    processedTasks.add(task.id);
    
    const startDate = task.start ? this.formatDateForCsv(task.start) : '';
    const endDate = task.end ? this.formatDateForCsv(task.end) : '';
    const url = task.ticketUrl || '';
    const statusLabel = this.getStatusLabel(task.status);
    const taskTitle = indent + task.title;
    
    lines.push(`"${taskTitle}","${statusLabel}","${startDate}","${endDate}","${url}"`);
    
    // Sub-Tasks hinzufügen
    if (task.children && task.children.length > 0) {
      const childIndent = indent + '  └─ ';
      for (const childId of task.children) {
        const childTask = this.getTaskById(childId);
        if (childTask) {
          this.addTaskToCsv(childTask, lines, processedTasks, childIndent);
        }
      }
    }
  }

  private isSubTask(taskId: string): boolean {
    return this.chart.tasks.some(task => 
      task.children && task.children.includes(taskId)
    );
  }

  private formatDateForCsv(date: Date): string {
    // Deutsches Format (DD.MM.YYYY)
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  }

  private getStatusLabel(status: Status): string {
    switch (status) {
      case Status.OPEN:
        return 'Open';
      case Status.IN_PROGRESS:
        return 'in progress';
      case Status.DONE:
        return 'Done';
      case Status.ARCHIVED:
        return 'Archived';
      default:
        return 'Open';
    }
  }

  private generateHtmlTable(): string {
    let html = `
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; font-family: Arial, sans-serif;">
  <thead>
    <tr style="background-color: #f8f9fa; font-weight: bold;">
      <th style="border: 1px solid #dee2e6; padding: 8px;">Name</th>
      <th style="border: 1px solid #dee2e6; padding: 8px;">Status</th>
      <th style="border: 1px solid #dee2e6; padding: 8px;">Start</th>
      <th style="border: 1px solid #dee2e6; padding: 8px;">Ende</th>
      <th style="border: 1px solid #dee2e6; padding: 8px;">URL</th>
    </tr>
  </thead>
  <tbody>`;

    const processedTasks = new Set<string>();

    // Gruppierte Tasks
    if (this.chart.groups && this.chart.groups.length > 0) {
      for (const group of this.chart.groups) {
        const groupColor = group.color || '#e9ecef';
        
        // Gruppe als verbundene Zeile
        html += `
    <tr style="background-color: ${groupColor}; font-weight: bold;">
      <td colspan="5" style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">
        ${this.escapeHtml(group.title)}
      </td>
    </tr>`;
        
        // Top-Level Tasks der Gruppe (ohne Parent)
        const groupTasks = this.chart.tasks.filter(task => 
          task.group === group.id && !this.isSubTask(task.id)
        );
        
        for (const task of groupTasks) {
          html += this.addTaskToHtml(task, processedTasks, '');
        }
      }
    }
    
    // Tasks ohne Gruppe (Top-Level)
    const ungroupedTasks = this.chart.tasks.filter(task => 
      (!task.group || task.group === '') && !this.isSubTask(task.id)
    );
    
    if (ungroupedTasks.length > 0) {
      // Trennzeile falls es Gruppen gibt
      if (this.chart.groups && this.chart.groups.length > 0) {
        html += `
    <tr>
      <td colspan="5" style="border: 1px solid #dee2e6; padding: 4px; background-color: #f8f9fa;">&nbsp;</td>
    </tr>`;
      }
      
      for (const task of ungroupedTasks) {
        html += this.addTaskToHtml(task, processedTasks, '');
      }
    }
    
    html += `
  </tbody>
</table>`;
    
    return html;
  }

  private addTaskToHtml(task: Task, processedTasks: Set<string>, indent: string): string {
    if (processedTasks.has(task.id)) return '';
    processedTasks.add(task.id);
    
    const startDate = task.start ? this.formatDateForCsv(task.start) : '';
    const endDate = task.end ? this.formatDateForCsv(task.end) : '';
    const url = task.ticketUrl || '';
    const taskColor = task.color || '#ffffff';
    const statusLabel = this.getStatusLabel(task.status);
    const taskTitle = indent + task.title;
    
    // Styling für abgeschlossene Tasks oder überfällige Tasks
    const isCompleted = task.status === Status.DONE;
    const isOverdue = this.isOverdue(task);
    const taskTextColor = isCompleted ? '#6c757d' : '#000000';
    const endDateColor = isOverdue ? '#dc3545' : (isCompleted ? '#6c757d' : '#000000');
    
    let html = `
    <tr style="background-color: ${taskColor}; color: ${taskTextColor};">
      <td style="border: 1px solid #dee2e6; padding: 8px;">${this.escapeHtml(taskTitle)}</td>
      <td style="border: 1px solid #dee2e6; padding: 8px;">${statusLabel}</td>
      <td style="border: 1px solid #dee2e6; padding: 8px;">${startDate}</td>
      <td style="border: 1px solid #dee2e6; padding: 8px; color: ${endDateColor};">${endDate}</td>
      <td style="border: 1px solid #dee2e6; padding: 8px;">${url ? `<a href="${this.escapeHtml(url)}" target="_blank" style="color: ${taskTextColor};">${this.escapeHtml(url)}</a>` : ''}</td>
    </tr>`;
    
    // Sub-Tasks hinzufügen
    if (task.children && task.children.length > 0) {
      const childIndent = indent + '&nbsp;&nbsp;└─&nbsp;';
      for (const childId of task.children) {
        const childTask = this.getTaskById(childId);
        if (childTask) {
          html += this.addTaskToHtml(childTask, processedTasks, childIndent);
        }
      }
    }
    
    return html;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private stripHtmlTags(html: string): string {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }



  // Hilfsmethode: Berechnet Properties aus Sub-Tasks (mit rekursiver Unterstützung)
  private computePropertiesFromChildren(task: Task, cache: Map<string, boolean>): { start?: Date, end?: Date, status?: Status, progress?: number } {
    // Cache prüfen - wenn bereits berechnet, direkt zurückgeben
    if (cache.has(task.id)) {
      return {
        start: task.computedStart,
        end: task.computedEnd,
        status: task.status,
        progress: task.progress
      };
    }

    // Wenn der Task keine Kinder hat oder nicht aus Kindern berechnet werden soll
    if (!task.computeFromChildren || !task.children || task.children.length === 0) {
      // Als berechnet markieren (auch wenn keine Berechnung nötig war)
      cache.set(task.id, true);
      return {
        start: task.start,
        end: task.end,
        status: task.status,
        progress: task.progress
      };
    }

    // Child-Tasks holen
    const childTasks = task.children
      .map(childId => this.getTaskById(childId))
      .filter(child => child !== undefined) as Task[];

    // Rekursiv alle Child-Tasks zuerst berechnen
    for (const childTask of childTasks) {
      if (childTask.computeFromChildren && !cache.has(childTask.id)) {
        const childResult = this.computePropertiesFromChildren(childTask, cache);
        // Berechnete Werte im Child-Task speichern
        childTask.computedStart = childResult.start;
        childTask.computedEnd = childResult.end;
        // Status wird direkt im Task gespeichert, da er berechnet wurde
        if (childResult.status !== undefined) {
          childTask.status = childResult.status;
        }
        // Progress wird direkt im Task gespeichert, da er berechnet wurde
        if (childResult.progress !== undefined) {
          childTask.progress = childResult.progress;
        }
      }
    }

    // Jetzt die finalen Zeiten der Kinder sammeln
    const validStarts = childTasks
      .map(child => child.start || child.computedStart)
      .filter(date => date !== undefined && date !== null) as Date[];
    
    const validEnds = childTasks
      .map(child => child.end || child.computedEnd)
      .filter(date => date !== undefined && date !== null) as Date[];
    
    const earliestStart = validStarts.length > 0 ? new Date(Math.min(...validStarts.map(d => d.getTime()))) : undefined;
    const latestEnd = validEnds.length > 0 ? new Date(Math.max(...validEnds.map(d => d.getTime()))) : undefined;

    // Status aus Kindern berechnen
    const computedStatus = this.computeStatusFromChildren(childTasks);

    // Progress aus Kindern berechnen (gewichtet nach Dauer)
    const computedProgress = this.computeProgressFromChildren(childTasks);

    // Als berechnet markieren
    cache.set(task.id, true);
    
    // Berechnete Werte im Task speichern
    task.computedStart = earliestStart;
    task.computedEnd = latestEnd;
    task.status = computedStatus;
    task.progress = computedProgress;
    
    return {
      start: earliestStart,
      end: latestEnd,
      status: computedStatus,
      progress: computedProgress
    };
  }

  // Berechnet den Status eines Parent-Tasks basierend auf seinen Kind-Tasks
  private computeStatusFromChildren(childTasks: Task[]): Status {
    if (!childTasks || childTasks.length === 0) {
      return Status.OPEN; // Default-Status wenn keine Kinder vorhanden
    }

    // Status-Logik implementieren:
    // 1. Alle Kinder OPEN → Parent OPEN
    // 2. Mindestens ein Kind IN_PROGRESS → Parent IN_PROGRESS
    // 3. Mindestens ein Kind DONE oder ARCHIVED (aber nicht alle) → Parent IN_PROGRESS
    // 4. Alle Kinder DONE oder ARCHIVED (und mindestens ein DONE) → Parent DONE
    // 5. Alle Kinder ARCHIVED → Parent ARCHIVED

    const statusCounts = {
      [Status.OPEN]: 0,
      [Status.IN_PROGRESS]: 0,
      [Status.DONE]: 0,
      [Status.ARCHIVED]: 0
    };

    // Status der Kinder zählen
    for (const child of childTasks) {
      statusCounts[child.status]++;
    }

    const totalChildren = childTasks.length;

    // Regel 5: Alle Kinder ARCHIVED → Parent ARCHIVED
    if (statusCounts[Status.ARCHIVED] === totalChildren) {
      return Status.ARCHIVED;
    }

    // Regel 2: Mindestens ein Kind IN_PROGRESS → Parent IN_PROGRESS
    if (statusCounts[Status.IN_PROGRESS] > 0) {
      return Status.IN_PROGRESS;
    }

    // Regel 4: Alle Kinder DONE oder ARCHIVED (und mindestens ein DONE) → Parent DONE
    const doneOrArchivedCount = statusCounts[Status.DONE] + statusCounts[Status.ARCHIVED];
    if (doneOrArchivedCount === totalChildren && statusCounts[Status.DONE] > 0) {
      return Status.DONE;
    }

    // Regel 3: Mindestens ein Kind DONE oder ARCHIVED (aber nicht alle) → Parent IN_PROGRESS
    // Das bedeutet: Sobald irgendein Kind fertig ist, ist der Parent in Bearbeitung
    if (statusCounts[Status.DONE] > 0 || statusCounts[Status.ARCHIVED] > 0) {
      return Status.IN_PROGRESS;
    }

    // Regel 1: Alle Kinder OPEN → Parent OPEN
    return Status.OPEN;
  }

  // Legacy-Methode für Rückwärtskompatibilität (falls noch wo anders verwendet)
  private computeScheduleFromChildren(childTasks: Task[]): { start?: Date, end?: Date } {
    const validStarts = childTasks
      .map(child => child.start || child.computedStart)
      .filter(date => date !== undefined && date !== null) as Date[];
    
    const validEnds = childTasks
      .map(child => child.end || child.computedEnd)
      .filter(date => date !== undefined && date !== null) as Date[];
    
    const earliestStart = validStarts.length > 0 ? new Date(Math.min(...validStarts.map(d => d.getTime()))) : undefined;
    const latestEnd = validEnds.length > 0 ? new Date(Math.max(...validEnds.map(d => d.getTime()))) : undefined;
    
    return {
      start: earliestStart,
      end: latestEnd
    };
  }

  // Berechnet den gewichteten Fortschritt eines Parent-Tasks basierend auf seinen Kind-Tasks
  // Verwendet Arbeitsvolumen-basierte Berechnung: Summe aller individuellen Child-Dauern
  private computeProgressFromChildren(childTasks: Task[]): number {
    if (!childTasks || childTasks.length === 0) {
      return 0.0; // Default-Progress wenn keine Kinder vorhanden
    }

    let totalWeightedProgress = 0;
    let totalWeight = 0;

    for (const child of childTasks) {
      // Arbeitsvolumen-basiert: Immer die individuelle Task-Dauer verwenden
      const duration = this.calculateIndividualTaskDurationInDays(child);
      
      // Tasks ohne gültige Dauer werden ignoriert
      if (duration <= 0) {
        continue;
      }
      
      // Gewichteten Fortschritt hinzufügen
      totalWeightedProgress += child.progress * duration;
      totalWeight += duration;
    }

    // Wenn alle Child-Tasks keine gültige Dauer haben, Fallback auf 0
    if (totalWeight === 0) {
      return 0.0;
    }

    // Gewichteten Durchschnitt berechnen
    return totalWeightedProgress / totalWeight;
  }

  // Hilfsmethode: Berechnet die Dauer eines Tasks in Tagen (inklusive)
  private calculateTaskDurationInDays(task: Task): number {
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    // Für Tasks mit computeFromChildren die berechneten Daten verwenden
    if (task.computeFromChildren) {
      startDate = task.computedStart;
      endDate = task.computedEnd;
    } else {
      startDate = task.start;
      endDate = task.end;
    }

    // Wenn Start oder Ende fehlen, keine gültige Dauer
    if (!startDate || !endDate) {
      return 0;
    }

    // Inklusive Berechnung: Ende - Start + 1 Tag
    const timeDiff = endDate.getTime() - startDate.getTime();
    const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    return daysDiff + 1; // +1 für inklusive Zählung
  }

  // Hilfsmethode: Berechnet die individuelle Dauer eines Tasks in Tagen (inklusive)
  // Für computeFromChildren-Tasks: Summe aller Child-Dauern
  // Für normale Tasks: Direkte start/end-Daten
  private calculateIndividualTaskDurationInDays(task: Task): number {
    // Für Tasks mit computeFromChildren: Summe aller Child-Dauern verwenden (arbeitsvolumen-basiert)
    if (task.computeFromChildren && task.children && task.children.length > 0) {
      let totalChildDuration = 0;
      for (const childId of task.children) {
        const childTask = this.getTaskById(childId);
        if (childTask) {
          totalChildDuration += this.calculateIndividualTaskDurationInDays(childTask); // Rekursiv
        }
      }
      return totalChildDuration;
    }
    
    // Für normale Tasks: Direkte start/end-Daten verwenden
    const startDate = task.start;
    const endDate = task.end;

    // Wenn Start oder Ende fehlen, keine gültige Dauer
    if (!startDate || !endDate) {
      return 0;
    }

    // Inklusive Berechnung: Ende - Start + 1 Tag
    const timeDiff = endDate.getTime() - startDate.getTime();
    const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    return daysDiff + 1; // +1 für inklusive Zählung
  }

  // Toast-Benachrichtigungen
  showToast(header: string, body: string, type: 'success' | 'error' | 'info' = 'info') {
    switch (type) {
      case 'success':
        this.toastService.showSuccess(header, body);
        break;
      case 'error':
        this.toastService.showError(header, body);
        break;
      case 'info':
        this.toastService.showInfo(header, body);
        break;
    }
  }

  removeToast(toast: any) {
    this.toastService.remove(toast);
  }

  // Hilfsmethode zur Prüfung, ob ein Task basierend auf Status-Filtern sichtbar ist
  private isTaskStatusVisible(task: Task): boolean {
    // Wenn alle Status-Filter deaktiviert sind, alle Tasks anzeigen
    if (!this.chart.filter.showOpenTasks && !this.chart.filter.showInProgressTasks && !this.chart.filter.showDoneTasks && !this.chart.filter.showArchivedTasks) {
      return true;
    }
    
    switch (task.status) {
      case Status.OPEN:
        return this.chart.filter.showOpenTasks;
      case Status.IN_PROGRESS:
        return this.chart.filter.showInProgressTasks;
      case Status.DONE:
        return this.chart.filter.showDoneTasks;
      case Status.ARCHIVED:
        return this.chart.filter.showArchivedTasks;
      default:
        return true; // Fallback für unbekannte Status
    }
  }

  // Hilfsmethode: Findet die Gruppe eines Parent-Tasks für einen Sub-Task
  private getParentGroupForTask(taskId: string): Group | undefined {
    // Parent-Task finden
    const parentTask = this.chart.tasks.find(task => 
      task.children && task.children.includes(taskId)
    );
    
    if (!parentTask) {
      return undefined; // Kein Parent gefunden
    }
    
    // Gruppe des Parent-Tasks zurückgeben
    if (parentTask.group) {
      return this.getGroupById(parentTask.group);
    }
    
    // Wenn Parent auch keine direkte Gruppe hat, rekursiv weiter suchen
    return this.getParentGroupForTask(parentTask.id);
  }

  // Dependency-Aggregation: Sammelt alle Dependencies der Sub-Tasks und fügt sie dem Parent hinzu
  // Wird nur aufgerufen, wenn der Parent eingeklappt ist (!item.expanded)
  private addAggregatedDependencies(itemById: Map<string, GanttItem>, filteredTasks: Task[]): void {
    for (const task of filteredTasks) {
      const parentItem = itemById.get(task.id);
      
      // Nur für Parent-Tasks mit Children, die eingeklappt sind
      if (parentItem && task.children && task.children.length > 0 && !parentItem.expanded) {
        const aggregatedDeps = this.collectChildDependencies(task, new Set<string>());
        const totalDeps = aggregatedDeps.incoming.length + aggregatedDeps.outgoing.length;
        
        if (totalDeps > 0) {
          console.log(`Processing ${totalDeps} aggregated dependencies for collapsed parent ${task.id}:`, 
                     `${aggregatedDeps.incoming.length} incoming, ${aggregatedDeps.outgoing.length} outgoing`);
          
          // Eingehende Dependencies verarbeiten: dependencyTaskId → Parent
          for (const dep of aggregatedDeps.incoming) {
            const blockingItem = itemById.get(dep.taskId);
            if (blockingItem) {
              if (!blockingItem.links) {
                blockingItem.links = [];
              }
              const ganttLink = { link: task.id, type: this.mapDependencyType(dep.type) };
              blockingItem.links.push(ganttLink);
              console.log(`Added incoming aggregated link: ${dep.taskId} → ${task.id}`);
            } else {
              console.warn(`Incoming dependency target not found: ${dep.taskId}`);
            }
          }
          
          // Ausgehende Dependencies verarbeiten: Parent → dependencyTaskId
          for (const dep of aggregatedDeps.outgoing) {
            const targetItem = itemById.get(dep.taskId);
            if (targetItem) {
              if (!parentItem.links) {
                parentItem.links = [];
              }
              const ganttLink = { link: dep.taskId, type: this.mapDependencyType(dep.type) };
              parentItem.links.push(ganttLink);
              console.log(`Added outgoing aggregated link: ${task.id} → ${dep.taskId}`);
            } else {
              console.warn(`Outgoing dependency target not found: ${dep.taskId}`);
            }
          }
        }
      }
    }
  }

  // Sammelt rekursiv alle Dependencies aller Child-Tasks
  private collectChildDependencies(parentTask: Task, visited: Set<string>): { incoming: Dependency[], outgoing: Dependency[] } {
    if (visited.has(parentTask.id) || !parentTask.children) {
      return { incoming: [], outgoing: [] };
    }
    
    visited.add(parentTask.id);
    const incomingDependencies: Dependency[] = [];
    const outgoingDependencies: Dependency[] = [];
    
    for (const childId of parentTask.children) {
      const childTask = this.getTaskById(childId);
      if (!childTask) continue;
      
      // 1. Eingehende Dependencies des Child-Tasks hinzufügen (wer blockiert diesen Child)
      if (childTask.dependencies) {
        for (const dep of childTask.dependencies) {
          // Vermeiden von Duplikaten
          if (!incomingDependencies.some(existing => 
              existing.taskId === dep.taskId && existing.type === dep.type)) {
            incomingDependencies.push(dep);
          }
        }
      }
      
      // 2. Ausgehende Dependencies finden (wen blockiert dieser Child)
      // Alle Tasks durchsuchen, die von diesem Child abhängen
      this.chart.tasks.forEach(otherTask => {
        if (otherTask.dependencies) {
          otherTask.dependencies.forEach(dep => {
            if (dep.taskId === childTask.id) {
              // otherTask hängt von childTask ab -> childTask blockiert otherTask
              // Als ausgehende Dependency vom Parent zu otherTask darstellen
              const outgoingDep = new Dependency();
              outgoingDep.taskId = otherTask.id;
              outgoingDep.type = dep.type;
              
              // Vermeiden von Duplikaten
              if (!outgoingDependencies.some(existing => 
                  existing.taskId === outgoingDep.taskId && existing.type === outgoingDep.type)) {
                outgoingDependencies.push(outgoingDep);
              }
            }
          });
        }
      });
      
      // Rekursiv für Sub-Children
      if (childTask.children && childTask.children.length > 0) {
        const subDependencies = this.collectChildDependencies(childTask, visited);
        // Eingehende Dependencies hinzufügen
        for (const subDep of subDependencies.incoming) {
          if (!incomingDependencies.some(existing => 
              existing.taskId === subDep.taskId && existing.type === subDep.type)) {
            incomingDependencies.push(subDep);
          }
        }
        // Ausgehende Dependencies hinzufügen
        for (const subDep of subDependencies.outgoing) {
          if (!outgoingDependencies.some(existing => 
              existing.taskId === subDep.taskId && existing.type === subDep.type)) {
            outgoingDependencies.push(subDep);
          }
        }
      }
    }
    
    return { incoming: incomingDependencies, outgoing: outgoingDependencies };
  }

  // Hilfsmethode für Type-Mapping (ausgelagert für Wiederverwendung)
  private mapDependencyType(type: DependencyType): import("@worktile/gantt").GanttLinkType {
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