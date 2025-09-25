import { Pipe, PipeTransform, inject } from '@angular/core';
import { Task, Status } from '../domain/Task';
import { DependencyCache } from '../gantt-chart/dependency-cache';

export interface TaskFilter {
  taskFilter: string;
  showDownstreamDeps: boolean;
  showUpstreamDeps: boolean;
  showOpenTasks: boolean;
  showInProgressTasks: boolean;
  showDoneTasks: boolean;
  showArchivedTasks: boolean;
}

@Pipe({
  name: 'taskFilter',
  pure: true,
  standalone: false
})
export class TaskFilterPipe implements PipeTransform {
  private dependencyCache = inject(DependencyCache);

  transform(tasks: Task[], filter: TaskFilter): Task[] {
    if (!tasks || !filter) {
      return tasks || [];
    }

    const startTime = performance.now();
    const result = this.getFilteredTasks(tasks, filter);
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Performance-Logging (nur bei signifikanten Filteroperationen)
    if (duration > 1 || (filter.showDownstreamDeps || filter.showUpstreamDeps)) {
      console.log(`⏱️ [TASK FILTER PIPE] Filter took ${duration.toFixed(2)}ms`, {
        tasksCount: tasks.length,
        filteredCount: result.length,
        textFilter: filter.taskFilter || '(none)',
        downstreamDeps: filter.showDownstreamDeps,
        upstreamDeps: filter.showUpstreamDeps,
        duration: `${duration.toFixed(2)}ms`
      });
    }

    return result;
  }

  private getFilteredTasks(tasks: Task[], filter: TaskFilter): Task[] {
    // Basis-Tasks durch Textfilter ermitteln
    let filteredTaskIds = new Set<string>();
    const parentTaskIds = new Set<string>();

    if (!filter.taskFilter || filter.taskFilter.trim() === '') {
      // Wenn kein Textfilter, aber Dependencies aktiviert, alle Tasks als Basis nehmen
      if (filter.showDownstreamDeps || filter.showUpstreamDeps) {
        tasks.forEach(task => filteredTaskIds.add(task.id));
      } else {
        // Status-Filter anwenden
        return tasks.filter(task => this.isTaskStatusVisible(task, filter));
      }
    } else {
      const filterText = filter.taskFilter.toLowerCase().trim();

      // Ersten Durchgang: Direkte Treffer finden
      tasks.forEach(task => {
        if (task.title.toLowerCase().includes(filterText)) {
          filteredTaskIds.add(task.id);
        }
      });

      // Zweiten Durchgang: Parent-Tasks von gefilterten Child-Tasks finden
      tasks.forEach(task => {
        if (task.children && task.children.length > 0) {
          const hasMatchingChild = task.children.some(childId => {
            const childTask = tasks.find(t => t.id === childId);
            return childTask && childTask.title.toLowerCase().includes(filterText);
          });
          if (hasMatchingChild) {
            parentTaskIds.add(task.id);
            // Child-Tasks hinzufügen, die den Filter erfüllen
            task.children.forEach(childId => {
              const childTask = tasks.find(t => t.id === childId);
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
    if (filter.showDownstreamDeps) {
      // Use service for efficient transitive dependency lookup
      filteredTaskIds.forEach(taskId => {
        const downstreamTasks = this.dependencyCache.getAllDownstreamDependents(taskId);
        downstreamTasks.forEach(id => resultIds.add(id));
      });
    }
    if (filter.showUpstreamDeps) {
      // Use service for efficient transitive dependency lookup
      filteredTaskIds.forEach(taskId => {
        const upstreamTasks = this.dependencyCache.getAllUpstreamDependencies(taskId);
        upstreamTasks.forEach(id => resultIds.add(id));
      });
    }
    
    let filtered = tasks.filter(task => resultIds.has(task.id));
    // Status-Filter anwenden
    filtered = filtered.filter(task => this.isTaskStatusVisible(task, filter));
    return filtered;
  }

  // Hilfsmethode zur Prüfung, ob ein Task basierend auf Status-Filtern sichtbar ist
  private isTaskStatusVisible(task: Task, filter: TaskFilter): boolean {
    // Wenn alle Status-Filter deaktiviert sind, alle Tasks anzeigen
    if (!filter.showOpenTasks && !filter.showInProgressTasks && !filter.showDoneTasks && !filter.showArchivedTasks) {
      return true;
    }
    
    switch (task.status) {
      case Status.OPEN:
        return filter.showOpenTasks;
      case Status.IN_PROGRESS:
        return filter.showInProgressTasks;
      case Status.DONE:
        return filter.showDoneTasks;
      case Status.ARCHIVED:
        return filter.showArchivedTasks;
      default:
        return true; // Fallback für unbekannte Status
    }
  }
}
