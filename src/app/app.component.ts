import { Component, ViewChild, ElementRef, OnInit, HostListener } from '@angular/core';
import { GanttItem, GanttViewType, GanttDragEvent, GanttTableDragDroppedEvent, GanttGroup, GanttToolbarOptions, GanttLinkType, GanttLinkDragEvent, GanttLineClickEvent, GanttSelectedEvent, GanttBarClickEvent } from '@worktile/gantt';
import { Dependency, DependencyType, Group, Status, Task } from './domain/Task';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TaskEditModalComponent } from './task-edit-modal/task-edit-modal.component';
import { GroupEditModalComponent } from './group-edit-modal/group-edit-modal.component';
import { Chart } from './domain/Chart';
import { ChartStorageService } from './chart-storage.service';
import { UndoRedoService } from './undo-redo.service';
import { ConfirmChartDeleteDialogComponent } from './confirm-chart-delete-dialog/confirm-chart-delete-dialog.component';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  standalone: false
})
export class AppComponent implements OnInit {

  // Toast-Benachrichtigungen
  toasts: any[] = [];

  isOverdue(task: Task) : boolean{
    if (!task.end) {
      return false;
    }
    else {
      return task.end <  new Date() && task.status != Status.DONE;
    } 
}
  

  onStatusChange(task: Task): void {
    // Erst speichern, dann UI aktualisieren
    this.saveStateForUndo();
    this.updateGanttItems();
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
  
  constructor(
    private modalService: NgbModal, 
    private chartStorage: ChartStorageService, 
    private undoRedoService: UndoRedoService,
    private route: ActivatedRoute
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
    modalRef.componentInstance.group = { ...toEdit };


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
          else        if (taskToMove.group != $event.target.origin.group) {
            console.log("group changed by drag&drop from " + taskToMove.group + " to " + $event.target.origin.group);
            taskToMove.group = $event.target.origin.group;
          }

          // Erst alle Änderungen durchführen
          if ($event.dropPosition == "after") {
            targetIndex++;
          }
          this.chart.tasks.splice(this.chart.tasks.indexOf(taskToMove), 1);
          this.chart.tasks.splice(targetIndex, 0, taskToMove);
          
          // Dann den Zustand für Undo speichern
          this.saveStateForUndo();
        }

        this.updateGanttItems();
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
    let requiresDefaultGroup = false;

    this.items = [];

    this.chart.tasks.forEach( t => {
      let item : GanttItem = {title : t.title, id : t.id}; 
      item.progress = t.progress;
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
    
    // Header
    lines.push('Name,Start,Ende,URL');
    
    // Gruppierte Tasks
    if (this.chart.groups && this.chart.groups.length > 0) {
      for (const group of this.chart.groups) {
        // Gruppe als eigene Zeile
        lines.push(`"${group.title}","","",""`);
        
        // Tasks der Gruppe
        const groupTasks = this.chart.tasks.filter(task => task.group === group.id);
        for (const task of groupTasks) {
          const startDate = task.start ? this.formatDateForCsv(task.start) : '';
          const endDate = task.end ? this.formatDateForCsv(task.end) : '';
          const url = task.ticketUrl || '';
          lines.push(`"${task.title}","${startDate}","${endDate}","${url}"`);
        }
      }
    }
    
    // Tasks ohne Gruppe
    const ungroupedTasks = this.chart.tasks.filter(task => !task.group || task.group === '');
    if (ungroupedTasks.length > 0) {
      // Leerzeile vor ungroupierten Tasks (falls es Gruppen gibt)
      if (this.chart.groups && this.chart.groups.length > 0) {
        lines.push('');
      }
      
      for (const task of ungroupedTasks) {
        const startDate = task.start ? this.formatDateForCsv(task.start) : '';
        const endDate = task.end ? this.formatDateForCsv(task.end) : '';
        const url = task.ticketUrl || '';
        lines.push(`"${task.title}","${startDate}","${endDate}","${url}"`);
      }
    }
    
    return lines.join('\n');
  }

  private formatDateForCsv(date: Date): string {
    // Deutsches Format (DD.MM.YYYY)
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  }

  private generateHtmlTable(): string {
    let html = `
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; font-family: Arial, sans-serif;">
  <thead>
    <tr style="background-color: #f8f9fa; font-weight: bold;">
      <th style="border: 1px solid #dee2e6; padding: 8px;">Name</th>
      <th style="border: 1px solid #dee2e6; padding: 8px;">Start</th>
      <th style="border: 1px solid #dee2e6; padding: 8px;">Ende</th>
      <th style="border: 1px solid #dee2e6; padding: 8px;">URL</th>
    </tr>
  </thead>
  <tbody>`;

    // Gruppierte Tasks
    if (this.chart.groups && this.chart.groups.length > 0) {
      for (const group of this.chart.groups) {
        const groupTasks = this.chart.tasks.filter(task => task.group === group.id);
        const groupColor = group.color || '#e9ecef';
        
        // Gruppe als verbundene Zeile
        html += `
    <tr style="background-color: ${groupColor}; font-weight: bold;">
      <td colspan="4" style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">
        ${this.escapeHtml(group.title)}
      </td>
    </tr>`;
        
        // Tasks der Gruppe
        for (const task of groupTasks) {
          const startDate = task.start ? this.formatDateForCsv(task.start) : '';
          const endDate = task.end ? this.formatDateForCsv(task.end) : '';
          const url = task.ticketUrl || '';
          const taskColor = task.color || '#ffffff';
          
          // Styling für abgeschlossene Tasks oder überfällige Tasks
          const isCompleted = task.status === Status.DONE;
          const isOverdue = this.isOverdue(task);
          const taskTextColor = isCompleted ? '#6c757d' : '#000000'; // Grau für abgeschlossene Tasks
          const endDateColor = isOverdue ? 'red' : (isCompleted ? '#6c757d' : '#000000'); // Rot für überfällige, grau für abgeschlossene
          
          html += `
    <tr style="background-color: ${taskColor}; color: ${taskTextColor};">
      <td style="border: 1px solid #dee2e6; padding: 8px;">${this.escapeHtml(task.title)}</td>
      <td style="border: 1px solid #dee2e6; padding: 8px;">${startDate}</td>
      <td style="border: 1px solid #dee2e6; padding: 8px; color: ${endDateColor};">${endDate}</td>
      <td style="border: 1px solid #dee2e6; padding: 8px;">${url ? `<a href="${this.escapeHtml(url)}" target="_blank" style="color: ${taskTextColor};">${this.escapeHtml(url)}</a>` : ''}</td>
    </tr>`;
        }
      }
    }
    
    // Tasks ohne Gruppe
    const ungroupedTasks = this.chart.tasks.filter(task => !task.group || task.group === '');
    if (ungroupedTasks.length > 0) {
      // Trennzeile falls es Gruppen gibt
      if (this.chart.groups && this.chart.groups.length > 0) {
        html += `
    <tr>
      <td colspan="4" style="border: 1px solid #dee2e6; padding: 4px; background-color: #f8f9fa;">&nbsp;</td>
    </tr>`;
      }
      
      for (const task of ungroupedTasks) {
        const startDate = task.start ? this.formatDateForCsv(task.start) : '';
        const endDate = task.end ? this.formatDateForCsv(task.end) : '';
        const url = task.ticketUrl || '';
        const taskColor = task.color || '#ffffff';
        
        // Styling für abgeschlossene Tasks oder überfällige Tasks
        const isCompleted = task.status === Status.DONE;
        const isOverdue = this.isOverdue(task);
        const taskTextColor = isCompleted ? '#6c757d' : '#000000'; // Grau für abgeschlossene Tasks
        const endDateColor = isOverdue ? '#dc3545' : (isCompleted ? '#6c757d' : '#000000'); // Rot für überfällige, grau für abgeschlossene
        
        html += `
    <tr style="background-color: ${taskColor}; color: ${taskTextColor};">
      <td style="border: 1px solid #dee2e6; padding: 8px;">${this.escapeHtml(task.title)}</td>
      <td style="border: 1px solid #dee2e6; padding: 8px;">${startDate}</td>
      <td style="border: 1px solid #dee2e6; padding: 8px; color: ${endDateColor};">${endDate}</td>
      <td style="border: 1px solid #dee2e6; padding: 8px;">${url ? `<a href="${this.escapeHtml(url)}" target="_blank" style="color: ${taskTextColor};">${this.escapeHtml(url)}</a>` : ''}</td>
    </tr>`;
      }
    }
    
    html += `
  </tbody>
</table>`;
    
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

  // Toast-Benachrichtigungen
  showToast(header: string, body: string, type: 'success' | 'error' | 'info' = 'info') {
    const toast = {
      header,
      body,
      classname: this.getToastClass(type),
      icon: this.getToastIcon(type)
    };
    this.toasts.push(toast);
  }

  removeToast(toast: any) {
    this.toasts = this.toasts.filter(t => t !== toast);
  }

  private getToastClass(type: string): string {
    switch (type) {
      case 'success': return 'bg-success text-light';
      case 'error': return 'bg-danger text-light';
      case 'info': return 'bg-info text-light';
      default: return 'bg-light';
    }
  }

  private getToastIcon(type: string): string {
    switch (type) {
      case 'success': return 'bi-check-circle-fill';
      case 'error': return 'bi-exclamation-triangle-fill';
      case 'info': return 'bi-info-circle-fill';
      default: return 'bi-info-circle';
    }
  }
}