import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { GanttItem, GanttViewType, GanttDragEvent, GanttTableDragDroppedEvent, GanttGroup, GanttToolbarOptions, GanttLinkType, GanttLinkDragEvent, GanttLineClickEvent, GanttSelectedEvent, GanttBarClickEvent, GanttItemType, GanttGroupInternal, GanttItemInternal } from '@worktile/gantt';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Dependency, DependencyType, Group, Status, Task } from '../domain/Task';
import { TaskEditModalComponent } from '../task-edit-modal/task-edit-modal.component';
import { GroupEditModalComponent } from '../group-edit-modal/group-edit-modal.component';
import { TaskTitleComponent } from '../task-title/task-title.component';
import { ToastService } from '../toast.service';
import { DependencyCache, DependencyChangeSet } from './dependency-cache';

@Component({
  selector: 'app-gantt-chart',
  standalone: false,
  templateUrl: './gantt-chart.component.html',
  styleUrls: ['./gantt-chart.component.scss']
})
export class GanttChartComponent implements OnInit {

  @Input() tasks: Task[] = [];
  @Input() groups: Group[] = [];
  @Input() filteredTaskIds: string[] = [];
  @Input() expanded: Set<string> = new Set();
  @Input() chartId: string = 'gantt-chart';

  @Output() dataChanged = new EventEmitter<string>();
  @Output() expandedChanged = new EventEmitter<Set<string>>();
  @Output() taskAddRequest = new EventEmitter<string>(); // groupId

  // Computed Properties für gefilterte Daten
  get filteredTasks(): Task[] {
    if (!this.filteredTaskIds || this.filteredTaskIds.length === 0) {
      return this.tasks;
    }
    const filteredIdSet = new Set(this.filteredTaskIds);
    return this.tasks.filter(task => filteredIdSet.has(task.id));
  }

  // Gantt-spezifische Properties
  items: GanttItem[] = [];
  ganttGroups: GanttGroup[] = [];

  // Performance-optimierte Lookup-Maps
  private taskById = new Map<string, Task>();
  private childrenByParentId = new Map<string, string[]>();
  private parentByChildId = new Map<string, string>();
  private groupById = new Map<string, Group>();
  private tasksByGroupId = new Map<string, string[]>();
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

  constructor(private modalService: NgbModal, private toastService: ToastService, private dependencyCache: DependencyCache) {}

  // Public method to trigger updates from parent component
  public update() {
    this.updateGanttItems();
  }

  /**
   * Forces a chart refresh by triggering Angular's change detection for the items array.
   * This is used when we need to update the UI after modifying Gantt items or their properties.
   * Centralized to allow for future optimization strategies (e.g., more targeted updates).
   */
  private forceChartRefresh(): void {
    this.items = [...this.items];
  }

  ngOnInit() {
    this.updateGanttItems();
  }

  onExpandChange(event: GanttItemInternal | GanttGroupInternal | (GanttItemInternal | GanttGroupInternal)[]) {
    console.log("Expand change event:", event);
    
    if ('expanded' in event && event.id) {
      const newExpanded = new Set(this.expanded);
      const wasExpanded = this.expanded.has(event.id);
      const isNowExpanded = event.expanded;
      
      if (isNowExpanded) {
        newExpanded.add(event.id);
      } else {
        newExpanded.delete(event.id);
      }
      
      console.log("Updated expanded set:", newExpanded);
      
      // Smart dependency update: Only for task items with children
      const task = this.getTaskById(event.id);
      if (task && task.children && task.children.length > 0) {
        // Task has children - update aggregated dependencies reactively
        this.updateAggregatedDependenciesForTask(task, wasExpanded, isNowExpanded || false);
      }
      
      this.expandedChanged.emit(newExpanded);
    }
  }

  /**
   * Intelligently updates aggregated dependencies for a single task when its expand state changes.
   * This avoids full updateGanttItems() calls and only updates what's necessary.
   * 
   * Performance: O(k) where k = number of child dependencies (vs. O(n) full update)
   * 
   * @param task The task whose expand state changed
   * @param wasExpanded Previous expanded state
   * @param isNowExpanded Current expanded state
   */
  private updateAggregatedDependenciesForTask(task: Task, wasExpanded: boolean, isNowExpanded: boolean): void {
    const startTime = performance.now();
    const parentItem = this.itemById.get(task.id);
    
    if (!parentItem) {
      console.warn(`🚨 [SMART UPDATE] Parent item not found for task: ${task.id}`);
      return;
    }
    
    try {
      if (!wasExpanded && isNowExpanded) {
        // Task wurde AUFGEKLAPPT → Aggregierte Dependencies ENTFERNEN
        this.removeAggregatedDependenciesForTask(task, parentItem);
        console.log(`🔽 [SMART UPDATE] Removed aggregated dependencies for expanded task: ${task.id}`);
        
      } else if (wasExpanded && !isNowExpanded) {
        // Task wurde ZUGEKLAPPT → Aggregierte Dependencies HINZUFÜGEN
        this.addAggregatedDependenciesForTask(task, parentItem);
        console.log(`🔼 [SMART UPDATE] Added aggregated dependencies for collapsed task: ${task.id}`);
      }
      
      // Force UI update for this specific change
      this.forceChartRefresh();
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      console.log(`🟢 [SMART UPDATE] Completed for ${task.id} - ${duration.toFixed(2)}ms`);
      
    } catch (error) {
      console.warn(`🚨 [SMART UPDATE] Error updating dependencies for ${task.id}, falling back to full update:`, error);
      // Graceful fallback: Full update if smart update fails
      this.updateGanttItems();
    }
  }

  /**
   * Adds aggregated dependencies for a single collapsed task.
   */
  private addAggregatedDependenciesForTask(task: Task, parentItem: GanttItem): void {
    const aggregationResult = this.collectChildDependenciesOptimized(task);
    
    // Eingehende Dependencies verarbeiten: dependencyTaskId → Parent
    for (const dep of aggregationResult.incoming) {
      const blockingItem = this.itemById.get(dep.taskId);
      if (blockingItem) {
        if (!blockingItem.links) {
          blockingItem.links = [];
        }
        // Intelligent blockierungsbasierte Farbcodierung mit echten Child-Details
        const key = `${dep.taskId}->${task.id}-${dep.type}`;
        const childDetails = aggregationResult.childDetails.get(key) || [];
        const color = this.getAggregatedDependencyColor(dep.taskId, task.id, dep.type, childDetails);
        
        const ganttLink = { 
          link: task.id, 
          type: this.mapDependencyType(dep.type),
          color: color // ROT für blockiert, GRAU für OK
        };
        blockingItem.links.push(ganttLink);
      } 
    }
    
    // Ausgehende Dependencies verarbeiten: Parent → dependencyTaskId
    for (const dep of aggregationResult.outgoing) {
      const targetItem = this.itemById.get(dep.taskId);
      if (targetItem) {
        if (!parentItem.links) {
          parentItem.links = [];
        }
        // Intelligent blockierungsbasierte Farbcodierung mit echten Child-Details
        const key = `${task.id}->${dep.taskId}-${dep.type}`;
        const childDetails = aggregationResult.childDetails.get(key) || [];
        const color = this.getAggregatedDependencyColor(task.id, dep.taskId, dep.type, childDetails);
        
        const ganttLink = { 
          link: dep.taskId, 
          type: this.mapDependencyType(dep.type),
          color: color // ROT für blockiert, GRAU für OK
        };
        parentItem.links.push(ganttLink);
      }
    }
  }

  /**
   * Removes aggregated dependencies for a single expanded task.
   * WICHTIG: Prüft ob Dependencies auch direkt existieren - entfernt nur rein aggregierte Links!
   * 
   * Edge Case: Wenn a1 → B (direkt) UND a1 → b1 (aggregiert zu A → B) existiert,
   * darf beim Aufklappen von B nur die aggregierte Verbindung entfernt werden.
   */
  private removeAggregatedDependenciesForTask(task: Task, parentItem: GanttItem): void {
    const aggregationResult = this.collectChildDependenciesOptimized(task);
    
    // Eingehende Dependencies entfernen: dependencyTaskId → Parent
    for (const dep of aggregationResult.incoming) {
      const blockingItem = this.itemById.get(dep.taskId);
      if (blockingItem && blockingItem.links) {
        blockingItem.links = blockingItem.links.filter(link => {
          const linkTargetId = typeof link === 'string' ? link : link.link;
          const linkType = typeof link === 'string' ? DependencyType.FS : this.mapGanttLinkType(link.type);
          
          // Nur entfernen wenn es der Link ist UND keine direkte Dependency existiert
          if (linkTargetId === task.id && linkType === dep.type) {
            return this.hasDirectDependency(dep.taskId, task.id, dep.type);
          }
          return true; // Andere Links behalten
        });
      }
    }
    
    // Ausgehende Dependencies entfernen: Parent → dependencyTaskId  
    if (parentItem.links) {
      for (const dep of aggregationResult.outgoing) {
        parentItem.links = parentItem.links.filter(link => {
          const linkTargetId = typeof link === 'string' ? link : link.link;
          const linkType = typeof link === 'string' ? DependencyType.FS : this.mapGanttLinkType(link.type);
          
          // Nur entfernen wenn es der Link ist UND keine direkte Dependency existiert
          if (linkTargetId === dep.taskId && linkType === dep.type) {
            return this.hasDirectDependency(task.id, dep.taskId, dep.type);
          }
          return true; // Andere Links behalten
        });
      }
    }
  }

  /**
   * Prüft ob eine direkte Dependency zwischen zwei Tasks existiert (nicht nur aggregiert).
   * Verwendet DependencyCache für O(1) Lookup.
   * 
   * @param sourceId ID des Source-Tasks
   * @param targetId ID des Target-Tasks  
   * @param type Dependency-Type
   * @returns true wenn direkte Dependency existiert, false wenn nur aggregiert
   */
  private hasDirectDependency(sourceId: string, targetId: string, type: DependencyType): boolean {
    // Direkte Cache-Abfrage: Prüfe ob targetTask eine direkte Dependency zu sourceTask hat
    const dependencies = this.dependencyCache.getDependencies(targetId);
    return dependencies.some(dep => dep.taskId === sourceId && dep.type === type);
  }

  /**
   * Prüft ob eine Dependency zwischen zwei Tasks eine Blockierung verursacht.
   * Verwendet computedStart/computedEnd für exakte Datumsvergleiche.
   * 
   * @param sourceTask Der blockierende Task (Predecessor)
   * @param targetTask Der blockierte Task (Successor)
   * @param dependencyType Der Dependency-Typ (FS, FF, SS, SF)
   * @returns true wenn Blockierung vorliegt, false wenn ok
   */
  private isDependencyBlocked(sourceTask: Task, targetTask: Task, dependencyType: DependencyType): boolean {
    // Fehlende Daten -> ROT (unsicher = blockiert)
    if (!sourceTask.computedStart || !sourceTask.computedEnd || 
        !targetTask.computedStart || !targetTask.computedEnd) {
      return true;
    }
    
    const sourceStart = sourceTask.computedStart.getTime();
    const sourceEnd = sourceTask.computedEnd.getTime();
    const targetStart = targetTask.computedStart.getTime();
    const targetEnd = targetTask.computedEnd.getTime();
    
    switch (dependencyType) {
      case DependencyType.FS: // Finish-to-Start
        return sourceEnd > targetStart; // Source muss vor Target enden
        
      case DependencyType.FF: // Finish-to-Finish
        return sourceEnd > targetEnd; // Source muss vor oder gleichzeitig mit Target enden
        
      case DependencyType.SS: // Start-to-Start
        return sourceStart > targetStart; // Source muss vor oder gleichzeitig mit Target starten
        
      case DependencyType.SF: // Start-to-Finish
        return sourceStart > targetEnd; // Source muss vor Target-Ende starten
        
      default:
        return true; // Unbekannter Typ -> ROT
    }
  }

  /**
   * Bestimmt die Farbe für eine aggregierte Dependency basierend auf Blockierungen.
   * 
   * @param sourceTaskId ID des Source-Tasks
   * @param targetTaskId ID des Target-Tasks
   * @param dependencyType Der Dependency-Typ
   * @param childDependencies Array aller Child-Dependencies die diese Aggregation repräsentiert
   * @returns '#FF7575' für blockiert (ROT), '#cacaca' für ok (GRAU)
   */
  private getAggregatedDependencyColor(sourceTaskId: string, targetTaskId: string, dependencyType: DependencyType, childDependencies: Array<{sourceId: string, targetId: string, type: DependencyType}>): string {
    const sourceTask = this.getTaskById(sourceTaskId);
    const targetTask = this.getTaskById(targetTaskId);
    
    if (!sourceTask || !targetTask) {
      return '#FF7575'; // ROT bei fehlenden Tasks
    }
    
    // Fallback: Wenn keine Child-Dependencies übergeben wurden, prüfe aggregierte Dependency direkt
    if (childDependencies.length === 0) {
      return this.isDependencyBlocked(sourceTask, targetTask, dependencyType) ? '#FF7575' : '#cacaca';
    }
    
    // Prüfe alle Child-Dependencies auf Blockierungen
    for (const childDep of childDependencies) {
      const childSource = this.getTaskById(childDep.sourceId);
      const childTarget = this.getTaskById(childDep.targetId);
      
      if (childSource && childTarget) {
        if (this.isDependencyBlocked(childSource, childTarget, childDep.type)) {
          return '#FF7575'; // ROT - mindestens eine Child-Dependency ist blockiert
        }
      } else {
        return '#FF7575'; // ROT bei fehlenden Child-Tasks
      }
    }
    
    return '#cacaca'; // GRAU - alle Child-Dependencies sind ok
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

      // Direkte Mutation der originalen Task-Daten
      task.start = this.toDate($event.item.start);
      task.end = this.toDate($event.item.end);
      task.computedStart = this.toDate($event.item.start);
      task.computedEnd = this.toDate($event.item.end);
      
      console.log(`Task ${task.id} dragged: ${task.start} - ${task.end}`);
      
      // CRITICAL: Aktualisiere aggregierte Dependencies nach Task-Verschiebung
      console.log(`🔍 [DEBUG] Calling refreshAggregatedDependencies for task: ${task.id}`);
      this.refreshAggregatedDependencies(task);
      
      // Benachrichtige Parent über Änderung
      this.dataChanged.emit('task-updated');
    }
  }
  /**
   * Aktualisiert alle betroffenen aggregierten Dependencies nach einer Task-Änderung.
   * Wird verwendet nach: Task-Verschiebung, Task-Edit, oder anderen Zeitraum-Änderungen.
   * Findet alle eingeklappten Parents die von der Änderung betroffen sind und aktualisiert deren Farben.
   * 
   * @param changedTask Der veränderte Task
   */
  private refreshAggregatedDependencies(changedTask: Task): void {
    const startTime = performance.now();
    let updatedParents = 0;
    
    console.log(`🔄 [DEPENDENCY REFRESH] Starting refresh for task: ${changedTask.id}`);
    
    try {
      // 1. Finde alle eingeklappten Parent-Tasks die von diesem Task betroffen sind
      // Das schließt ein: Parents des Tasks UND Parents von Tasks die Dependencies zu/von diesem Task haben
      const affectedParents = this.findAllAffectedCollapsedParents(changedTask.id);
      console.log(`🔄 [DEPENDENCY REFRESH] Found ${affectedParents.length} affected parents:`, affectedParents);
      
      // 2. Aktualisiere aggregierte Dependencies für alle betroffenen Parents
      for (const parentId of affectedParents) {
        const parentTask = this.getTaskById(parentId);
        const parentItem = this.itemById.get(parentId);
        
        if (parentTask && parentItem) {
          console.log(`🔄 [DEPENDENCY REFRESH] Updating parent: ${parentId}`);
          
          // Entferne alte aggregierte Dependencies
          this.removeAggregatedDependenciesForTask(parentTask, parentItem);
          
          // Füge neue aggregierte Dependencies mit aktualisierten Farben hinzu
          this.addAggregatedDependenciesForTask(parentTask, parentItem);
          
          updatedParents++;
        }
      }
      
      // 3. Force UI update wenn Dependencies aktualisiert wurden
      if (updatedParents > 0) {
        this.forceChartRefresh();
        console.log(`🔄 [DEPENDENCY REFRESH] Forced UI update`);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      console.log(`🔄 [DEPENDENCY REFRESH] Completed refresh - ${duration.toFixed(2)}ms`, {
        changedTask: changedTask.id,
        affectedParents: updatedParents
      });
      
    } catch (error) {
      console.warn(`🚨 [DEPENDENCY REFRESH] Error refreshing dependencies for ${changedTask.id}:`, error);
      // Graceful fallback: Full update if incremental update fails
      console.log(`🚨 [DEPENDENCY REFRESH] Falling back to full updateGanttItems()`);
      this.updateGanttItems();
    }
  }

  /**
   * Findet ALLE eingeklappten Parent-Tasks die von einer Task-Änderung betroffen sind.
   * Das schließt ein:
   * 1. Direkte Parents des geänderten Tasks
   * 2. Parents von Tasks die Dependencies ZU dem geänderten Task haben  
   * 3. Parents von Tasks die Dependencies VOM geänderten Task haben
   * 
   * @param taskId Die ID des geänderten Tasks
   * @returns Array von Parent-Task-IDs die eingeklappt sind und betroffen sind
   */
  private findAllAffectedCollapsedParents(taskId: string): string[] {
    const affectedParents = new Set<string>();
    
    console.log(`🔍 [PARENT SEARCH] Searching affected parents for task: ${taskId}`);
    
    // 1. Direkte Parents des geänderten Tasks
    const directParents = this.findAffectedCollapsedParents(taskId);
    directParents.forEach(p => affectedParents.add(p));
    console.log(`🔍 [PARENT SEARCH] Direct parents: ${directParents.length}`, directParents);
    
    // 2. Parents von Tasks die Dependencies ZU dem geänderten Task haben (incoming)
    const incomingDeps = this.dependencyCache.getDependencies(taskId);
    for (const dep of incomingDeps) {
      const sourceParents = this.findAffectedCollapsedParents(dep.taskId);
      sourceParents.forEach(p => affectedParents.add(p));
    }
    console.log(`🔍 [PARENT SEARCH] Incoming dependency sources: ${incomingDeps.length}`, incomingDeps.map(d => d.taskId));
    
    // 3. Parents von Tasks die Dependencies VOM geänderten Task haben (outgoing)  
    const outgoingDeps = this.dependencyCache.getDependents(taskId);
    for (const dep of outgoingDeps) {
      const targetParents = this.findAffectedCollapsedParents(dep.taskId);
      targetParents.forEach(p => affectedParents.add(p));
    }
    console.log(`🔍 [PARENT SEARCH] Outgoing dependency targets: ${outgoingDeps.length}`, outgoingDeps.map(d => d.taskId));
    
    const result = Array.from(affectedParents);
    console.log(`🔍 [PARENT SEARCH] Total unique affected parents: ${result.length}`, result);
    return result;
  }

  /**
   * Findet alle eingeklappten Parent-Tasks die den gegebenen Task als Child haben (direkt oder indirekt).
   * 
   * @param taskId Die ID des Tasks für den eingeklappte Parents gesucht werden
   * @returns Array von Parent-Task-IDs die eingeklappt sind und den Task enthalten
   */
  private findAffectedCollapsedParents(taskId: string): string[] {
    const affectedParents: string[] = [];
    let currentId: string | undefined = taskId;
    
    // Aufwärts durch die Parent-Hierarchie gehen
    while (currentId) {
      const parentId = this.parentByChildId.get(currentId);
      if (!parentId) {
        break; // Kein Parent mehr gefunden
      }
      
      // Prüfen ob dieser Parent eingeklappt ist
      const parentItem = this.itemById.get(parentId);
      if (parentItem && parentItem.children && parentItem.children.length > 0 && !parentItem.expanded) {
        affectedParents.push(parentId);
      }
      
      currentId = parentId; // Weiter nach oben gehen
    }
    
    return affectedParents;
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
      this.dataChanged.emit('task-moved-to-subtask');
    } else if ($event.targetParent && $event.targetParent.id) {
      this.handleSubTaskCreation(taskToMove, $event.targetParent.id, $event.target.id, $event.dropPosition);
      this.dataChanged.emit('task-moved-to-subtask');
    } else {
      // Normales Drag & Drop ohne Sub-Task-Erstellung
      this.handleNormalDragDrop(taskToMove, $event);
      this.dataChanged.emit('task-reordered');
    }

    // UI aktualisieren
    this.updateGanttItems();
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
    
    // Status-Änderung ist bereits validiert und erlaubt
    console.log(`Status changed for task ${task.id}: ${task.status}`);
    this.dataChanged.emit('task-status-updated');
  }

  onValidationError(message: string) {
    this.toastService.showError('Validierung fehlgeschlagen', message);
  }

  onTaskDeleted(item: GanttItem) {
    if (item.origin instanceof Task) {
      const task = item.origin;
      
      // Task löschen über zentrale Methode
      if (this.deleteTaskById(task.id)) {
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
      // Optimierte Version: O(1) Group-Lookup
      const taskIds = this.tasksByGroupId.get(group.id) || [];
      const taskCount = taskIds.length;
      
      taskIds.forEach(taskId => {
        this.deleteTaskById(taskId);
      });
      
      // Gruppe aus Groups-Array und Maps entfernen
      const groupIndex = this.groups.findIndex(g => g.id === group.id);
      if (groupIndex !== -1) {
        this.groups.splice(groupIndex, 1);
        // Group Maps aktualisieren
        this.groupById.delete(group.id);
        this.tasksByGroupId.delete(group.id);
      }

      // TODO Not really performant, but necessary at the moment: Rerender whole component after deletion
      this.updateGanttItems();

      // Benachrichtige Parent über Löschung (einmal für die ganze Gruppe)
      this.dataChanged.emit('group-deleted');
      
      this.toastService.showSuccess('Gruppe gelöscht', 
        `Gruppe "${group.title}" und ${taskCount} Tasks wurden gelöscht.`);
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
        console.log('Group updated via modal:', updatedGroup);
        this.toastService.showSuccess('Gruppe aktualisiert', `Gruppe "${updatedGroup.title}" wurde erfolgreich aktualisiert.`);
        this.dataChanged.emit('group-updated');
      }
    }).catch(err => {
      console.log('Group edit modal dismissed');
    });
  }

  onProgressChange(item: GanttItem): void {
    // Kein explizites dataChanged hier, da das bereits debounced in der Komponente gemacht wird
    if (item.origin instanceof Task) {
      item.progress = item.origin.progress;
    }
    else {
      console.warn('Item\'s origin is not a Task instance:', item.origin);
    }
    this.dataChanged.emit('task-progress-updated');
  }

  private startTaskEditDialog(task: Task) {
    const modalRef = this.modalService.open(TaskEditModalComponent, { size: 'xl' });
    modalRef.componentInstance.task = task;
    modalRef.componentInstance.tasks = this.tasks;
    modalRef.componentInstance.groups = this.groups;
    
    modalRef.result.then((updatedTask: Task) => {
      if (updatedTask) {
        console.log('Task updated via modal:', updatedTask);

        const item = this.itemById.get(updatedTask.id);
        if (item) {
          item.title = updatedTask.title;
          item.start = updatedTask.start;
          item.end = updatedTask.end;
          item.progress = updatedTask.progress;
          
          // Update dependencies using the shared dependency service
          const changeSet = this.dependencyCache.updateTaskDependencies(updatedTask.id, updatedTask.dependencies);
          this.applyDependencyChangesToGanttItems(changeSet);
          
          // CRITICAL: Aktualisiere aggregierte Dependencies nach Task-Edit
          console.log(`🔍 [DEBUG] Calling refreshAggregatedDependencies after task edit: ${updatedTask.id}`);
          this.refreshAggregatedDependencies(updatedTask);

          // TODO aggregation
          // TODO update filter?
          
          this.dataChanged.emit('task-updated');
        }
      }
    }).catch(err => {
      console.log('Task edit modal dismissed');
    });
  }

   updateGanttItems() {
    const startTime = performance.now();
    console.log("🟡 [GANTTICUS PERF] START updateGanttItems", {
      tasksCount: this.tasks.length,
      groupsCount: this.groups.length,
      filteredTasksCount: this.filteredTasks.length
    });
    
    // Performance-optimierte Lookup-Maps aufbauen
    this.buildLookupMaps();
    
    // itemById Map zurücksetzen - wird neu aufgebaut
    this.itemById.clear();
    this.items = [];
    this.ganttGroups = [];

    let childTaskIds = new Set<string>();
    let requiresDefaultGroup = false;
    
    // Lokaler Cache nur für diese Berechnung
    const computedPropertiesCache = new Map<string, boolean>();
    
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

    // Aggregierte Dependencies für eingeklappte Parent-Tasks hinzufügen
    this.addAggregatedDependencies();

    this.groups.forEach( g => {
      // Optimierte Version: O(1) Group-Lookups
      const allTaskIdsInGroup = this.tasksByGroupId.get(g.id) || [];
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
    if (this.groups.length > 0) {
      // Prüfe ob Default-Gruppe Tasks hat (alle Tasks ohne Gruppe oder mit null/undefined Gruppe)
      const allDefaultGroupTasks = this.tasks.filter(task => !task.group || task.group === Group.DEFAULT_GROUP_ID);
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
    console.log(this.groups);

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

    // Dependency-Aggregation: Sammelt alle Dependencies der Sub-Tasks und fügt sie dem Parent hinzu
    // Wird nur aufgerufen, wenn der Parent eingeklappt ist (!item.expanded)
    this.addAggregatedDependencies();
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    const color = duration > 100 ? '🔴' : duration > 50 ? '🟠' : '🟢';
    console.log(`${color} [GANTTICUS PERF] END   updateGanttItems - ${duration.toFixed(2)}ms`, {
      finalItemsCount: this.items.length,
      finalGroupsCount: this.ganttGroups.length,
      processedTasksCount: this.filteredTasks.length
    });
  }

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
   * High-performance dependency aggregation using DependencyCache for O(1) lookups.
   * Only processes collapsed parent tasks and uses cached dependency relationships.
   * 
   * Performance: O(n) where n = number of collapsed parents (vs. previous O(n²))
   * Memory: Minimal - reuses existing cache, no additional data structures
   */
  private addAggregatedDependencies(): void {
    const startTime = performance.now();
    let processedParents = 0;
    let totalAggregatedDeps = 0;
    
    try {
      for (const task of this.filteredTasks) {
        const parentItem = this.itemById.get(task.id);
        
        // Nur für Parent-Tasks mit Children, die eingeklappt sind
        if (parentItem && task.children && task.children.length > 0 && !parentItem.expanded) {
          processedParents++;
          
          // Verwende optimierte Cache-basierte Aggregation
          const aggregationResult = this.collectChildDependenciesOptimized(task);
          const totalDeps = aggregationResult.incoming.length + aggregationResult.outgoing.length;
          totalAggregatedDeps += totalDeps;
          
          if (totalDeps > 0) {
            // Eingehende Dependencies verarbeiten: dependencyTaskId → Parent
            for (const dep of aggregationResult.incoming) {
              const blockingItem = this.itemById.get(dep.taskId);
              if (blockingItem) {
                if (!blockingItem.links) {
                  blockingItem.links = [];
                }
                // Intelligent blockierungsbasierte Farbcodierung mit echten Child-Details
                const key = `${dep.taskId}->${task.id}-${dep.type}`;
                const childDetails = aggregationResult.childDetails.get(key) || [];
                const color = this.getAggregatedDependencyColor(dep.taskId, task.id, dep.type, childDetails);
                
                const ganttLink = { 
                  link: task.id, 
                  type: this.mapDependencyType(dep.type),
                  color: color // ROT für blockiert, GRAU für OK
                };
                blockingItem.links.push(ganttLink);
              } 
            }
            
            // Ausgehende Dependencies verarbeiten: Parent → dependencyTaskId
            for (const dep of aggregationResult.outgoing) {
              const targetItem = this.itemById.get(dep.taskId);
              if (targetItem) {
                if (!parentItem.links) {
                  parentItem.links = [];
                }
                // Intelligent blockierungsbasierte Farbcodierung mit echten Child-Details
                const key = `${task.id}->${dep.taskId}-${dep.type}`;
                const childDetails = aggregationResult.childDetails.get(key) || [];
                const color = this.getAggregatedDependencyColor(task.id, dep.taskId, dep.type, childDetails);
                
                const ganttLink = { 
                  link: dep.taskId, 
                  type: this.mapDependencyType(dep.type),
                  color: color // ROT für blockiert, GRAU für OK
                };
                parentItem.links.push(ganttLink);
              }
            }
          }
        }
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      const color = duration > 50 ? '🔴' : duration > 20 ? '🟠' : '🟢';
      console.log(`${color} [DEPENDENCY AGGREGATION] Completed - ${duration.toFixed(2)}ms`, {
        processedParents,
        totalAggregatedDeps,
        avgDepsPerParent: processedParents > 0 ? (totalAggregatedDeps / processedParents).toFixed(1) : 0
      });
      
    } catch (error) {
      console.warn('🚨 [DEPENDENCY AGGREGATION] Error during aggregation, falling back to empty dependencies:', error);
      // Graceful degradation: Continue without aggregated dependencies rather than breaking the UI
    }
  }

  /**
   * HIGH-PERFORMANCE VERSION: Sammelt rekursiv alle Dependencies aller Child-Tasks
   * unter Verwendung des DependencyCache für O(1) Lookups statt O(n²) Task-Iteration.
   * 
   * Performance: O(k) wo k = Anzahl der direkten und indirekten Children
   * Memory: O(1) zusätzlicher Speicher (wiederverwendet Cache)
   * 
   * @param parentTask Der Parent-Task dessen Child-Dependencies aggregiert werden sollen
   * @returns Aggregierte eingehende und ausgehende Dependencies mit Child-Details
   */
  private collectChildDependenciesOptimized(parentTask: Task): { 
    incoming: Dependency[], 
    outgoing: Dependency[],
    childDetails: Map<string, Array<{sourceId: string, targetId: string, type: DependencyType}>>
  } {
    const debugEnabled = false; // Set to true for detailed debugging
    const visited = new Set<string>();
    const incomingDependencies: Dependency[] = [];
    const outgoingDependencies: Dependency[] = [];
    const childDetails = new Map<string, Array<{sourceId: string, targetId: string, type: DependencyType}>>();
    
    if (debugEnabled) {
      console.log(`🔍 [DEPENDENCY AGGREGATION] Starting aggregation for parent: ${parentTask.id}`);
    }
    
    try {
      this.collectChildDependenciesRecursive(parentTask, visited, incomingDependencies, outgoingDependencies, childDetails, debugEnabled);
      
      if (debugEnabled) {
        console.log(`🔍 [DEPENDENCY AGGREGATION] Completed for ${parentTask.id}:`, {
          incomingCount: incomingDependencies.length,
          outgoingCount: outgoingDependencies.length,
          childrenProcessed: visited.size
        });
      }
      
      return { incoming: incomingDependencies, outgoing: outgoingDependencies, childDetails };
      
    } catch (error) {
      console.warn(`🚨 [DEPENDENCY AGGREGATION] Error processing ${parentTask.id}, returning empty dependencies:`, error);
      // Graceful degradation: Return empty arrays instead of breaking
      return { incoming: [], outgoing: [], childDetails: new Map() };
    }
  }

  /**
   * Rekursive Hilfsmethode für optimierte Dependency-Sammlung.
   * Nutzt DependencyCache für O(1) Lookups statt Task-Array-Iteration.
   */
  private collectChildDependenciesRecursive(
    parentTask: Task, 
    visited: Set<string>, 
    incomingDependencies: Dependency[], 
    outgoingDependencies: Dependency[],
    childDetails: Map<string, Array<{sourceId: string, targetId: string, type: DependencyType}>>,
    debugEnabled: boolean
  ): void {
    if (visited.has(parentTask.id) || !parentTask.children) {
      return;
    }
    
    visited.add(parentTask.id);
    
    for (const childId of parentTask.children) {
      const childTask = this.getTaskById(childId);
      if (!childTask) {
        if (debugEnabled) {
          console.warn(`🚨 [DEPENDENCY AGGREGATION] Child task not found: ${childId}`);
        }
        continue;
      }
      
      // 1. INCOMING: Verwende DependencyCache für O(1) Lookup der eingehenden Dependencies
      const incomingFromCache = this.dependencyCache.getDependencies(childTask.id);
      for (const cachedDep of incomingFromCache) {
        // Cross-hierarchy dependencies: Prüfe ob die Quelle zu einem ANDEREN eingeklappten Parent gehört
        const sourceParent = this.findCollapsedParentForTask(cachedDep.taskId);
        
        // Self-Dependencies verhindern: A->A macht keinen Sinn
        const effectiveSourceId = sourceParent || cachedDep.taskId;
        
        // Nur externe Dependencies hinzufügen (keine interne Hierarchie-Dependencies oder Self-Dependencies)
        if (sourceParent !== parentTask.id && // Nicht aus der eigenen Hierarchie
            effectiveSourceId !== parentTask.id && // Keine Self-Dependencies (A->A)
            !incomingDependencies.some(existing => 
              existing.taskId === effectiveSourceId && existing.type === cachedDep.type)) {
          
          const dep = new Dependency();
          // Verwende den eingeklappten Parent als Quelle, falls vorhanden
          dep.taskId = effectiveSourceId;
          dep.type = cachedDep.type;
          incomingDependencies.push(dep);
          
          // Child-Details für diese aggregierte Dependency sammeln
          const key = `${effectiveSourceId}->${parentTask.id}-${cachedDep.type}`;
          if (!childDetails.has(key)) {
            childDetails.set(key, []);
          }
          childDetails.get(key)!.push({
            sourceId: cachedDep.taskId,
            targetId: childTask.id,
            type: cachedDep.type
          });
          
          if (debugEnabled) {
            const sourceDisplay = sourceParent ? `${sourceParent}(${cachedDep.taskId})` : cachedDep.taskId;
            console.log(`🔍 [INCOMING] ${sourceDisplay} -${cachedDep.type}-> ${parentTask.id}(${childTask.id})`);
          }
        } else if (debugEnabled && effectiveSourceId === parentTask.id) {
          console.log(`🚫 [INCOMING] Skipped self-dependency: ${parentTask.id}(${cachedDep.taskId}) -${cachedDep.type}-> ${parentTask.id}(${childTask.id})`);
        }
      }
      
      // 2. OUTGOING: Verwende DependencyCache für O(1) Lookup der ausgehenden Dependencies  
      const outgoingFromCache = this.dependencyCache.getDependents(childTask.id);
      for (const cachedDep of outgoingFromCache) {
        // Cross-hierarchy dependencies: Prüfe ob das Ziel zu einem ANDEREN eingeklappten Parent gehört
        const targetParent = this.findCollapsedParentForTask(cachedDep.taskId);
        
        // Self-Dependencies verhindern: A->A macht keinen Sinn
        const effectiveTargetId = targetParent || cachedDep.taskId;
        
        // Nur externe Dependencies hinzufügen (keine interne Hierarchie-Dependencies oder Self-Dependencies)
        if (targetParent !== parentTask.id && // Nicht zur eigenen Hierarchie
            effectiveTargetId !== parentTask.id && // Keine Self-Dependencies (A->A)
            !outgoingDependencies.some(existing => 
              existing.taskId === effectiveTargetId && existing.type === cachedDep.type)) {
          
          const dep = new Dependency();
          // Verwende den eingeklappten Parent als Ziel, falls vorhanden
          dep.taskId = effectiveTargetId;
          dep.type = cachedDep.type;
          outgoingDependencies.push(dep);
          
          // Child-Details für diese aggregierte Dependency sammeln
          const key = `${parentTask.id}->${effectiveTargetId}-${cachedDep.type}`;
          if (!childDetails.has(key)) {
            childDetails.set(key, []);
          }
          childDetails.get(key)!.push({
            sourceId: childTask.id,
            targetId: cachedDep.taskId,
            type: cachedDep.type
          });
          
          if (debugEnabled) {
            const targetDisplay = targetParent ? `${targetParent}(${cachedDep.taskId})` : cachedDep.taskId;
            console.log(`🔍 [OUTGOING] ${parentTask.id}(${childTask.id}) -${cachedDep.type}-> ${targetDisplay}`);
          }
        } else if (debugEnabled && effectiveTargetId === parentTask.id) {
          console.log(`🚫 [OUTGOING] Skipped self-dependency: ${parentTask.id}(${childTask.id}) -${cachedDep.type}-> ${parentTask.id}(${cachedDep.taskId})`);
        }
      }
      
      // 3. RECURSIVE: Für Sub-Children
      if (childTask.children && childTask.children.length > 0) {
        this.collectChildDependenciesRecursive(childTask, visited, incomingDependencies, outgoingDependencies, childDetails, debugEnabled);
      }
    }
  }

  /**
   * Hilfsmethode: Prüft ob eine Task-ID innerhalb einer bestimmten Parent-Hierarchie liegt.
   * Verwendet Performance-optimierte Parent-Lookup-Maps.
   */
  private isTaskInHierarchy(taskId: string, parentId: string): boolean {
    let currentId: string | undefined = taskId;
    
    // Aufwärts durch die Parent-Kette gehen
    while (currentId) {
      if (currentId === parentId) {
        return true; // Task ist innerhalb der Hierarchie
      }
      currentId = this.parentByChildId.get(currentId);
    }
    
    return false; // Task ist außerhalb der Hierarchie
  }

  /**
   * Findet den eingeklappten Parent-Task für eine gegebene Task-ID.
   * Geht die Parent-Hierarchie nach oben und gibt den ersten eingeklappten Parent zurück.
   * 
   * @param taskId Die Task-ID für die der eingeklappte Parent gesucht wird
   * @returns Parent-Task-ID falls eingeklappt, undefined falls kein eingeklappter Parent gefunden
   */
  private findCollapsedParentForTask(taskId: string): string | undefined {
    let currentId: string | undefined = taskId;
    
    // Aufwärts durch die Parent-Kette gehen
    while (currentId) {
      const parentId = this.parentByChildId.get(currentId);
      if (!parentId) {
        break; // Kein Parent mehr gefunden
      }
      
      // Prüfen ob dieser Parent eingeklappt ist
      const parentItem = this.itemById.get(parentId);
      if (parentItem && parentItem.children && parentItem.children.length > 0 && !parentItem.expanded) {
        return parentId; // Eingeklappter Parent gefunden
      }
      
      currentId = parentId; // Weiter nach oben gehen
    }
    
    return undefined; // Kein eingeklappter Parent gefunden
  }

  /**
   * Baut alle Performance-optimierten Lookup-Maps auf
   * Muss nach jeder Änderung der Tasks- oder Groups-Liste aufgerufen werden
   */
  private buildLookupMaps(): void {
    const startTime = performance.now();
    
    // Task Maps
    this.taskById.clear();
    this.childrenByParentId.clear();
    this.parentByChildId.clear();
    
    for (const task of this.tasks) {
      this.taskById.set(task.id, task);
      
      // Parent-Child-Beziehungen in Maps speichern
      if (task.children && task.children.length > 0) {
        this.childrenByParentId.set(task.id, [...task.children]);
        task.children.forEach(childId => {
          this.parentByChildId.set(childId, task.id);
        });
      }
    }
    
    // Group Maps
    this.groupById.clear();
    this.tasksByGroupId.clear();
    
    for (const group of this.groups) {
      this.groupById.set(group.id, group);
    }
    
    // Tasks nach Gruppen organisieren
    for (const task of this.tasks) {
      const groupId = task.group || Group.DEFAULT_GROUP_ID;
      
      if (!this.tasksByGroupId.has(groupId)) {
        this.tasksByGroupId.set(groupId, []);
      }
      this.tasksByGroupId.get(groupId)!.push(task.id);
    }
    
    // Dependency cache is now managed centrally by DependencyService
    // Cache rebuild is handled by AppComponent
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Debug-Logs für Cache-Validierung
    const cacheStats = this.dependencyCache.getStats();
    console.log(`🔧 [GANTT MAPS] buildLookupMaps completed - ${duration.toFixed(2)}ms`, {
      tasks: this.tasks.length,
      groups: this.groups.length,
      dependencies: cacheStats.totalDependencies,
      tasksWithDeps: cacheStats.tasksWithDependencies,
      tasksWithDependents: cacheStats.tasksWithDependents
    });
  }

  /**
   * Löscht einen Task aus dem Array und allen Performance-Maps
   * @param taskId - ID des zu löschenden Tasks
   * @returns true wenn Task gefunden und gelöscht wurde, false sonst
   */
  private deleteTaskById(taskId: string): boolean {
    const taskIndex = this.tasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
      // Task aus Array entfernen
      this.tasks.splice(taskIndex, 1);
      
      // Task aus allen Maps entfernen
      this.taskById.delete(taskId);
      this.itemById.delete(taskId);
      
      // Parent-Child-Beziehungen aufräumen
      const parentId = this.parentByChildId.get(taskId);
      if (parentId) {
        // Aus Parent entfernen
        this.removeTaskFromParent(taskId);
      }
      
      // Children zu Top-Level machen (falls vorhanden)
      const children = this.childrenByParentId.get(taskId);
      if (children) {
        children.forEach(childId => {
          this.parentByChildId.delete(childId);
          // Children bleiben ohne Gruppen-Änderung - wie bisher
        });
        this.childrenByParentId.delete(taskId);
      }
      
      // Dependencies in anderen Tasks entfernen
      this.tasks.forEach(t => {
        t.dependencies = t.dependencies.filter(d => d.taskId !== taskId);
      });
      
      // DependencyService über Task-Löschung informieren
      this.dependencyCache.removeTask(taskId);
      
      return true;
    }
    return false;
  }

  private getTaskById(id: string): Task | undefined {
    // Optimierte Version: O(1) statt O(n)
    return this.taskById.get(id);
  }

  getGroupById(id: string) : Group | undefined{
    // Optimierte Version: O(1) statt O(n)
    return this.groupById.get(id);
  }

  private removeTaskFromParent(taskId: string) {
    // Optimierte Version: O(1) statt O(n×m)
    const parentId = this.parentByChildId.get(taskId);
    if (parentId) {
      const parentTask = this.taskById.get(parentId);
      if (parentTask && parentTask.children) {
        // Aus dem Parent-Task Array entfernen
        parentTask.children = parentTask.children.filter(childId => childId !== taskId);
        
        // Maps aktualisieren
        this.parentByChildId.delete(taskId);
        this.childrenByParentId.set(parentId, [...parentTask.children]);
      }
    }
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

    // Maps aktualisieren - neue Parent-Child-Beziehung
    this.parentByChildId.set(taskToMove.id, parentId);
    this.childrenByParentId.set(parentId, [...parentTask.children]);

    // Gruppe des Sub-Tasks entfernen, da Sub-Tasks keine eigene Gruppe haben
    // Die Gruppenzugehörigkeit wird durch den Parent-Task bestimmt
    taskToMove.group = undefined;

    console.log("Sub-Task erstellt:", taskToMove.id, "→", parentId, "(Gruppe entfernt)");
  }

  private handleNormalDragDrop(taskToMove: Task, $event: GanttTableDragDroppedEvent<unknown>) {
    // Task wurde aus Parent herausgezogen - zu Top-Level machen
    this.removeTaskFromParent(taskToMove.id);

    let targetIndex = this.tasks.findIndex(t => t.id == $event.target.id);
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
    this.tasks.splice(this.tasks.indexOf(taskToMove), 1);
    this.tasks.splice(targetIndex, 0, taskToMove);

    console.log("Task zu Top-Level gemacht:", taskToMove.id);
  }

    // Hilfsmethode: Findet die Gruppe eines Parent-Tasks für einen Sub-Task
    private getParentGroupForTask(taskId: string): Group | undefined {
      // Optimierte Version: O(1) statt O(n×m)
      const parentId = this.parentByChildId.get(taskId);
      if (!parentId) {
        return undefined; // Kein Parent gefunden
      }
      
      const parentTask = this.taskById.get(parentId);
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
}

