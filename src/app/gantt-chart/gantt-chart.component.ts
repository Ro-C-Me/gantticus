import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { GanttItem, GanttViewType, GanttDragEvent, GanttTableDragDroppedEvent, GanttGroup, GanttToolbarOptions, GanttLinkType, GanttLinkDragEvent, GanttLineClickEvent, GanttSelectedEvent, GanttBarClickEvent, GanttItemType, GanttGroupInternal, GanttItemInternal } from '@worktile/gantt';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Dependency, DependencyType, Group, Status, Task } from '../domain/Task';
import { TaskEditModalComponent } from '../task-edit-modal/task-edit-modal.component';
import { GroupEditModalComponent } from '../group-edit-modal/group-edit-modal.component';
import { ToastService } from '../toast.service';
import { DependencyCache, DependencyChangeSet } from './dependency-cache';
import { TaskUpdateService, TaskUpdateRequest, TaskUpdateChangeSet, DragDropOperation, DragDropResult } from '../task-update.service';
import { TaskStructureCache } from '../task-structure.cache';

@Component({
  selector: 'app-gantt-chart',
  standalone: false,
  templateUrl: './gantt-chart.component.html',
  styleUrls: ['./gantt-chart.component.scss']
})
export class GanttChartComponent implements OnInit {

  @Input() filteredTaskIds: string[] = [];
  @Input() expanded: Set<string> = new Set();
  @Input() chartId: string = 'gantt-chart';

  @Output() dataChanged = new EventEmitter<string>();
  @Output() expandedChanged = new EventEmitter<Set<string>>();
  @Output() taskAddRequest = new EventEmitter<string>(); // groupId

  // Computed Properties für gefilterte Daten
  get filteredTasks(): Task[] {
    if (!this.filteredTaskIds || this.filteredTaskIds.length === 0) {
      return this.taskStructure.getAllTasks();
    }
    const filteredIdSet = new Set(this.filteredTaskIds);
    return this.taskStructure.getAllTasks().filter(task => filteredIdSet.has(task.id));
  }

  // Gantt-spezifische Properties
  items: GanttItem[] = [];
  ganttGroups: GanttGroup[] = [];

  // UI-spezifische Map für GanttItems (bleibt lokal da UI-spezifisch)
  private itemById = new Map<string, GanttItem>();
  
  // High-performance dependency cache for O(1) dependency lookups
  // Now using shared DependencyService instead of local cache
  
  viewType = GanttViewType.month;
  
  toolbarOptions: GanttToolbarOptions = {
    viewTypes: [
        GanttViewType.day,
        GanttViewType.week,
        GanttViewType.month,
        GanttViewType.quarter,
        GanttViewType.year
    ]
};
  
  // Chart-Konfiguration
  showToolbar = true;
  draggable = true;
  linkable = true;
  selectable = true;
  quickTimeFocus = true;
  maxLevel = 5; // Wird später dynamisch gesetzt

  constructor(
    private modalService: NgbModal, 
    private toastService: ToastService, 
    private dependencyCache: DependencyCache,
    private taskUpdateService: TaskUpdateService,
    private taskStructure: TaskStructureCache
  ) {}

  // Public method to trigger updates from parent component
  public update() {
    this.updateGanttItems();
  }

  /**
   * Zentrale Methode zur Anwendung von Task-Updates über den TaskUpdateService.
   * Ersetzt direkte Task-Manipulation in Event-Handlern.
   * 
   * @param request Update-Request mit Task-ID und Änderungen
   * @returns ChangeSet für weitere Verarbeitung (z.B. Dependency-Updates)
   */
  private processTaskUpdate(request: TaskUpdateRequest): TaskUpdateChangeSet {
    console.log(`🔄 [GANTT CHART] Processing task update via service:`, request);
    
    // Task-Updates über zentralen Service mit bereits aufgebauten Maps
    const changeSet = this.taskUpdateService.updateTaskProperties(
      request);
    
    // CRITICAL: Stelle sicher, dass ursprünglich geänderter Task IMMER aktualisiert wird
    // Verhindert vergessene UI-Updates bei direkten Task-Änderungen (z.B. EndDatum im Modal)
    changeSet.ganttItemsToUpdate = Array.from(new Set([
      request.taskId,              // ← Ursprünglicher Task (garantiert dabei)
      ...changeSet.ganttItemsToUpdate  // ← Alle Parent-Tasks vom Service
    ]));
    
    console.log(`🔄 [GANTT CHART] Ensured original task ${request.taskId} is included in updates:`, {
      originalTask: request.taskId,
      totalItemsToUpdate: changeSet.ganttItemsToUpdate.length,
      allItems: changeSet.ganttItemsToUpdate
    });
    
    // ChangeSet auf GanttItems anwenden (einmalig, alle Updates zusammen)
    this.applyChangeSetToGanttItems(changeSet);
    
    return changeSet;
  }

  /**
   * Wendet ein TaskUpdateChangeSet auf die GanttItems an.
   * Aktualisiert nur betroffene Items für bessere Performance.
   * 
   * @param changeSet ChangeSet vom TaskUpdateService
   */
  private applyChangeSetToGanttItems(changeSet: TaskUpdateChangeSet): void {
    console.log(`🔄 [GANTT CHART] Applying ChangeSet to GanttItems:`, {
      updatedTasks: changeSet.updatedTasks.length,
      ganttItemsToUpdate: changeSet.ganttItemsToUpdate.length
    });
    
    // Nur betroffene GanttItems und GanttGroups aktualisieren
    for (const id of changeSet.ganttItemsToUpdate) {
      const ganttItem = this.itemById.get(id);
      const task = this.taskStructure.getTaskById(id);
      
      if (ganttItem && task) {
        // GanttItem-Properties von Task kopieren
        ganttItem.progress = task.progress;
        ganttItem.title = task.title;
        this.assignTaskColor(ganttItem, task);

        // Zeiten: computedStart/End für Parent-Tasks, start/end für normale Tasks
        if (task.computeFromChildren && task.computedStart && task.computedEnd) {
          ganttItem.start = task.computedStart;
          ganttItem.end = task.computedEnd;
        } else {
          ganttItem.start = task.start;
          ganttItem.end = task.end;
        }
        
        console.log(`🔄 [GANTT CHART] Updated GanttItem: ${id}`, {
          progress: ganttItem.progress,
          start: ganttItem.start,
          end: ganttItem.end
        });
      }

      else {
        const ganttGroup = this.ganttGroups.find(g => g.id === id);
        const group = this.taskStructure.getGroupById(id);

        if (ganttGroup && group) {
          // GanttGroup-Properties von Group kopieren
          ganttGroup.title = group.title;
          this.taskStructure.getAllTasksAndSubTasksOfGroup(group.id).forEach(taskId => {
            this.assignColorForTask(taskId);
          });   
        }
      }
    }
    
    // UI-Update forcieren
    this.forceChartRefresh();
  }

  private assignColorForTask(taskId: string) {
    const item = this.itemById.get(taskId);
    const task = this.taskStructure.getTaskById(taskId);
    if (item && task) {
      this.assignTaskColor(item, task);
    }
  }

  private assignTaskColor(item: GanttItem<unknown>, t: Task) {
    console.log("Assigning color for task, item: ", item, "task: ", t);
    if (t.color) {
      item.color = t.color;
    } else if (t.group && this.getGroupById(t.group)) {
      item.color = this.getGroupById(t.group)!.color;
    } else {
      // Für Sub-Tasks: Farbe des Parent-Tasks (bzw. seiner Gruppe) verwenden
      const parentGroup = this.getParentGroupForTask(t.id);
      if (parentGroup) {
        item.color = parentGroup.color;
      }
    }
  }


  /**
   * Forces a chart refresh by triggering Angular's change detection for the items array.
   * This is used when we need to update the UI after modifying Gantt items or their properties.
   * Centralized to allow for future optimization strategies (e.g., more targeted updates).
   */
  private forceChartRefresh(): void {
    console.log("Force chart refresh", this.items);
    this.items = [...this.items];
  }

  ngOnInit() {
    console.log('🔄 [GANTT CHART] ngOnInit - Maps and parent properties already prepared by AppComponent');
    
    // Alle Initialisierung wurde bereits in AppComponent durchgeführt:
    // 1. TaskStructureCache.buildMaps() ✅
    // 2. TaskUpdateService.precomputeAllParentProperties() ✅ 
    // 3. DependencyCache.rebuild() ✅
    
    // Nur noch UI mit bereits vorbereiteten Daten aufbauen
    this.updateGanttItems();
    console.log('🔄 [GANTT CHART] Gantt items updated with precomputed values');
  }

  onExpandChange(event: GanttItemInternal | GanttGroupInternal | (GanttItemInternal | GanttGroupInternal)[]) {
    console.log("ITEMS: ", this.items);
    
    if ('expanded' in event && event.id) {
      const newExpanded = new Set(this.expanded);
      const isNowExpanded = event.expanded;
      
      if (isNowExpanded) {
        newExpanded.add(event.id);
      } else {
        newExpanded.delete(event.id);
      }
      
      console.log("Updated expanded set:", newExpanded);
      this.expandedChanged.emit(newExpanded);
    }
  }

  barClick($event: GanttBarClickEvent<unknown>) {
    const item = $event.item as GanttItem<unknown>;

    if (item.origin instanceof Task) {
      this.startTaskEditDialog(item.origin);
    }
  }

  onSelect($event: GanttSelectedEvent<unknown>) {
    // Implementierung falls benötigt
  }

  dragEnded($event: GanttDragEvent) {
    const ganttItem = $event.item as GanttItem<unknown>;

    if (ganttItem.origin instanceof Task) {
      const task = ganttItem.origin;
      const newStart = this.toDate($event.item.start);
      const newEnd = this.toDate($event.item.end);
      
      console.log(`🔄 [DRAG ENDED] Task ${task.id} dragged: ${newStart} - ${newEnd}`);
      
      // Task-Update über zentralen Service (aktualisiert auch Parent-Tasks)
      const changeSet = this.processTaskUpdate({
        taskId: task.id,
        changes: {
          start: newStart,
          end: newEnd
        }
      });
      
      // Benachrichtige Parent über Änderung
      this.dataChanged.emit('task-updated');
    }
  }

  private mapGanttLinkType(type: GanttLinkType): DependencyType {
    switch (type) {
      case GanttLinkType.fs:
        return DependencyType.FS;
      case GanttLinkType.ff:
        return DependencyType.FF;
      case GanttLinkType.ss:
        return DependencyType.SS;
      case GanttLinkType.sf:
        return DependencyType.SF;
      default:
        return DependencyType.FS;
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
    console.log("unmodified items: ", this.items);
    const id = $event.source.id;
    console.log("drag dropped a row: " + id + " " + $event.dropPosition + " " + $event.target.id + " in " + $event.targetParent?.id);
    console.log($event);

    const taskToMove = this.getTaskById(id);
    
    if (!taskToMove) {
      console.error("No task to move with id " + id);
      return;
    }

    // 🎯 Service-Orchestrierung: UI wird zum reinen Data-Transformer
    const operation: DragDropOperation = {
      taskToMoveId: id,
      dropPosition: $event.dropPosition as 'before' | 'after' | 'inside',
      targetId: $event.target.id,
      targetParentId: $event.targetParent?.id
    };

    // Service übernimmt komplette Entscheidungslogik
    const result: DragDropResult = this.taskUpdateService.processDragDropOperation(operation);

    if (result.success) {

      const sourceArray = $event.sourceParent? $event.sourceParent.children : this.items;
      if (!sourceArray) {
        console.error("No source array found for drag-drop operation");
        return;
      }
      else {
        console.log("SOURCE ARRAY: ", sourceArray);
        const sourceIdx = sourceArray.indexOf($event.source);
        if (sourceIdx < 0) {
          console.error("Source item not found in source array");
          return;
        }
        else {
          sourceArray.splice(sourceIdx, 1);
          console.log("modified source array: ", sourceArray);
        }
      }

      let targetArray = undefined;
      if ($event.targetParent) {
        if ($event.targetParent.children === undefined) {
          $event.targetParent.children = [];
        }
        targetArray = $event.targetParent.children;
      }
      else if ($event.dropPosition == 'inside') {
        if ($event.target.children === undefined) {
          $event.target.children = [];
        }
        targetArray = $event.target.children;
      }
      else {
        targetArray = this.items;
      }
      if (targetArray === undefined) {
        console.error("No target array found for drag-drop operation");
        return;
      }
      else {
        console.log("TARGET ARRAY: ", targetArray);
        let targetIdx = $event.dropPosition == 'inside' ? 0 : targetArray.indexOf($event.target);
        if (targetIdx == -1) {
          console.error("target not in target array");
          return
        }
        else {
          if ($event.dropPosition == 'after') {
            targetIdx++;
          }
          targetArray.splice(targetIdx, 0, $event.source);
          console.log("modified target array: ", targetArray);
        }
      }
      
      // 🚀 OPTIMIERUNG: Nur betroffene Parent-Tasks aktualisieren statt komplettes Rebuild
      // NGX-Gantt handhabt strukturelle Änderungen (Array-Reihenfolge, Parent-Child) automatisch
      // Wir müssen nur Property-Updates (start, end, progress, status) applizieren
      if (result.updatedTasks && result.updatedTasks.length > 0) {
        const changeSet: TaskUpdateChangeSet = {
          updatedTasks: result.updatedTasks,
          ganttItemsToUpdate: result.ganttItemsToUpdate || []
        };
        this.applyChangeSetToGanttItems(changeSet);
        console.log(`🔄 [GANTT CHART] Applied property updates to ${result.ganttItemsToUpdate?.length || 0} items`);
      }
      
      // UI-Feedback basierend auf Service-Antwort
      this.dataChanged.emit(result.eventType);
      console.log(`✅ [GANTT CHART] ${result.operation} completed successfully`);
    } else {
      console.error(`❌ [GANTT CHART] ${result.operation} failed:`, result.errorMessage);
    }
    this.forceChartRefresh();
    console.log("modified items: ", this.items);
  }

  onLinkDragEnded($event: GanttLinkDragEvent) {
    console.log("Link drag event:", $event);
    
    const sourceItem = $event.source as GanttItem<unknown>;
    const targetItem = $event.target as GanttItem<unknown>;
    
    if (sourceItem.origin instanceof Task && targetItem.origin instanceof Task) {
      const sourceTask = sourceItem.origin;
      const targetTask = targetItem.origin;
      
      const dependency = new Dependency();
      dependency.taskId = sourceTask.id;
      dependency.type = this.mapGanttLinkType($event.type || GanttLinkType.fs);
      
      targetTask.dependencies.push(dependency);
      
      // Cache inkrementell aktualisieren
      this.dependencyCache.addDependency(sourceTask.id, targetTask.id, dependency.type);
      
      console.log(`Added dependency: ${sourceTask.id} -> ${targetTask.id} (${dependency.type})`);
      
      this.dataChanged.emit('dependency-added');
    }
  }

  onLinkClick($event: GanttLineClickEvent) {
    console.log("Link click event:", $event);
    if ($event.target.origin instanceof Task) {
      const targetTask = $event.target.origin;
      const sourceId = $event.source.id;
      
      console.log("dependencies before removal:", targetTask.dependencies);
      
      // Den Dependency-Type bestimmen, bevor wir löschen
      const dependencyToRemove = targetTask.dependencies.find(d => d.taskId === sourceId);
      const dependencyType = dependencyToRemove?.type || DependencyType.FS; // Fallback
      
      // Dependency aus dem Target-Task entfernen
      targetTask.dependencies = targetTask.dependencies.filter(d => d.taskId !== sourceId);
      console.log("dependencies after removal:", targetTask.dependencies);

      const item = this.itemById.get(sourceId);
      if (item && item.links) {
        console.log("item links: ", item.links);
        item.end = new Date();
        item.links = item.links.filter(link => link.link !== targetTask.id);
        console.log("removed dependency", item.links);
      }
      else {
        console.warn(`No Gantt item or links found for sourceId ${sourceId}`);
      }
      // Cache inkrementell aktualisieren
      this.dependencyCache.removeDependency(sourceId, targetTask.id, dependencyType);

      console.log(`Removed dependency: ${sourceId} -> ${targetTask.title}`);
      
      this.forceChartRefresh(); // Force UI update
      this.dataChanged.emit('dependency-removed');
    }
  }

  /**
   * Applies dependency changes to the GanttItems by updating their links property.
   * This method handles both adding new links and removing existing links based on
   * the provided change set.
   * 
   * @param changeSet The set of dependency changes to apply
   */
  private applyDependencyChangesToGanttItems(changeSet: DependencyChangeSet): void {
    console.log(`🔗 [GANTT ITEMS] Applying dependency changes: +${changeSet.addedDependencies.length} -${changeSet.removedDependencies.length}`);
    
    // Remove dependencies: find source items and remove links to target
    for (const removedDep of changeSet.removedDependencies) {
      const sourceItem = this.itemById.get(removedDep.sourceId);
      if (sourceItem && sourceItem.links) {
        const originalLength = sourceItem.links.length;
        sourceItem.links = sourceItem.links.filter(link => {
          // Handle both string and GanttLink types for backwards compatibility
          if (typeof link === 'string') {
            return link !== removedDep.targetId;
          }
          return !(link.link === removedDep.targetId && this.mapGanttLinkType(link.type) === removedDep.type);
        });
        if (sourceItem.links.length < originalLength) {
          console.log(`🔗 [GANTT ITEMS] Removed link: ${removedDep.sourceId} -${removedDep.type}-> ${removedDep.targetId}`);
        }
      }
    }
    
    // Add dependencies: find source items and add links to target
    for (const addedDep of changeSet.addedDependencies) {
      const sourceItem = this.itemById.get(addedDep.sourceId);
      if (sourceItem) {
        // Initialize links array if it doesn't exist
        if (!sourceItem.links) {
          sourceItem.links = [];
        }
        
        // Create and add the new link (normale Dependencies ohne spezielle Farbe)
        const newLink = this.createGanttLink(addedDep.targetId, addedDep.type);
        sourceItem.links.push(newLink);
        console.log(`🔗 [GANTT ITEMS] Added link: ${addedDep.sourceId} -${addedDep.type}-> ${addedDep.targetId}`);
      }
    }
    
    // Force UI update if there were any changes
    if (changeSet.addedDependencies.length > 0 || changeSet.removedDependencies.length > 0) {
      this.forceChartRefresh();
    }
  }

  /**
   * Helper method to create a GanttLink from dependency information.
   * @param targetId The ID of the target task
   * @param type The dependency type
   * @param color Optional color for the link (e.g., for aggregated dependencies)
   * @returns A GanttLink object
   */
  private createGanttLink(targetId: string, type: DependencyType, color?: string): import("@worktile/gantt").GanttLink {
    const link: import("@worktile/gantt").GanttLink = { 
      link: targetId, 
      type: this.mapDependencyTypeToGanttLinkType(type) 
    };
    
    if (color) {
      link.color = color;
    }
    
    return link;
  }

  /**
   * Maps our internal DependencyType to GanttLinkType.
   * @param type The internal dependency type
   * @returns The corresponding GanttLinkType
   */
  private mapDependencyTypeToGanttLinkType(type: DependencyType): GanttLinkType {
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

  // Status-Komponente Event Handler
  onStatusChange(item: GanttItem): void {
    if (!(item.origin instanceof Task)) {
      console.warn('Item\'s origin is not a Task instance:', item.origin);
      return;
    }
    
    const task = item.origin;
    console.log(`🔄 [STATUS CHANGE] Task ${task.id}: ${task.status}`);
    
    // Task-Update über zentralen Service (aktualisiert auch Parent-Tasks)
    const changeSet = this.processTaskUpdate({
      taskId: task.id,
      changes: {
        status: task.status
      }
    });
    
    this.dataChanged.emit('task-status-updated');
  }

  onValidationError(message: string) {
    this.toastService.showError('Validierung fehlgeschlagen', message);
  }

  onTaskDeleted(item: GanttItem) {
    if (item.origin instanceof Task) {
      const task = item.origin;
      
      // Task löschen über TaskUpdateService
      if (this.taskUpdateService.deleteTask(task.id)) {
        // Benachrichtige Parent über Löschung
        this.dataChanged.emit('task-deleted');
        // TODO Not really performant, but necessary at the moment: Rerender whole component after deletion
        this.updateGanttItems();
        this.toastService.showSuccess('Task gelöscht', `Task "${task.title}" wurde gelöscht.`);
      }
    }
  }

  onTaskTitleClicked(item: GanttItem) {
    if (item.origin instanceof Task) {
      const task = item.origin;
      this.startTaskEditDialog(task);
    }
  }

  onGroupTitleClick(group: GanttGroup) {
    // Group-Edit-Dialog direkt öffnen
    if (group.origin instanceof Group) {
      this.startGroupEditDialog(group.origin);
    }
  }

  onGroupDelete(group: GanttGroup) {
    if (group.origin instanceof Group) {
      // Gruppe löschen über TaskUpdateService
      const deletedTaskCount = this.taskUpdateService.deleteGroup(group.id);
      
      if (deletedTaskCount >= 0) {
        // TODO Not really performant, but necessary at the moment: Rerender whole component after deletion
        this.updateGanttItems();

        // Benachrichtige Parent über Löschung
        this.dataChanged.emit('group-deleted');
        
        this.toastService.showSuccess('Gruppe gelöscht', 
          `Gruppe "${group.title}" und ${deletedTaskCount} Tasks wurden gelöscht.`);
      }
    }
  }

  onAddTask(group: GanttGroup) {
    // TODO warum muss das über außen gespielt werden?
    this.taskAddRequest.emit(group.id);
  }

  private startGroupEditDialog(group: Group) {
    const modalRef = this.modalService.open(GroupEditModalComponent, { size: 'lg' });
    modalRef.componentInstance.group = group;

    modalRef.result.then((updatedGroup: Group) => {
      if (updatedGroup) {
         const changeSet = this.taskUpdateService.updateGroup(updatedGroup);

        changeSet.ganttItemsToUpdate = Array.from(new Set([
          group.id,
          ...changeSet.ganttItemsToUpdate
        ]));

        this.applyChangeSetToGanttItems(changeSet);

        this.dataChanged.emit('group-updated');
      }
    }).catch(err => {
      console.log('Group edit modal dismissed');
    });
  }

  onProgressChange(item: GanttItem): void {
    if (!(item.origin instanceof Task)) {
      console.warn('Item\'s origin is not a Task instance:', item.origin);
      return;
    }
    
    const task = item.origin;
    console.log(`🔄 [PROGRESS CHANGE] Task ${task.id}: ${task.progress}`);
    item.progress = task.progress;
    // Task-Update über zentralen Service (aktualisiert auch Parent-Tasks)
    const changeSet = this.processTaskUpdate({
      taskId: task.id,
      changes: {
        progress: task.progress
      }
    });
    
    this.dataChanged.emit('task-progress-updated');
  }

  private startTaskEditDialog(task: Task) {
    const modalRef = this.modalService.open(TaskEditModalComponent, { size: 'xl' });
    modalRef.componentInstance.task = task;
    modalRef.componentInstance.tasks = this.taskStructure.getAllTasks();
    modalRef.componentInstance.groups = this.taskStructure.getAllGroups();
    
    modalRef.result.then((updatedTask: Task) => {
      if (updatedTask) {
        console.log(`🔄 [TASK EDIT] Task updated via modal:`, updatedTask.id);

        const changeSet = this.taskUpdateService.updateTask(updatedTask);

        changeSet.ganttItemsToUpdate = Array.from(new Set([
          updatedTask.id,              // ← Ursprünglicher Task (garantiert dabei)
          ...changeSet.ganttItemsToUpdate  // ← Alle Parent-Tasks vom Service
        ]));

        this.applyChangeSetToGanttItems(changeSet);

        // Dependencies wurden bereits vom Service aktualisiert und sind im ChangeSet enthalten
        if (changeSet.dependencyChanges) {
          this.applyDependencyChangesToGanttItems(changeSet.dependencyChanges);
        }

        // TODO aggregation
        // TODO update filter?
        
        this.dataChanged.emit('task-updated');
      }
    }).catch(err => {
      console.log('Task edit modal dismissed');
    });
  }

   updateGanttItems() {
    const startTime = performance.now();
    console.log("🟡 [GANTTICUS PERF] START updateGanttItems", {
      tasksCount: this.taskStructure.getAllTasks().length,
      groupsCount: this.taskStructure.getAllGroups().length,
      filteredTasksCount: this.filteredTasks.length
    });
    
    // Performance-optimierte Lookup-Maps wurden bereits zentral über AppComponent verwaltet
    // (siehe ngOnInit Kommentar: TaskStructureCache.init() bereits aufgerufen)
    
    // itemById Map zurücksetzen - wird neu aufgebaut
    this.itemById.clear();
    this.items = [];
    this.ganttGroups = [];

    let childTaskIds = new Set<string>();
    let requiresDefaultGroup = false;
    
    // Erst alle Child-Task-IDs sammeln (nur von gefilterten Tasks)
    this.filteredTasks.forEach(t => {
      if (t.children && t.children.length > 0) {
        t.children.forEach(childId => {
          // Nur Children hinzufügen, die auch in der gefilterten Liste sind
          if (this.filteredTasks.some(ft => ft.id === childId)) {
            childTaskIds.add(childId);
          }
        });
      }
    });
    this.filteredTasks.forEach( t => {
        let item : GanttItem = {title : t.title, id : t.id}; 
        item.progress = t.progress;
        item.origin = t;
        
        // Expanded-Zustand aus dem Chart wiederherstellen
        // Standardmäßig sind alle Tasks geschlossen, außer sie stehen in der expanded-Liste
        item.expanded = this.expanded.has(t.id);
        
        // Start und End von bereits vorberechneten Properties übernehmen
        // (Parent-Properties wurden bereits in ngOnInit über den TaskUpdateService berechnet)
        if (t.computeFromChildren && t.computedStart && t.computedEnd) {
          // Für Parent-Tasks: Verwende die vorberechneten computedStart/End
          item.start = t.computedStart;
          item.end = t.computedEnd;
        } else {
          // Für normale Tasks: Verwende die direkten start/end Properties
          item.start = t.start;
          item.end = t.end;
        }
        
        this.assignTaskColor(item, t);
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
        this.itemById.set(t.id, item);
      });

    // Sub-Tasks (children) zuweisen - nach dem alle Items erstellt sind
    this.filteredTasks.forEach(t => {
      if (t.children && t.children.length > 0) {
        const parentItem = this.itemById.get(t.id);
        if (parentItem) {
          parentItem.children = t.children
            .map(childId => this.itemById.get(childId))
            .filter(child => child !== undefined) as GanttItem[];
        }
      }
    });

    this.filteredTasks.forEach(t => {
     t.dependencies.forEach(d => {
        const sourceItem = this.itemById.get(d.taskId);
        if (sourceItem) {
          if (!sourceItem.links) {
            sourceItem.links = [];
          }
          sourceItem.links.push(createGanttLink(t.id, d.type));
        }
     })
    });

    this.taskStructure.getAllGroups().forEach( g => {
      // Optimierte Version: O(1) Group-Lookups
      const allTaskIdsInGroup = this.taskStructure.getTasksOfGroup(g.id) || [];
      const isReallyEmpty = allTaskIdsInGroup.length === 0;
      
      // Prüfe ob die Gruppe gefilterte Tasks enthält
      const filteredTasksInGroup = this.filteredTasks.filter(task => task.group === g.id);
      const hasFilteredTasks = filteredTasksInGroup.length > 0;
      
      // Gruppe anzeigen wenn sie entweder:
      // 1. Mindestens einen gefilterten Task enthält, oder
      // 2. Komplett leer ist (keine Tasks zugeordnet)
      if (hasFilteredTasks || isReallyEmpty) {
        let item : GanttGroup = {title : g.title, id : g.id}; 
        item.origin = g;
        console.log("Group " + g.id + " expanded?" + this.expanded.has(g.id));
        item.expanded = this.expanded.has(g.id);
        this.ganttGroups.push(item);
      }
    });

    // Default-Gruppe nach gleicher Logik filtern
    if (this.taskStructure.getAllGroups().length > 0) {
      // Prüfe ob Default-Gruppe Tasks hat (alle Tasks ohne Gruppe oder mit null/undefined Gruppe)
      const allDefaultGroupTasks = this.taskStructure.getAllTasks().filter(task => !task.group || task.group === Group.DEFAULT_GROUP_ID);
      const isDefaultGroupReallyEmpty = allDefaultGroupTasks.length === 0;
      
      // Prüfe ob Default-Gruppe gefilterte Tasks enthält
      const filteredDefaultGroupTasks = this.items.filter(i => i.group_id == Group.DEFAULT_GROUP_ID);
      const hasFilteredDefaultTasks = filteredDefaultGroupTasks.length > 0;
      
      // Default-Gruppe anzeigen wenn sie entweder gefilterte Tasks hat oder komplett leer ist
      if (hasFilteredDefaultTasks || isDefaultGroupReallyEmpty) {
        const defaultGroup: GanttGroup = {
          id: Group.DEFAULT_GROUP_ID, 
          title: '',
          expanded: this.expanded.has(Group.DEFAULT_GROUP_ID)
        };
        this.ganttGroups.push(defaultGroup);
      }
    }
    
    console.log("this.groups: ");
    console.log(this.taskStructure.getAllGroups());

    console.log("this.filteredTasks: ");
    console.log(this.filteredTasks);

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
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    const color = duration > 100 ? '🔴' : duration > 50 ? '🟠' : '🟢';
    console.log(`${color} [GANTTICUS PERF] END   updateGanttItems - ${duration.toFixed(2)}ms`, {
      finalItemsCount: this.items.length,
      finalGroupsCount: this.ganttGroups.length,
      processedTasksCount: this.filteredTasks.length
    });
  }
  getStatusText(task: Task): string {
    if (!task) return '';
    switch (task.status) {
      case Status.OPEN:
        return 'Offen';
      case Status.IN_PROGRESS:
        return 'In Arbeit';
      case Status.DONE:
        return 'Erledigt';
      case Status.ARCHIVED:
        return 'Archiviert';
      default:
        return '';
    }
  }

  isOverdue(task: Task): boolean {
    if (!task || !task.end) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskEnd = new Date(task.end);
    taskEnd.setHours(0, 0, 0, 0);
    return taskEnd < today && task.status !== Status.DONE;
  }

  private showToast(header: string, body: string, type: 'success' | 'error' | 'info' = 'info') {
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

    private processDependencies(itemById: Map<string, GanttItem>): void {
    // Alle Tasks durchgehen und deren Dependencies verarbeiten
    this.filteredTasks.forEach(task => {
      if (task.dependencies && task.dependencies.length > 0) {
        task.dependencies.forEach(dep => {
          // Target-Item finden (das Item, das von diesem Task abhängt)
          const targetItem = itemById.get(dep.taskId);
          if (targetItem) {
            // Link zu dem Task hinzufügen, der abhängig ist
            targetItem.links = targetItem.links || [];
            targetItem.links.push({
              link: task.id, // Dieser Task ist die Quelle
              type: this.mapDependencyType(dep.type)
            });
          }
        });
      }
    });
  }

  private mapDependencyType(type: DependencyType): GanttLinkType {
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
        return GanttLinkType.fs;
    }
  }

  

  /**
   * Baut alle Performance-optimierten Lookup-Maps auf
   * Muss nach jeder Änderung der Tasks- oder Groups-Liste aufgerufen werden
   */
  private buildLookupMaps(): void {
    this.taskStructure.init(this.taskStructure.getAllTasks(), this.taskStructure.getAllGroups());
  }

  private getTaskById(id: string): Task | undefined {
    // Optimierte Version: O(1) statt O(n)
    return this.taskStructure.getTaskById(id);
  }

  getGroupById(id: string) : Group | undefined{
    // Optimierte Version: O(1) statt O(n)
    return this.taskStructure.getGroupById(id);
  }

  private removeTaskFromParent(taskId: string) {
    // Optimierte Version: O(1) statt O(n×m)
    const parentId = this.taskStructure.parentByChildId.get(taskId);
    if (parentId) {
      const parentTask = this.taskStructure.taskById.get(parentId);
      if (parentTask && parentTask.children) {
        // Aus dem Parent-Task Array entfernen
        parentTask.children = parentTask.children.filter(childId => childId !== taskId);
        
        // Maps aktualisieren
        this.taskStructure.parentByChildId.delete(taskId);
        this.taskStructure.childrenByParentId.set(parentId, [...parentTask.children]);
      }
    }
  }

    // Hilfsmethode: Findet die Gruppe eines Parent-Tasks für einen Sub-Task
    private getParentGroupForTask(taskId: string): Group | undefined {
      // Optimierte Version: O(1) statt O(n×m)
      const parentId = this.taskStructure.parentByChildId.get(taskId);
      if (!parentId) {
        return undefined; // Kein Parent gefunden
      }
      
      const parentTask = this.taskStructure.getTaskById(parentId);
      if (!parentTask) {
        return undefined; // Parent-Task nicht gefunden
      }
      
      // Gruppe des Parent-Tasks zurückgeben
      if (parentTask.group) {
        return this.getGroupById(parentTask.group);
      }
      
      // Wenn Parent auch keine direkte Gruppe hat, rekursiv weiter suchen
      return this.getParentGroupForTask(parentTask.id);
    }
}

