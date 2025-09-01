import { Pipe, PipeTransform } from '@angular/core';
import { Task, Status } from '../domain/Task';

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

  transform(tasks: Task[], filter: TaskFilter): Task[] {
    if (!tasks || !filter) {
      return tasks || [];
    }

    return this.getFilteredTasks(tasks, filter);
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
      const downstreamIds = this.getDownstreamDependencies(tasks, filteredTaskIds);
      downstreamIds.forEach(id => resultIds.add(id));
    }
    if (filter.showUpstreamDeps) {
      const upstreamIds = this.getUpstreamDependencies(tasks, filteredTaskIds);
      upstreamIds.forEach(id => resultIds.add(id));
    }
    
    let filtered = tasks.filter(task => resultIds.has(task.id));
    // Status-Filter anwenden
    filtered = filtered.filter(task => this.isTaskStatusVisible(task, filter));
    return filtered;
  }

  private getDownstreamDependencies(tasks: Task[], taskIds: Set<string>): Set<string> {
    const downstreamIds = new Set<string>();
    const visited = new Set<string>();

    // Downstream: Finde alle Tasks, die von den gefilterten Tasks direkt oder indirekt abhängen
    const findDependents = (sourceTaskId: string) => {
      if (visited.has(sourceTaskId)) return;
      visited.add(sourceTaskId);

      // Alle Tasks durchsuchen, die eine Dependency auf sourceTaskId haben
      tasks.forEach(task => {
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

  private getUpstreamDependencies(tasks: Task[], taskIds: Set<string>): Set<string> {
    const upstreamIds = new Set<string>();
    const visited = new Set<string>();

    // Upstream: Finde alle Tasks, von denen die gefilterten Tasks direkt oder indirekt abhängen
    const findBlockers = (taskId: string) => {
      if (visited.has(taskId)) return;
      visited.add(taskId);

      const task = tasks.find(t => t.id === taskId);
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
