import { Injectable } from '@angular/core';
import { Task, Status, Group } from './domain/Task';
import { TaskStructureCache } from './task-structure.cache';
import { DependencyCache, DependencyChangeSet } from './gantt-chart/dependency-cache';
import { UndoRedoService } from './undo-redo.service';
import { Chart } from './domain/Chart';
import { ChartProvider } from './chart.provider';

/**
 * Repräsentiert eine Änderung an einem Task-Property
 */
export interface TaskPropertyChange {
  taskId: string;
  property: 'progress' | 'status' | 'start' | 'end' | 'title';
  oldValue: any;
  newValue: any;
}

/**
 * Repräsentiert eine Task-Änderung mit allen betroffenen Properties
 */
export interface TaskChange {
  taskId: string;
  changes: TaskPropertyChange[];
  task: Task; // Der aktualisierte Task
}

/**
 * ChangeSet das von TaskUpdateService zurückgegeben wird
 * Enthält alle Tasks die aktualisiert wurden (inkl. berechnete Parent-Properties)
 */
export interface TaskUpdateChangeSet {
  /**
   * Array aller Tasks die Änderungen erfahren haben
   */
  updatedTasks: TaskChange[];
  
  /**
   * Array der GanttItem-IDs die in der UI aktualisiert werden müssen
   */
  ganttItemsToUpdate: string[];
  
  /**
   * Optional: Dependency-Änderungen die während des Updates aufgetreten sind
   */
  dependencyChanges?: DependencyChangeSet;
}

/**
 * Request für Task-Property-Update über den Service
 */
export interface TaskUpdateRequest {
  taskId: string;
  changes: Partial<{
    progress: number;
    status: Status;
    start: Date;
    end: Date;
    title: string;
  }>;
}

/**
 * Service-spezifische Datenstruktur für Drag & Drop-Operationen.
 * Ersetzt UI-spezifische GanttTableDragDroppedEvent für saubere Service-API.
 */
export interface DragDropOperation {
  taskToMoveId: string;
  dropPosition: 'inside' | 'before' | 'after';
  targetId: string;
  targetParentId?: string;  // Optional - nur wenn targetParent existiert
}

/**
 * Ergebnis einer Drag & Drop-Operation für UI-Feedback.
 */
export interface DragDropResult {
  success: boolean;
  eventType: 'task-moved-to-subtask' | 'task-reordered';
  operation: 'sub-task-creation' | 'array-reordering';
  errorMessage?: string;
  
  /**
   * Optional: Array aller Tasks die durch die Drag&Drop-Operation aktualisiert wurden
   * (primär betroffene Parent-Tasks mit computeFromChildren)
   */
  updatedTasks?: TaskChange[];
  
  /**
   * Optional: Array der GanttItem-IDs die in der UI aktualisiert werden müssen
   */
  ganttItemsToUpdate?: string[];
}

/**
 * Zentraler Service für Task-Property-Updates und Parent-Propagierung.
 * Übernimmt die Business-Logik für Task-Berechnungen aus der GanttChart-Komponente.
 * 
 * Verantwortlichkeiten:
 * - Task-Properties direkt aktualisieren
 * - Parent-Task-Properties aus Children berechnen (computeFromChildren)
 * - ChangeSet für UI-Updates bereitstellen
 * - Performance: Nur betroffene Tasks aktualisieren
 * - Drag & Drop-Orchestrierung mit kompletter Entscheidungslogik
 */
@Injectable({
  providedIn: 'root'
})
export class TaskUpdateService {
  
  private chartProvider: ChartProvider | null = null;

  constructor(
    private taskStructure: TaskStructureCache,
    private dependencyCache: DependencyCache,
    private undoRedoService: UndoRedoService
  ) { }

  /**
   * Registriert den Chart-Provider für Zugriff auf das aktuelle Chart
   */
  setChartProvider(provider: ChartProvider): void {
    this.chartProvider = provider;
  }

  /**
   * Helper-Methode um das aktuelle Chart zu erhalten
   */
  private getCurrentChart(): Chart {
    if (!this.chartProvider) {
      throw new Error('ChartProvider nicht registriert! Bitte setChartProvider() aufrufen.');
    }
    return this.chartProvider.getChart();
  }

  /**
   * Speichert den aktuellen Chart-Zustand für Undo NACH einer Mutation
   */
  private saveStateAfterMutation(): void {
    if (!this.chartProvider) {
      console.warn('No chartProvider registered - cannot save state for undo.');
      return;
    }
    this.undoRedoService.saveState(this.chartProvider.getChart());
  }

  /**
   * Aktualisiert Task-Properties und propagiert Änderungen zu Parent-Tasks.
   * Verwendet den zentralen TaskStructureCache für alle Lookup-Operationen.
   * 
   * @param request Task-ID und zu ändernde Properties
   * @returns ChangeSet mit allen aktualisierten Tasks und UI-Update-Hinweisen
   */
  updateTaskProperties(request: TaskUpdateRequest): TaskUpdateChangeSet {
    console.log(`🔄 [TASK UPDATE SERVICE] Processing update for task: ${request.taskId}`, request.changes);

    // Target-Task finden und aktualisieren
    const targetTask = this.taskStructure.getTaskById(request.taskId);
    if (!targetTask) {
      console.warn(`🚨 [TASK UPDATE SERVICE] Task not found: ${request.taskId}`);
      return {
        updatedTasks: [],
        ganttItemsToUpdate: []
      };
    }

    const updatedTasks: TaskChange[] = [];
    const ganttItemsToUpdate = new Set<string>();

    // 1. Target-Task direkt aktualisieren
    const directChanges = this.applyDirectChanges(targetTask, request.changes);
    if (directChanges.changes.length > 0) {
      updatedTasks.push(directChanges);
      ganttItemsToUpdate.add(targetTask.id);
      console.log(`🔄 [TASK UPDATE SERVICE] Applied direct changes to task: ${targetTask.id}`, directChanges.changes);
    }

    // 2. Parent-Tasks aktualisieren (rekursiv nach oben)
    const parentUpdates = this.updateAffectedParents([targetTask.id]);
    updatedTasks.push(...parentUpdates);
    parentUpdates.forEach(change => ganttItemsToUpdate.add(change.taskId));

    console.log(`🔄 [TASK UPDATE SERVICE] Completed update`, {
      targetTask: request.taskId,
      updatedTasks: updatedTasks.length,
      ganttItemsToUpdate: ganttItemsToUpdate.size
    });

    return {
      updatedTasks,
      ganttItemsToUpdate: Array.from(ganttItemsToUpdate)
    };
  }

  /**
   * Erstellt einen neuen Task
   * Fügt ihn noch NICHT in die bisherige Struktur.
   * 
   * @param group Optional: Gruppe der der Task zugeordnet werden soll
   * @returns Der erstellte Task
   */
  createTask(group?: string): Task {
    console.log(`🆕 [TASK UPDATE SERVICE] Creating new task`, { group });
    
    // Task-Erstellung (aus onAddTask übernommen)
    const id = this.createId();
    const newTask: Task = new Task();
    newTask.group = group;
    newTask.id = id;
    newTask.title = '';
    newTask.start = new Date();
    newTask.end = new Date();
    newTask.computedStart = newTask.start ? newTask.start : new Date();
    newTask.computedEnd = newTask.end ? newTask.end : new Date();

    console.log(`🆕 [TASK UPDATE SERVICE] Task created: ${id}`);
    
    return newTask;
  }

  addTask(task: Task) : void {
    // Chart über Provider erhalten
    const chart = this.getCurrentChart();
    
    // Task direkt zur Chart-Liste hinzufügen
    chart.tasks.push(task);

    // Cache sofort aktualisieren
    this.taskStructure.taskById.set(task.id, task);
    
    // Group-Zuordnung in Cache aktualisieren (falls Task einer Gruppe zugeordnet ist)
    if (task.group) {
      const groupTasks = this.taskStructure.tasksByGroupId.get(task.group) || [];
      groupTasks.push(task.id);
      this.taskStructure.tasksByGroupId.set(task.group, groupTasks);
    }

    this.dependencyCache.updateTaskDependencies(task.id, task.dependencies);
    console.log(`🆕 [TASK UPDATE SERVICE] Task added: ${task.id}`);
    
    // Automatisches Undo NACH der Mutation
    this.saveStateAfterMutation();
  }

  /**
   * Erstellt eine neue Gruppe und gibt sie zurück.
   * Fügt sie noch NICHT in die bisherige Struktur.
   * 
   * @returns Die erstellte Gruppe
   */
  createGroup(): Group {
    console.log(`🆕 [TASK UPDATE SERVICE] Creating new group`);
    
    // Gruppe-Erstellung (analog zu createTask)
    const id = this.createId();
    const newGroup: Group = new Group();
    newGroup.id = id;
    newGroup.title = '';
    
    console.log(`🆕 [TASK UPDATE SERVICE] Group created: ${id}`);
    
    return newGroup;
  }

    addGroup(group: Group) : void {
    
    // Chart über Provider erhalten
    const chart = this.getCurrentChart();
    
    // Group direkt zur Chart-Liste hinzufügen
    chart.groups.push(group);

    // Cache sofort aktualisieren
    this.taskStructure.groupById.set(group.id, group);
    console.log(`🆕 [TASK UPDATE SERVICE] Group added: ${group.id}`);
    
    // Automatisches Undo NACH der Mutation
    this.saveStateAfterMutation();
  }

  /**
   * Aktualisiert einen bestehenden Task durch Übertragung aller Properties.
   * Behält die Objekt-Referenz bei, um Cache-Konsistenz zu gewährleisten.
   * Propagiert Änderungen zu Parent-Tasks und gibt ChangeSet zurück.
   * 
   * @param updatedTask Der Task mit den neuen Property-Werten
   * @returns ChangeSet mit allen aktualisierten Tasks und UI-Update-Hinweisen
   */
  updateTask(updatedTask: Task): TaskUpdateChangeSet {
    console.log(`🔄 [TASK UPDATE SERVICE] Updating complete task: ${updatedTask.id}`);

    // Bestehenden Task im Cache finden
    const existingTask = this.taskStructure.getTaskById(updatedTask.id);
    if (!existingTask) {
      console.warn(`🚨 [TASK UPDATE SERVICE] Task not found for update: ${updatedTask.id}`);
      return {
        updatedTasks: [],
        ganttItemsToUpdate: []
      };
    }

    const updatedTasks: TaskChange[] = [];
    const ganttItemsToUpdate = new Set<string>();
    let dependencyChanges;

    // 1. Alle Properties vom neuen Task ins bestehende Objekt übertragen
    // Behält die Objekt-Referenz bei → Cache bleibt automatisch konsistent
    const oldValues = { ...existingTask }; // Backup für Change-Tracking
    Object.assign(existingTask, updatedTask);

    // 2. ChangeSet für UI-Updates generieren (vereinfacht - alle Properties als geändert markieren)
    const taskChange: TaskChange = {
      taskId: existingTask.id,
      changes: [], // Wird bei Bedarf erweitert für detailliertes Change-Tracking
      task: existingTask
    };
    updatedTasks.push(taskChange);
    ganttItemsToUpdate.add(existingTask.id);

    // 3. Dependencies aktualisieren über DependencyCache
    // Modal Panel kann Dependencies ändern - diese müssen separat aktualisiert werden
    if (existingTask.dependencies) {
      const dependencyChangeSet = this.dependencyCache.updateTaskDependencies(
        existingTask.id, 
        existingTask.dependencies
      );
      
      if (dependencyChangeSet.addedDependencies.length > 0 || dependencyChangeSet.removedDependencies.length > 0) {
        console.log(`🔗 [TASK UPDATE SERVICE] Updated dependencies for task: ${existingTask.id}`, {
          added: dependencyChangeSet.addedDependencies.length,
          removed: dependencyChangeSet.removedDependencies.length
        });
        
        // Dependency-Änderungen direkt ins ChangeSet aufnehmen
        dependencyChanges = dependencyChangeSet;
      }
    }

    // 4. Group-Zuordnung im Cache aktualisieren falls sich Gruppe geändert hat
    if (oldValues.group !== existingTask.group) {
      // Aus alter Gruppe entfernen
      if (oldValues.group) {
        const oldGroupTasks = this.taskStructure.tasksByGroupId.get(oldValues.group) || [];
        this.taskStructure.tasksByGroupId.set(oldValues.group, 
          oldGroupTasks.filter(taskId => taskId !== existingTask.id)
        );
      }
      
      // Zu neuer Gruppe hinzufügen
      if (existingTask.group) {
        const newGroupTasks = this.taskStructure.tasksByGroupId.get(existingTask.group) || [];
        newGroupTasks.push(existingTask.id);
        this.taskStructure.tasksByGroupId.set(existingTask.group, newGroupTasks);
      }
    }

    // 5. Parent-Tasks aktualisieren (rekursiv nach oben)
    const parentUpdates = this.updateAffectedParents([existingTask.id]);
    updatedTasks.push(...parentUpdates);
    parentUpdates.forEach(change => ganttItemsToUpdate.add(change.taskId));

    console.log(`🔄 [TASK UPDATE SERVICE] Task update completed`, {
      updatedTask: updatedTask.id,
      totalUpdatedTasks: updatedTasks.length,
      ganttItemsToUpdate: ganttItemsToUpdate.size
    });

    // Automatisches Undo NACH der Mutation
    this.saveStateAfterMutation();

    return {
      updatedTasks,
      ganttItemsToUpdate: Array.from(ganttItemsToUpdate),
      dependencyChanges
    };
  }

  /**
   * Aktualisiert eine Group im Datenmodell.
   * Schlanke Implementation ohne komplexe Parent-Propagierung.
   * 
   * @param updatedGroup Die Group mit den neuen Property-Werten
   * @returns TaskUpdateChangeSet mit leeren Arrays (für zukünftige Erweiterungen vorbereitet)
   */
  updateGroup(updatedGroup: Group): TaskUpdateChangeSet {
    console.log(`🔄 [TASK UPDATE SERVICE] Updating group: ${updatedGroup.id}`);

    // Bestehende Group im Cache finden
    const existingGroup = this.taskStructure.getGroupById(updatedGroup.id);
    if (!existingGroup) {
      console.warn(`🚨 [TASK UPDATE SERVICE] Group not found for update: ${updatedGroup.id}`);
      return {
        updatedTasks: [],
        ganttItemsToUpdate: []
      };
    }

    // Alle Properties vom neuen Group-Objekt ins bestehende übertragen
    // Behält die Objekt-Referenz bei → Cache bleibt automatisch konsistent
    Object.assign(existingGroup, updatedGroup);

    console.log(`✅ [TASK UPDATE SERVICE] Group updated successfully: ${updatedGroup.id}`);

    // Automatisches Undo NACH der Mutation
    this.saveStateAfterMutation();

    // Aktuell leeres ChangeSet - bereit für zukünftige Erweiterungen
    return {
      updatedTasks: [],
      ganttItemsToUpdate: []
    };
  }

  /**
   * Erstellt eine eindeutige ID für neue Tasks.
   * Übernommen aus app.component.ts createId() Methode.
   */
  private createId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Löscht einen Task vollständig aus dem System.
   * Bereinigt alle Dependencies, Parent-Child-Beziehungen und Cache-Einträge.
   * 
   * @param taskId ID des zu löschenden Tasks
   * @returns true wenn Task erfolgreich gelöscht wurde, false wenn Task nicht gefunden
   */
  deleteTask(taskId: string): boolean {
    console.log(`🗑️ [TASK UPDATE SERVICE] Deleting task: ${taskId}`);

    // Task finden
    const taskToDelete = this.taskStructure.getTaskById(taskId);
    if (!taskToDelete) {
      console.warn(`🚨 [TASK UPDATE SERVICE] Task not found for deletion: ${taskId}`);
      return false;
    }

    // 1. Task aus dem Chart entfernen
    const chart = this.getCurrentChart();
    const taskIndex = chart.tasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
      chart.tasks.splice(taskIndex, 1);
    }

    // 2. Selektive Cache-Updates (statt kompletter Rebuild)
    this.taskStructure.taskById.delete(taskId);

    // 3. Parent-Child-Beziehungen bereinigen
    this.removeTaskFromParentRelations(taskId);

    // 4. Dependencies in anderen Tasks bereinigen (nach Array-Splice wie in Chart)
    this.taskStructure.getAllTasks().forEach(task => {
      task.dependencies = task.dependencies.filter(dep => dep.taskId !== taskId);
    });
    
    // 5. DependencyService über Task-Löschung informieren
    this.dependencyCache.removeTask(taskId);

    console.log(`🗑️ [TASK UPDATE SERVICE] Task deleted successfully`, {
      deletedTask: taskId
    });

    // Automatisches Undo NACH der Mutation
    this.saveStateAfterMutation();

    return true;
  }

  /**
   * Entfernt einen Task aus allen Parent-Child-Beziehungen.
   * @param taskId ID des zu entfernenden Tasks
   */
  private removeTaskFromParentRelations(taskId: string): void {
    // Parent finden und Task aus dessen children entfernen
    const parentId = this.taskStructure.getParentOfChild(taskId);
    if (parentId) {
      const parentTask = this.taskStructure.getTaskById(parentId);
      if (parentTask && parentTask.children) {
        parentTask.children = parentTask.children.filter(childId => childId !== taskId);
      }
    }

    // Children aus Parent-Child-Maps entfernen (zu Top-Level machen)
    const childrenIds = this.taskStructure.getChildrenOfParent(taskId);
    if (childrenIds.length > 0) {
      childrenIds.forEach(childId => {
        // Child aus parentByChildId Map entfernen (wird zu Top-Level)
        this.taskStructure.parentByChildId.delete(childId);
      });
      // Parent aus childrenByParentId Map entfernen
      this.taskStructure.childrenByParentId.delete(taskId);
    }

    // Task selbst aus Parent-Child-Maps entfernen
    this.taskStructure.parentByChildId.delete(taskId);
  }

  /**
   * Löscht eine Gruppe vollständig aus dem System.
   * Löscht alle Tasks der Gruppe und bereinigt Cache-Einträge.
   * 
   * @param groupId ID der zu löschenden Gruppe
   * @returns Anzahl der gelöschten Tasks oder -1 wenn Gruppe nicht gefunden
   */
  deleteGroup(groupId: string): number {
    console.log(`🗑️ [TASK UPDATE SERVICE] Deleting group: ${groupId}`);

    // Gruppe finden
    const groupToDelete = this.taskStructure.getGroupById(groupId);
    if (!groupToDelete) {
      console.warn(`🚨 [TASK UPDATE SERVICE] Group not found for deletion: ${groupId}`);
      return -1;
    }

    // 1. Alle Tasks der Gruppe finden und löschen
    const taskIdsInGroup = this.taskStructure.getTasksOfGroup(groupId);
    let deletedTaskCount = 0;

    // Tasks einzeln löschen (nutzt bestehende deleteTask-Logik)
    taskIdsInGroup.forEach(taskId => {
      if (this.deleteTask(taskId)) {
        deletedTaskCount++;
      }
    });

    // 2. Gruppe aus dem Chart entfernen
    const chart = this.getCurrentChart();
    const groupIndex = chart.groups.findIndex(g => g.id === groupId);
    if (groupIndex !== -1) {
      chart.groups.splice(groupIndex, 1);
    }

    // 3. Cache neu aufbauen (nach allen Task-Löschungen)
    this.taskStructure.init(chart.tasks, chart.groups);

    console.log(`🗑️ [TASK UPDATE SERVICE] Group deleted successfully`, {
      deletedGroup: groupId,
      deletedTasks: deletedTaskCount
    });

    return deletedTaskCount;
  }

  /**
   * Wendet direkte Property-Änderungen auf einen Task an.
   */
  private applyDirectChanges(task: Task, changes: Partial<Task>): TaskChange {
    const propertyChanges: TaskPropertyChange[] = [];

    // Progress
    if (changes.progress !== undefined && changes.progress !== task.progress) {
      propertyChanges.push({
        taskId: task.id,
        property: 'progress',
        oldValue: task.progress,
        newValue: changes.progress
      });
      task.progress = changes.progress;
    }

    // Status
    if (changes.status !== undefined && changes.status !== task.status) {
      propertyChanges.push({
        taskId: task.id,
        property: 'status',
        oldValue: task.status,
        newValue: changes.status
      });
      task.status = changes.status;
    }

    // Start
    if (changes.start !== undefined && changes.start !== task.start) {
      propertyChanges.push({
        taskId: task.id,
        property: 'start',
        oldValue: task.start,
        newValue: changes.start
      });
      task.start = changes.start;
      task.computedStart = changes.start; // Auch computedStart aktualisieren
    }

    // End
    if (changes.end !== undefined && changes.end !== task.end) {
      propertyChanges.push({
        taskId: task.id,
        property: 'end',
        oldValue: task.end,
        newValue: changes.end
      });
      task.end = changes.end;
      task.computedEnd = changes.end; // Auch computedEnd aktualisieren
    }

    // Title
    if (changes.title !== undefined && changes.title !== task.title) {
      propertyChanges.push({
        taskId: task.id,
        property: 'title',
        oldValue: task.title,
        newValue: changes.title
      });
      task.title = changes.title;
    }

    return {
      taskId: task.id,
      changes: propertyChanges,
      task: task
    };
  }

  /**
   * Aktualisiert Parent-Task-Properties basierend auf Children.
   * Verwendet TaskStructureCache für alle Lookup-Operationen.
   */
  private updateParentFromChildren(parentTask: Task): TaskChange {
    if (!parentTask.computeFromChildren || !parentTask.children || parentTask.children.length === 0) {
      return {
        taskId: parentTask.id,
        changes: [],
        task: parentTask
      };
    }

    const propertyChanges: TaskPropertyChange[] = [];

    // Child-Tasks holen
    const childTasks = parentTask.children
      .map(childId => this.taskStructure.getTaskById(childId))
      .filter(child => child !== undefined) as Task[];

    if (childTasks.length === 0) {
      return {
        taskId: parentTask.id,
        changes: [],
        task: parentTask
      };
    }

    // 1. Zeiten berechnen
    const validStarts = childTasks
      .map(child => child.start || child.computedStart)
      .filter(date => date !== undefined && date !== null) as Date[];
    
    const validEnds = childTasks
      .map(child => child.end || child.computedEnd)
      .filter(date => date !== undefined && date !== null) as Date[];
    
    const earliestStart = validStarts.length > 0 ? new Date(Math.min(...validStarts.map(d => d.getTime()))) : undefined;
    const latestEnd = validEnds.length > 0 ? new Date(Math.max(...validEnds.map(d => d.getTime()))) : undefined;

    // 2. Status berechnen
    const computedStatus = this.computeStatusFromChildren(childTasks);

    // 3. Progress berechnen
    const computedProgress = this.computeProgressFromChildren(childTasks);

    // Änderungen tracken und anwenden
    if (earliestStart && (!parentTask.computedStart || earliestStart.getTime() !== parentTask.computedStart.getTime())) {
      propertyChanges.push({
        taskId: parentTask.id,
        property: 'start',
        oldValue: parentTask.computedStart,
        newValue: earliestStart
      });
      parentTask.computedStart = earliestStart;
    }

    if (latestEnd && (!parentTask.computedEnd || latestEnd.getTime() !== parentTask.computedEnd.getTime())) {
      propertyChanges.push({
        taskId: parentTask.id,
        property: 'end',
        oldValue: parentTask.computedEnd,
        newValue: latestEnd
      });
      parentTask.computedEnd = latestEnd;
    }

    if (computedStatus !== parentTask.status) {
      propertyChanges.push({
        taskId: parentTask.id,
        property: 'status',
        oldValue: parentTask.status,
        newValue: computedStatus
      });
      parentTask.status = computedStatus;
    }

    if (Math.abs(computedProgress - parentTask.progress) > 0.001) { // Floating-point tolerance
      propertyChanges.push({
        taskId: parentTask.id,
        property: 'progress',
        oldValue: parentTask.progress,
        newValue: computedProgress
      });
      parentTask.progress = computedProgress;
    }

    return {
      taskId: parentTask.id,
      changes: propertyChanges,
      task: parentTask
    };
  }

  /**
   * Aktualisiert alle betroffenen Parent-Tasks für die gegebenen Task-IDs.
   * Extrahierte Logik aus updateTask() für Wiederverwendung in Drag&Drop-Operationen.
   * 
   * Geht rekursiv die Parent-Hierarchie nach oben und berechnet neue Properties
   * für alle Parents mit computeFromChildren=true.
   * 
   * @param affectedTaskIds IDs der Tasks die sich geändert haben (Child-Tasks)
   * @returns TaskChange[] mit allen aktualisierten Parent-Tasks (ohne Duplikate)
   */
  private updateAffectedParents(affectedTaskIds: string[]): TaskChange[] {
    const updatedTasks: TaskChange[] = [];
    const processedParents = new Set<string>(); // Duplikate vermeiden
    
    for (const taskId of affectedTaskIds) {
      const affectedParents = this.findAffectedParents(taskId);
      
      for (const parentId of affectedParents) {
        // Skip wenn bereits verarbeitet (z.B. gemeinsamer Großvater)
        if (processedParents.has(parentId)) {
          continue;
        }
        
        const parentTask = this.taskStructure.getTaskById(parentId);
        if (parentTask && parentTask.computeFromChildren) {
          const parentChanges = this.updateParentFromChildren(parentTask);
          if (parentChanges.changes.length > 0) {
            updatedTasks.push(parentChanges);
            processedParents.add(parentId);
            console.log(`🔄 [TASK UPDATE SERVICE] Updated parent task: ${parentId}`, parentChanges.changes);
          }
        }
      }
    }
    
    return updatedTasks;
  }

  /**
   * Findet alle Parent-Tasks die von einer Task-Änderung betroffen sind.
   * Verwendet TaskStructureCache für Lookup-Operationen.
   */
  private findAffectedParents(taskId: string): string[] {
    const affectedParents: string[] = [];
    let currentId: string | undefined = taskId;

    // Aufwärts durch die Parent-Hierarchie gehen
    while (currentId) {
      const parentId = this.taskStructure.getParentOfChild(currentId);
      if (!parentId) {
        break; // Kein Parent mehr gefunden
      }

      const parentTask = this.taskStructure.getTaskById(parentId);
      if (parentTask && parentTask.computeFromChildren) {
        affectedParents.push(parentId);
      }

      currentId = parentId; // Weiter nach oben gehen
    }

    return affectedParents;
  }

  /**
   * Berechnet den Status eines Parent-Tasks basierend auf seinen Kind-Tasks.
```
   * Übernommen aus GanttChartComponent.computeStatusFromChildren
   */
  private computeStatusFromChildren(childTasks: Task[]): Status {
    if (!childTasks || childTasks.length === 0) {
      return Status.OPEN;
    }

    const statusCounts = {
      [Status.OPEN]: 0,
      [Status.IN_PROGRESS]: 0,
      [Status.DONE]: 0,
      [Status.ARCHIVED]: 0
    };

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
    if (statusCounts[Status.DONE] > 0 || statusCounts[Status.ARCHIVED] > 0) {
      return Status.IN_PROGRESS;
    }

    // Regel 1: Alle Kinder OPEN → Parent OPEN
    return Status.OPEN;
  }

  /**
   * Berechnet den gewichteten Fortschritt eines Parent-Tasks basierend auf seinen Kind-Tasks.
   * Übernommen aus GanttChartComponent.computeProgressFromChildren
   */
  private computeProgressFromChildren(childTasks: Task[]): number {
    if (!childTasks || childTasks.length === 0) {
      return 0.0;
    }

    let totalWeightedProgress = 0;
    let totalWeight = 0;

    for (const child of childTasks) {
      const duration = this.calculateIndividualTaskDurationInDays(child);
      
      if (duration <= 0) {
        continue;
      }
      
      totalWeightedProgress += child.progress * duration;
      totalWeight += duration;
    }

    if (totalWeight === 0) {
      return 0.0;
    }

    return totalWeightedProgress / totalWeight;
  }

  /**
   * Berechnet die Dauer eines Tasks in Tagen.
   * Übernommen aus GanttChartComponent.calculateIndividualTaskDurationInDays
   */
  private calculateIndividualTaskDurationInDays(task: Task): number {
    const startDate = task.start || task.computedStart;
    const endDate = task.end || task.computedEnd;
    
    if (!startDate || !endDate) {
      return 0; // Keine gültigen Daten
    }
    
    const diffInMs = endDate.getTime() - startDate.getTime();
    const diffInDays = diffInMs / (1000 * 60 * 60 * 24);
    
    return Math.max(diffInDays, 0.1); // Mindestens 0.1 Tage für sehr kurze Tasks
  }

  /**
   * Einmalige Berechnung aller Parent-Properties beim Chart-Laden.
   * Berechnet für alle Tasks mit computeFromChildren=true die abgeleiteten Properties:
   * - computedStart (frühester Start aller Children)
   * - computedEnd (spätestes Ende aller Children)
   * - progress (gewichteter Durchschnitt aller Children)
   * - status (abgeleiteter Status basierend auf Children-Status)
   * 
   * Verwendet den zentralen TaskStructureCache für alle Lookup-Operationen.
   * 
   * @param tasks Das komplette Task-Array
   */
  precomputeAllParentProperties(tasks: Task[]): void {
    console.log(`🔄 [TASK UPDATE SERVICE] Starting precomputation for ${tasks.length} tasks`);
    
    // Cache für bereits berechnete Tasks (verhindert Duplikate)
    const computed = new Set<string>();
    let updatedTaskCount = 0;
    
    // Alle Tasks mit computeFromChildren verarbeiten
    for (const task of tasks) {
      if (task.computeFromChildren && !computed.has(task.id)) {
        const wasUpdated = this.precomputeTaskPropertiesRecursive(task, computed);
        if (wasUpdated) {
          updatedTaskCount++;
        }
      }
    }
    
    console.log(`🔄 [TASK UPDATE SERVICE] Precomputation completed`, {
      totalTasks: tasks.length,
      updatedTasks: updatedTaskCount,
      computedTasks: computed.size
    });
  }

  /**
   * Rekursive Hilfsmethode für die Precomputation.
   * Berechnet Parent-Properties bottom-up (Children zuerst, dann Parent).
   * Verwendet TaskStructureCache für alle Lookup-Operationen.
   */
  private precomputeTaskPropertiesRecursive(task: Task, computed: Set<string>): boolean {
    // Bereits berechnet -> skip
    if (computed.has(task.id)) {
      return false;
    }

    // Nicht computeFromChildren -> keine Berechnung nötig
    if (!task.computeFromChildren || !task.children || task.children.length === 0) {
      computed.add(task.id);
      return false;
    }

    // 1. Erst alle Children rekursiv berechnen (bottom-up)
    for (const childId of task.children) {
      const childTask = this.taskStructure.getTaskById(childId);
      if (childTask && childTask.computeFromChildren) {
        this.precomputeTaskPropertiesRecursive(childTask, computed);
      }
    }

    // 2. Dann diesen Task berechnen
    const childTasks = task.children
      .map(childId => this.taskStructure.getTaskById(childId))
      .filter(child => child !== undefined) as Task[];

    if (childTasks.length === 0) {
      computed.add(task.id);
      return false;
    }

    let wasUpdated = false;

    // Zeiten berechnen
    const validStarts = childTasks
      .map(child => child.start || child.computedStart)
      .filter(date => date !== undefined && date !== null) as Date[];
    
    const validEnds = childTasks
      .map(child => child.end || child.computedEnd)
      .filter(date => date !== undefined && date !== null) as Date[];
    
    const earliestStart = validStarts.length > 0 ? new Date(Math.min(...validStarts.map(d => d.getTime()))) : undefined;
    const latestEnd = validEnds.length > 0 ? new Date(Math.max(...validEnds.map(d => d.getTime()))) : undefined;

    // computedStart/End aktualisieren
    if (earliestStart && (!task.computedStart || task.computedStart.getTime() !== earliestStart.getTime())) {
      task.computedStart = earliestStart;
      wasUpdated = true;
    }
    if (latestEnd && (!task.computedEnd || task.computedEnd.getTime() !== latestEnd.getTime())) {
      task.computedEnd = latestEnd;
      wasUpdated = true;
    }

    // Status berechnen
    const computedStatus = this.computeStatusFromChildren(childTasks);
    if (task.status !== computedStatus) {
      task.status = computedStatus;
      wasUpdated = true;
    }

    // Progress berechnen
    const computedProgress = this.computeProgressFromChildren(childTasks);
    if (Math.abs(task.progress - computedProgress) > 0.001) { // Floating-point Vergleich
      task.progress = computedProgress;
      wasUpdated = true;
    }

    computed.add(task.id);
    
    if (wasUpdated) {
      console.log(`🔄 [TASK UPDATE SERVICE] Precomputed properties for task: ${task.id}`, {
        computedStart: task.computedStart,
        computedEnd: task.computedEnd,
        status: task.status,
        progress: task.progress
      });
    }
    
    return wasUpdated;
  }

  // ========================================
  // DRAG & DROP OPERATIONS
  // ========================================

  /**
   * Bewegt einen Task als Sub-Task unter einen anderen Parent-Task.
   * Migriert aus GanttChart.moveAsSubTask() - identische Logik für Vergleichbarkeit.
   * 
   * @param taskToMove Der Task der bewegt werden soll
   * @param parentId ID des neuen Parent-Tasks
   * @param targetId ID des Tasks neben dem positioniert werden soll
   * @param dropPosition "before" oder "after" für die Position relativ zum Target
   * @returns true wenn erfolgreich, false bei Fehlern
   */
  moveAsSubTask(taskToMove: Task, parentId: string, targetId: string, dropPosition: string): boolean {
    console.log(`🚚 [TASK UPDATE SERVICE] Moving task as sub-task: ${taskToMove.id} -> ${parentId}`);

    const parentTask = this.taskStructure.getTaskById(parentId);
    if (!parentTask) {
      console.error("Parent task not found: " + parentId);
      return false;
    }

    // Task aus bestehender Parent-Beziehung entfernen
    this.removeTaskFromParentInternal(taskToMove.id);

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
    this.taskStructure.parentByChildId.set(taskToMove.id, parentId);
    this.taskStructure.childrenByParentId.set(parentId, [...parentTask.children]);

    // Gruppe des Sub-Tasks entfernen, da Sub-Tasks keine eigene Gruppe haben
    // Die Gruppenzugehörigkeit wird durch den Parent-Task bestimmt
    taskToMove.group = undefined;

    console.log(`🚚 [TASK UPDATE SERVICE] Sub-Task created successfully`, {
      movedTask: taskToMove.id,
      newParent: parentId,
      groupRemoved: true
    });

    return true;
  }

  /**
   * Behandelt normales Drag & Drop ohne Sub-Task-Erstellung (Reordering).
   * Migriert aus GanttChart.handleNormalDragDrop() - identische Logik für Vergleichbarkeit.
   * 
   * @param taskToMove Der Task der bewegt werden soll
   * @param eventData Die Event-Daten vom Drag & Drop
   * @returns true wenn erfolgreich, false bei Fehlern
   */
  handleNormalDragDrop(taskToMove: Task, operation: DragDropOperation): boolean {
    console.log(`🚚 [TASK UPDATE SERVICE] Normal drag drop: ${taskToMove.id} -> ${operation.targetId} (${operation.dropPosition})`);

    // Task wurde aus Parent herausgezogen - zu Top-Level machen
    this.removeTaskFromParentInternal(taskToMove.id);

    let targetIndex = this.taskStructure.getAllTasks().findIndex(t => t.id == operation.targetId);
    if (targetIndex == -1) {
      console.error("No task to insert before / after with id " + operation.targetId);
      return false;
    }

    const targetTask = this.taskStructure.getTaskById(operation.targetId);
    if (!targetTask) {
      console.error("Target task not found: " + operation.targetId);
      return false;
    }
    if (taskToMove.group != targetTask.group) {
      console.log("group changed by drag&drop from " + taskToMove.group + " to " + targetTask.group);
      taskToMove.group = targetTask.group;
    }

    // Reihenfolge in der Task-Liste anpassen
    if (operation.dropPosition == "after") {
      targetIndex++;
    }
    const allTasks = this.taskStructure.getAllTasks();
    allTasks.splice(allTasks.indexOf(taskToMove), 1);
    allTasks.splice(targetIndex, 0, taskToMove);

    console.log(`🚚 [TASK UPDATE SERVICE] Task moved to top-level successfully`, {
      movedTask: taskToMove.id,
      newGroup: taskToMove.group,
      newPosition: targetIndex
    });

    return true;
  }

  /**
   * Entfernt einen Task aus seiner aktuellen Parent-Beziehung.
   * Migriert aus GanttChart.removeTaskFromParent() - identische Logik.
   * 
   * @param taskId ID des Tasks der aus Parent-Beziehung entfernt werden soll
   */
  private removeTaskFromParentInternal(taskId: string): void {
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

  /**
   * Zentrale Orchestrierung für Drag & Drop-Operationen.
   * Übernimmt die komplette If-Else-Logik aus der UI-Komponente (GanttChart Zeilen 645-666).
   * 
   * @param operation Die Service-spezifische Operation (ohne UI-Abhängigkeiten)
   * @returns Ergebnis der Operation für UI-Feedback
   */
  processDragDropOperation(operation: DragDropOperation): DragDropResult {
    console.log('🎯 [DRAG DROP ORCHESTRATION] Processing operation:', operation);

    // Sicherheitscheck: Task existiert
    const taskToMove = this.taskStructure.getTaskById(operation.taskToMoveId);
    if (!taskToMove) {
      return {
        success: false,
        eventType: 'task-reordered',
        operation: 'array-reordering',
        errorMessage: `Task ${operation.taskToMoveId} not found`
      };
    }

    // Sammle alle Task-IDs und Parent-Updates für das ChangeSet
    const ganttItemsToUpdate = new Set<string>();
    let allUpdatedTasks: TaskChange[] = [];

    if (operation.dropPosition === 'inside') {
      console.log(`🔧 [DRAG DROP] Drop position is 'inside' - adding as sub-task`);
      
      // Task wird als Sub-Task zum targetOrigin hinzugefügt
      // Position: Am Ende der Children-Liste
      const moveResult = this.moveAsSubTask(
        taskToMove,
        operation.targetId,  // targetOrigin wird der neue Parent
        operation.targetId,  // Als letztes Child einfügen
        'after'                     // Fügt am Ende hinzu
      );

      if (moveResult) {
        // Parent-Updates berechnen
        // Übergebe die verschobene Task-ID - findAffectedParents() findet automatisch
        // alle betroffenen Parents (alter Parent, neuer Parent, Großeltern etc.)
        const parentUpdates = this.updateAffectedParents([taskToMove.id]);
        allUpdatedTasks = parentUpdates;
        parentUpdates.forEach(change => ganttItemsToUpdate.add(change.taskId));
        
        console.log(`🔄 [DRAG DROP] Updated ${parentUpdates.length} parent task(s) after inside drop`);
        
        // Automatisches Undo NACH der Mutation
        this.saveStateAfterMutation();
        
        return {
          success: true,
          eventType: 'task-moved-to-subtask',
          operation: 'sub-task-creation',
          updatedTasks: allUpdatedTasks,
          ganttItemsToUpdate: Array.from(ganttItemsToUpdate)
        };
      } else {
        return {
          success: false,
          eventType: 'task-moved-to-subtask',
          operation: 'sub-task-creation',
          errorMessage: 'Sub-task creation (inside drop) failed'
        };
      }
    }
    else if (operation.targetParentId) {

      // Sub-Task-Erstellung: Task wird als Child unter targetOrigin hinzugefügt
      console.log('🔧 [DRAG DROP] Executing: moveAsSubTask');
      
      const moveResult = this.moveAsSubTask(
        taskToMove,
        operation.targetParentId,
        operation.targetId,
        operation.dropPosition
      );

      if (moveResult) {
        // Parent-Updates berechnen
        // Übergebe die verschobene Task-ID - findAffectedParents() findet automatisch
        // alle betroffenen Parents (alter Parent, neuer Parent, Großeltern etc.)
        const parentUpdates = this.updateAffectedParents([taskToMove.id]);
        allUpdatedTasks = parentUpdates;
        parentUpdates.forEach(change => ganttItemsToUpdate.add(change.taskId));
        
        console.log(`🔄 [DRAG DROP] Updated ${parentUpdates.length} parent task(s) after sub-task creation`);
        
        // Automatisches Undo NACH der Mutation
        this.saveStateAfterMutation();
        
        return {
          success: true,
          eventType: 'task-moved-to-subtask',
          operation: 'sub-task-creation',
          updatedTasks: allUpdatedTasks,
          ganttItemsToUpdate: Array.from(ganttItemsToUpdate)
        };
      } else {
        return {
          success: false,
          eventType: 'task-moved-to-subtask',
          operation: 'sub-task-creation',
          errorMessage: 'Sub-task creation failed'
        };
      }

    } else {
      // Normales Reordering: Task bleibt auf gleicher Hierarchie-Ebene
      console.log('🔧 [DRAG DROP] Executing: handleNormalDragDrop');
      
      // Prüfe ob Task einen alten Parent hatte (wird dann zu Top-Level verschoben)
      const oldParentId = this.taskStructure.getParentOfChild(taskToMove.id);
      
      const reorderResult = this.handleNormalDragDrop(
        taskToMove,
        operation
      );

      if (reorderResult) {
        // Parent-Updates berechnen (nur wenn Task aus einem Parent rausgezogen wurde)
        if (oldParentId) {
          // Übergebe die verschobene Task-ID - findAffectedParents() findet den alten Parent
          // ABER: Nach handleNormalDragDrop() hat der Task keinen Parent mehr!
          // Daher müssen wir hier die oldParentId direkt aktualisieren
          const oldParentTask = this.taskStructure.getTaskById(oldParentId);
          if (oldParentTask && oldParentTask.computeFromChildren) {
            const parentChanges = this.updateParentFromChildren(oldParentTask);
            if (parentChanges.changes.length > 0) {
              allUpdatedTasks.push(parentChanges);
              ganttItemsToUpdate.add(parentChanges.taskId);
              
              // Auch Großeltern aktualisieren
              const grandParentUpdates = this.updateAffectedParents([oldParentId]);
              allUpdatedTasks.push(...grandParentUpdates);
              grandParentUpdates.forEach(change => ganttItemsToUpdate.add(change.taskId));
            }
          }
          
          console.log(`🔄 [DRAG DROP] Updated ${allUpdatedTasks.length} parent task(s) after reordering`);
        }
        
        // Automatisches Undo NACH der Mutation
        this.saveStateAfterMutation();
        
        return {
          success: true,
          eventType: 'task-reordered',
          operation: 'array-reordering',
          updatedTasks: allUpdatedTasks,
          ganttItemsToUpdate: Array.from(ganttItemsToUpdate)
        };
      } else {
        return {
          success: false,
          eventType: 'task-reordered',
          operation: 'array-reordering',
          errorMessage: 'Task reordering failed'
        };
      }
    }
  }
}