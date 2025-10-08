import { Injectable } from '@angular/core';
import { Task, Group } from './domain/Task';

/**
 * TaskStructureCache - Zentrale Verwaltung aller Task- und Group-Lookup-Maps
 * 
 * Analog zum DependencyCache verwaltet dieser Service alle performance-optimierten
 * Lookup-Maps für Task-Struktur und Parent-Child-Beziehungen.
 * 
 * Features:
 * - O(1) Task-Lookups über taskById Map
 * - O(1) Parent-Child-Beziehung Lookups
 * - O(1) Group-Lookups und Task-Group-Zuordnungen
 * - Zentrale buildMaps() Methode für konsistente Initialisierung
 * - Public Maps für Kompatibilität mit bestehenden Services
 * 
 * Usage:
 * ```typescript
 * constructor(private taskStructure: TaskStructureCache) {}
 * 
 * // Maps aufbauen
 * this.taskStructure.buildMaps(tasks, groups);
 * 
 * // Task lookup
 * const task = this.taskStructure.getTaskById('task-123');
 * 
 * // Parent-Child Beziehungen
 * const children = this.taskStructure.getChildrenOfParent('parent-456');
 * const parent = this.taskStructure.getParentOfChild('child-789');
 * ```
 */
@Injectable({
  providedIn: 'root'
})
export class TaskStructureCache {

  // ============================================================================
  // PUBLIC MAPS - Direkt zugänglich für Services wie TaskUpdateService
  // ============================================================================

  /**
   * Performance-optimierte Task-Lookup-Map: taskId → Task
   * Ermöglicht O(1) Task-Zugriffe statt O(n) Array-Iteration
   */
  public readonly taskById = new Map<string, Task>();

  /**
   * Parent-Child-Beziehungen: parentId → childId[]
   * Ermöglicht O(1) Lookup aller Children eines Parent-Tasks
   */
  public readonly childrenByParentId = new Map<string, string[]>();

  /**
   * Child-Parent-Beziehungen: childId → parentId
   * Ermöglicht O(1) Lookup des Parent eines Child-Tasks
   */
  public readonly parentByChildId = new Map<string, string>();

  /**
   * Performance-optimierte Group-Lookup-Map: groupId → Group
   * Ermöglicht O(1) Group-Zugriffe statt O(n) Array-Iteration
   */
  public readonly groupById = new Map<string, Group>();

  /**
   * Group-Task-Zuordnungen: groupId → taskId[]
   * Ermöglicht O(1) Lookup aller Tasks einer Gruppe
   */
  public readonly tasksByGroupId = new Map<string, string[]>();

  private tasks: Task[] = [];
  
  private groups: Group[] = [];

  // ============================================================================
  // PUBLIC API METHODS
  // ============================================================================

  /**
   * Baut alle Performance-optimierten Lookup-Maps auf.
   * Muss nach jeder Änderung der Tasks- oder Groups-Liste aufgerufen werden.
   * 
   * Diese Methode ersetzt die buildLookupMaps() Logik aus GanttChartComponent
   * und zentralisiert die Map-Verwaltung für die gesamte Anwendung.
   * 
   * @param tasks Array aller Tasks
   * @param groups Array aller Groups
   */
  public init(tasks: Task[], groups: Group[]): void {
    this.tasks = tasks;
    this.groups = groups;
    const startTime = performance.now();
    
    console.log('🏗️ [TASK STRUCTURE CACHE] Building lookup maps...', {
      tasksCount: tasks.length,
      groupsCount: groups.length
    });

    // Alle Maps zurücksetzen
    this.clearAllMaps();

    // Task Maps aufbauen
    this.buildTaskMaps(tasks);
    
    // Group Maps aufbauen
    this.buildGroupMaps(groups, tasks);
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    const color = duration > 20 ? '🔴' : duration > 10 ? '🟠' : '🟢';
    
    console.log(`${color} [TASK STRUCTURE CACHE] Maps built successfully - ${duration.toFixed(2)}ms`, {
      taskMapSize: this.taskById.size,
      parentChildRelations: this.childrenByParentId.size,
      groupMapSize: this.groupById.size,
      taskGroupRelations: this.tasksByGroupId.size
    });
  }

  /**
   * Holt einen Task über seine ID.
   * @param taskId Task-ID
   * @returns Task oder undefined wenn nicht gefunden
   */
  public getTaskById(taskId: string): Task | undefined {
    return this.taskById.get(taskId);
  }

  /**
   * Holt alle Child-Task-IDs eines Parent-Tasks.
   * @param parentId Parent-Task-ID
   * @returns Array von Child-Task-IDs oder leeres Array
   */
  public getChildrenOfParent(parentId: string): string[] {
    return this.childrenByParentId.get(parentId) || [];
  }

  /**
   * Holt die Parent-Task-ID eines Child-Tasks.
   * @param childId Child-Task-ID
   * @returns Parent-Task-ID oder undefined wenn kein Parent
   */
  public getParentOfChild(childId: string): string | undefined {
    return this.parentByChildId.get(childId);
  }

  /**
   * Holt eine Group über ihre ID.
   * @param groupId Group-ID
   * @returns Group oder undefined wenn nicht gefunden
   */
  public getGroupById(groupId: string): Group | undefined {
    return this.groupById.get(groupId);
  }

  /**
   * Holt alle Task-IDs einer Gruppe.
   * @param groupId Group-ID
   * @returns Array von Task-IDs oder leeres Array
   */
  public getTasksOfGroup(groupId: string): string[] {
    return this.tasksByGroupId.get(groupId) || [];
  }

  /**
   * Holt alle Task-IDs einer Gruppe inklusive aller SubTasks (rekursiv).
   * Sammelt alle Tasks die direkt der Gruppe zugeordnet sind sowie
   * alle deren Children, SubChildren, etc. (beliebig tief verschachtelt).
   * 
   * @param groupId Group-ID
   * @returns Array von Task-IDs (Group-Tasks + alle SubTasks) oder leeres Array
   */
  public getAllTasksAndSubTasksOfGroup(groupId: string): string[] {
    const directGroupTasks = this.tasksByGroupId.get(groupId) || [];
    const allTaskIds = new Set<string>();
    
    // Alle direkt zur Gruppe gehörenden Tasks hinzufügen
    for (const taskId of directGroupTasks) {
      allTaskIds.add(taskId);
    }
    
    // Rekursiv alle SubTasks sammeln
    for (const taskId of directGroupTasks) {
      this.collectAllSubTasks(taskId, allTaskIds);
    }
    
    return Array.from(allTaskIds);
  }

  /**
   * Holt alle Task-Objekte einer Gruppe inklusive aller SubTasks (rekursiv).
   * Praktische Variante von getAllTasksAndSubTasksOfGroup() die direkt Task-Objekte zurückgibt.
   * 
   * @param groupId Group-ID
   * @returns Array von Task-Objekten (Group-Tasks + alle SubTasks) oder leeres Array
   */
  public getAllTasksAndSubTasksOfGroupAsObjects(groupId: string): Task[] {
    const taskIds = this.getAllTasksAndSubTasksOfGroup(groupId);
    return taskIds
      .map(id => this.taskById.get(id))
      .filter((task): task is Task => task !== undefined);
  }
  
  /**
   * Rekursive Hilfsmethode um alle SubTasks eines Tasks zu sammeln.
   * @param taskId Task-ID dessen SubTasks gesammelt werden sollen
   * @param allTaskIds Set zum Sammeln aller Task-IDs (wird modifiziert)
   */
  private collectAllSubTasks(taskId: string, allTaskIds: Set<string>): void {
    const children = this.childrenByParentId.get(taskId) || [];
    
    for (const childId of children) {
      // Child Task hinzufügen
      allTaskIds.add(childId);
      
      // Rekursiv alle SubTasks des Child Tasks sammeln
      this.collectAllSubTasks(childId, allTaskIds);
    }
  }
  /**
   * Prüft ob ein Task existiert.
   * @param taskId Task-ID
   * @returns true wenn Task existiert
   */
  public hasTask(taskId: string): boolean {
    return this.taskById.has(taskId);
  }

  /**
   * Prüft ob eine Group existiert.
   * @param groupId Group-ID
   * @returns true wenn Group existiert
   */
  public hasGroup(groupId: string): boolean {
    return this.groupById.has(groupId);
  }

  /**
   * Holt alle Tasks in der ursprünglichen Array-Reihenfolge.
   * @returns Array aller Tasks in korrekter Reihenfolge
   */
  public getAllTasks(): Task[] {
    return this.tasks;
  }

  /**
   * Holt alle Groups in der ursprünglichen Array-Reihenfolge.
   * @returns Array aller Groups in korrekter Reihenfolge
   */
  public getAllGroups(): Group[] {
    return this.groups;
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Löscht alle Maps - für saubere Reinitialisierung.
   */
  private clearAllMaps(): void {
    this.taskById.clear();
    this.childrenByParentId.clear();
    this.parentByChildId.clear();
    this.groupById.clear();
    this.tasksByGroupId.clear();
  }

  /**
   * Baut Task-spezifische Maps auf.
   * @param tasks Array aller Tasks
   */
  private buildTaskMaps(tasks: Task[]): void {
    for (const task of tasks) {
      // Task-Lookup-Map
      this.taskById.set(task.id, task);
      
      // Parent-Child-Beziehungen aufbauen
      if (task.children && task.children.length > 0) {
        this.childrenByParentId.set(task.id, [...task.children]);
        
        // Child → Parent Mappings
        for (const childId of task.children) {
          this.parentByChildId.set(childId, task.id);
        }
      }
    }
  }

  /**
   * Baut Group-spezifische Maps auf.
   * @param groups Array aller Groups
   * @param tasks Array aller Tasks (für Group-Task-Zuordnungen)
   */
  private buildGroupMaps(groups: Group[], tasks: Task[]): void {
    // Group-Lookup-Map
    for (const group of groups) {
      this.groupById.set(group.id, group);
    }
    
    // Task-Group-Zuordnungen aufbauen
    for (const task of tasks) {
      if (task.group) {
        const groupTasks = this.tasksByGroupId.get(task.group) || [];
        groupTasks.push(task.id);
        this.tasksByGroupId.set(task.group, groupTasks);
      }
    }
  }

}