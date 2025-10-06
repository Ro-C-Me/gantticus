import { Component, ViewChild, ElementRef, HostListener } from '@angular/core';
import { GanttItem, GanttViewType, GanttToolbarOptions, GanttPrintService } from '@worktile/gantt';
import { Group, Status, Task } from './domain/Task';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TaskEditModalComponent } from './task-edit-modal/task-edit-modal.component';
import { GroupEditModalComponent } from './group-edit-modal/group-edit-modal.component';
import { GanttChartComponent } from './gantt-chart/gantt-chart.component';
import { Chart } from './domain/Chart';
import { ChartStorageService } from './chart-storage.service';
import { UndoRedoService } from './undo-redo.service';
import { ConfirmChartDeleteDialogComponent } from './confirm-chart-delete-dialog/confirm-chart-delete-dialog.component';
import { ActivatedRoute } from '@angular/router';
import { ToastService } from './toast.service';
import { TaskFilterPipe } from './pipes/task-filter.pipe';
import { DependencyCache } from './gantt-chart/dependency-cache';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  standalone: false,
  providers: [GanttPrintService]
})
export class AppComponent {
  @ViewChild(GanttChartComponent) ganttChartComponent!: GanttChartComponent;

  // Toast-Benachrichtigungen über Service
  get toasts() {
    return this.toastService.getToasts();
  }

  // Maximale Tiefe der Sub-Task-Hierarchie (konfigurierbar)
  maxHierarchyLevel: number = 5;

  // Pipe-Instanz für die Filterlogik
  private taskFilterPipe = new TaskFilterPipe();

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
    setTimeout(() => { this.ganttChartComponent.update(); }, 0);
    
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
    setTimeout(() => { this.ganttChartComponent.update(); }, 0);
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

  // Legacy arrays (items/groups) werden jetzt komplett durch die Kind-Komponente erzeugt

  viewType : GanttViewType = GanttViewType.day;

  showDeleteIcon : boolean = false;

  // Properties für Undo/Redo
  canUndo = false;
  canRedo = false;
  hasUnsavedChanges = false;

  // Filter-Properties sind jetzt in chart.filter enthalten
  private _filteredTasks: Task[] = [];
  private _lastFilteredHash: string = '';
  
  // Computed property für gefilterte Tasks mit Caching
  get filteredTasks(): Task[] {
    const currentHash = JSON.stringify({
      tasks: this.chart.tasks.length,
      filter: this.chart.filter
    });
    
    if (this._lastFilteredHash !== currentHash) {
      this._filteredTasks = this.taskFilterPipe.transform(this.chart.tasks, this.chart.filter);
      this._lastFilteredHash = currentHash;
    }
    
    return this._filteredTasks;
  }

  // Computed property für gefilterte Task-IDs basierend auf gefilterten Tasks
  get filteredTaskIds(): string[] {
    return this.filteredTasks.map(task => task.id);
  }
  
  constructor(
    private modalService: NgbModal, 
    private chartStorage: ChartStorageService, 
    private undoRedoService: UndoRedoService,
    private route: ActivatedRoute,
    private toastService: ToastService,
    private dependencyCache: DependencyCache,
    private ganttPrintService: GanttPrintService
  ) {
    this.initWithNewChart();

    this.availableCharts = this.chartStorage.getChartList();
    
    // Status der Undo/Redo-Buttons abonnieren
    this.undoRedoService.canUndo$.subscribe(can => this.canUndo = can);
    this.undoRedoService.canRedo$.subscribe(can => this.canRedo = can);
    this.undoRedoService.hasUnsavedChanges$.subscribe(has => this.hasUnsavedChanges = has);
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
  
  private initWithNewChart() {
    this.chart = new Chart();
    this.chart.id = this.createId();
    this.chart.name = 'New Gantt chart';
    
    // Initialize dependency cache for new chart
    this.dependencyCache.rebuild(this.chart.tasks);
    
    setTimeout(() => { this.ganttChartComponent.update(); }, 0);
    this.undoRedoService.initStateForChart(this.chart);
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

  private deleteGroup(group: Group) {
    let toDelete = this.chart.tasks.filter(t => t.group == group.id);
    toDelete.forEach(t => {
      this.deleteTask(t);
    });
    this.chart.groups = this.chart.groups.filter(g => g.id != group.id);
    
    // Zustand für Undo speichern
    this.saveStateForUndo();
    setTimeout(() => { this.ganttChartComponent.update(); }, 0);
  }

  private startTaskEditDialog(taskToEdit: Task) {
    const modalRef = this.modalService.open(TaskEditModalComponent, { centered: true });
    modalRef.componentInstance.task = taskToEdit;
    modalRef.componentInstance.tasks = this.chart.tasks;

    modalRef.result.then(
      (result) => {
        console.log("=== TASK EDIT SUCCESS ===");
        console.log("Original task:", taskToEdit);
        console.log("Result task:", result);
        
        // Erst den Task ersetzen
        this.replaceTaskById(result);
        console.log("After replaceTaskById, chart.tasks length:", this.chart.tasks.length);
        
        this.recomputeTasks(result);
        
        // Dann für Undo speichern
        this.saveStateForUndo();
        
        // Explizites Update mit setTimeout um sicherzustellen, dass die Änderung verarbeitet wurde
        setTimeout(() => {
          setTimeout(() => { this.ganttChartComponent.update(); }, 0);
        }, 0);
      },
      (reason) => {

        if (!taskToEdit.title || taskToEdit.title == '') {
          console.log("will delete created task again because user clicked cancel");
          this.deleteTask(taskToEdit);
          // Explizites Update für gelöschten Task
          setTimeout(() => {
            setTimeout(() => { this.ganttChartComponent.update(); }, 0);
          }, 0);
        }
      }
    );
  }

  private replaceTaskById(task: Task) {
    const index = this.chart.tasks.findIndex(t => t.id === task.id);
    if (index == -1) {
      console.log("Couldn't find task with id " + task.id);
    }
    else {
      // Array komplett neu erstellen, damit Angular die Änderung erkennt
      this.chart.tasks = [
        ...this.chart.tasks.slice(0, index),
        task,
        ...this.chart.tasks.slice(index + 1)
      ];
      // Cache invalidieren
      this._lastFilteredHash = '';
    }
  }
  
  private replaceGroupById(group: Group) {
    const index = this.chart.groups.findIndex(g => g.id === group.id);
    if (index == -1) {
      console.log("Couldn't find group with id " + group.id);
    }
    else {
      // Array komplett neu erstellen, damit Angular die Änderung erkennt
      this.chart.groups = [
        ...this.chart.groups.slice(0, index),
        group,
        ...this.chart.groups.slice(index + 1)
      ];
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
        setTimeout(() => { this.ganttChartComponent.update(); }, 0);
      },
      (reason) => {

        if (!toEdit.title || toEdit.title == '') {
          console.log("will delete created group again because user clicked cancel");
          this.deleteGroup(toEdit);
        }
        setTimeout(() => { this.ganttChartComponent.update(); }, 0);
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
    // Explizites Update für neuen Task
    setTimeout(() => {
      setTimeout(() => { this.ganttChartComponent.update(); }, 0);
    }, 0);
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
    // Explizites Update für neue Gruppe
    setTimeout(() => {
      this.ganttChartComponent.update();
    }, 0);
    this.startGroupEditDialog(newGroup);
  }


  onOpenChart(chart: { id: string; name: string; }) {
    const loadedChart = this.chartStorage.getChart(chart.id);
    if (!loadedChart) {
      console.log("Couldn't find a chart with id "+ chart.id);
    }
    else {
      this.chart =  loadedChart;
      // Cache invalidieren
      this._lastFilteredHash = '';
      
      // Initialize dependency cache for loaded chart
      this.dependencyCache.rebuild(this.chart.tasks);
      
      // Explizites Update nach Chart-Loading
      setTimeout(() => {
        setTimeout(() => { this.ganttChartComponent.update(); }, 0);
      }, 0);
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
    setTimeout(() => { this.ganttChartComponent.update(); }, 0);
  }

  // Event-Handler für die neue Gantt-Chart-Komponente
  onGanttDataChanged(changeType?: string) {
    console.log('Data changed:', changeType || 'unspecified');
    
    // Für Task-Updates: Recomputation aller betroffenen Tasks
    if (changeType === 'task-updated') {
      // Da wir nicht wissen welcher Task geändert wurde, recompute alle
      this.chart.tasks.forEach(task => {
        if (task.computeFromChildren || task.dependencies.length > 0) {
          this.recomputeTasks(task);
        }
      });
    }
    
    this.saveStateForUndo();

  }

  onGanttExpandedChanged(newExpanded: Set<string>) {
    this.chart.expanded = newExpanded;
    this.saveStateForUndo();
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
    setTimeout(() => { this.ganttChartComponent.update(); }, 0);
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
      // Synchronize dependency cache with restored chart
      this.dependencyCache.rebuild(this.chart.tasks);
      setTimeout(() => { this.ganttChartComponent.update(); }, 0);
    }
  }

  // Redo-Operation ausführen
  onRedo() {
    if (!this.canRedo) return;

    const nextChart = this.undoRedoService.redo(this.chart);
    if (nextChart) {
      this.chart = nextChart;
      // Synchronize dependency cache with restored chart
      this.dependencyCache.rebuild(this.chart.tasks);
      setTimeout(() => { this.ganttChartComponent.update(); }, 0);
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

  // Bild-Export des Gantt-Charts
  async onImageExport() {
    try {
      this.ganttPrintService.print('gantt-chart');
      this.showToast('Bild Export gestartet', 'Das Gantt-Chart wird als Bild heruntergeladen.', 'info');
    } catch (error) {
      console.error('Fehler beim Bild-Export:', error);
      this.showToast('Fehler beim Export', 'Das Gantt-Chart konnte nicht als Bild exportiert werden.', 'error');
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

}