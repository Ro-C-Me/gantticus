import { Injectable } from '@angular/core';
import { Dependency, DependencyType, Task } from '../domain/Task';

/**
 * Interface for dependency change tracking.
 * Used to communicate what dependency changes were made during an update.
 */
export interface DependencyChangeSet {
  addedDependencies: Array<{sourceId: string, targetId: string, type: DependencyType}>;
  removedDependencies: Array<{sourceId: string, targetId: string, type: DependencyType}>;
}

/**
 * High-performance injectable service for task dependencies with O(1) lookups.
 * Maintains bidirectional maps for fast dependency queries and provides
 * transitive dependency resolution.
 */
@Injectable({
  providedIn: 'root'
})
export class DependencyCache {
  // Collision-safe separator for type keys (NULL character cannot appear in string IDs)
  private static readonly TYPE_KEY_SEPARATOR = '\0';

  // Bidirectional ID mappings for O(1) lookups
  private dependentIds = new Map<string, Set<string>>();    // sourceId → Set<targetId> ("Wen blockiere ich")
  private dependencyIds = new Map<string, Set<string>>();   // targetId → Set<sourceId> ("Von wem bin ich blockiert")
  
  // Dependency types for each relationship
  private dependencyTypes = new Map<string, Set<DependencyType>>(); // "sourceId\0targetId" → Set<DependencyType>

  /**
   * Rebuilds the entire cache from the given tasks array.
   * Should be called whenever the task structure changes significantly.
   */
  rebuild(tasks: Task[]): void {
    console.log(`🔄 [DEPENDENCY CACHE] Rebuilding cache for ${tasks.length} tasks`);
    const startTime = performance.now();
    
    // Clear all existing mappings
    this.clear();
    
    let totalDependencies = 0;
    let tasksWithDependencies = 0;
    
    // Process all tasks and their dependencies
    for (const task of tasks) {
      if (task.dependencies && task.dependencies.length > 0) {
        tasksWithDependencies++;
        
        for (const dependency of task.dependencies) {
          this.addDependencyInternal(dependency.taskId, task.id, dependency.type);
          totalDependencies++;
        }
      }
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.log(`✅ [DEPENDENCY CACHE] Rebuild complete - ${duration.toFixed(2)}ms`, {
      totalTasks: tasks.length,
      tasksWithDependencies,
      totalDependencies,
      dependencyMappings: this.dependencyTypes.size
    });
  }

  /**
   * Gets all tasks that depend on the given task (successors).
   * @param taskId The task ID to find dependents for
   * @returns Array of tasks that depend on this task, with their dependency types
   */
  getDependents(taskId: string): Array<{taskId: string, type: DependencyType}> {
    const dependentIds = this.dependentIds.get(taskId) || new Set();
    const result: Array<{taskId: string, type: DependencyType}> = [];
    
    for (const dependentId of dependentIds) {
      const typeKey = `${taskId}${DependencyCache.TYPE_KEY_SEPARATOR}${dependentId}`;
      const types = this.dependencyTypes.get(typeKey) || new Set();
      for (const type of types) {
        result.push({ taskId: dependentId, type });
      }
    }
    
    return result;
  }

  /**
   * Gets all tasks that the given task depends on (predecessors).
   * @param taskId The task ID to find dependencies for
   * @returns Array of tasks that this task depends on, with their dependency types
   */
  getDependencies(taskId: string): Array<{taskId: string, type: DependencyType}> {
    const dependencyIds = this.dependencyIds.get(taskId) || new Set();
    const result: Array<{taskId: string, type: DependencyType}> = [];
    
    for (const dependencyId of dependencyIds) {
      const typeKey = `${dependencyId}${DependencyCache.TYPE_KEY_SEPARATOR}${taskId}`;
      const types = this.dependencyTypes.get(typeKey) || new Set();
      for (const type of types) {
        result.push({ taskId: dependencyId, type });
      }
    }
    
    return result;
  }

  /**
   * Adds a new dependency relationship to the cache.
   * @param sourceId The task that blocks (predecessor)
   * @param targetId The task that is blocked (successor)  
   * @param type The type of dependency (FS, SS, FF, SF)
   */
  addDependency(sourceId: string, targetId: string, type: DependencyType): void {
    this.addDependencyInternal(sourceId, targetId, type);
    console.log(`➕ [DEPENDENCY CACHE] Added dependency: ${sourceId} -${type}-> ${targetId}`);
  }

  /**
   * Removes a specific dependency relationship from the cache.
   * @param sourceId The source task ID
   * @param targetId The target task ID
   * @param type The specific dependency type to remove
   */
  removeDependency(sourceId: string, targetId: string, type: DependencyType): void {
    const typeKey = `${sourceId}${DependencyCache.TYPE_KEY_SEPARATOR}${targetId}`;
    const types = this.dependencyTypes.get(typeKey);
    
    if (types && types.has(type)) {
      types.delete(type);
      
      // If no more types for this relationship, remove from ID mappings
      if (types.size === 0) {
        this.dependencyTypes.delete(typeKey);
        
        // Remove from bidirectional ID mappings
        const dependents = this.dependentIds.get(sourceId);
        if (dependents) {
          dependents.delete(targetId);
          if (dependents.size === 0) {
            this.dependentIds.delete(sourceId);
          }
        }
        
        const dependencies = this.dependencyIds.get(targetId);
        if (dependencies) {
          dependencies.delete(sourceId);
          if (dependencies.size === 0) {
            this.dependencyIds.delete(targetId);
          }
        }
      }
      
      console.log(`➖ [DEPENDENCY CACHE] Removed dependency: ${sourceId} -${type}-> ${targetId}`);
    }
  }

  /**
   * Removes all dependencies involving the given task.
   * @param taskId The task ID to remove all dependencies for
   */
  removeTask(taskId: string): void {
    let removedCount = 0;
    
    // Remove all dependencies where this task is the source
    const dependents = this.dependentIds.get(taskId) || new Set();
    for (const dependentId of dependents) {
      const typeKey = `${taskId}${DependencyCache.TYPE_KEY_SEPARATOR}${dependentId}`;
      const types = this.dependencyTypes.get(typeKey) || new Set();
      removedCount += types.size;
      
      this.dependencyTypes.delete(typeKey);
      
      // Remove from target's dependency list
      const targetDependencies = this.dependencyIds.get(dependentId);
      if (targetDependencies) {
        targetDependencies.delete(taskId);
        if (targetDependencies.size === 0) {
          this.dependencyIds.delete(dependentId);
        }
      }
    }
    
    // Remove all dependencies where this task is the target
    const dependencies = this.dependencyIds.get(taskId) || new Set();
    for (const dependencyId of dependencies) {
      const typeKey = `${dependencyId}${DependencyCache.TYPE_KEY_SEPARATOR}${taskId}`;
      const types = this.dependencyTypes.get(typeKey) || new Set();
      removedCount += types.size;
      
      this.dependencyTypes.delete(typeKey);
      
      // Remove from source's dependent list
      const sourceDependents = this.dependentIds.get(dependencyId);
      if (sourceDependents) {
        sourceDependents.delete(taskId);
        if (sourceDependents.size === 0) {
          this.dependentIds.delete(dependencyId);
        }
      }
    }
    
    // Clear this task's entries
    this.dependentIds.delete(taskId);
    this.dependencyIds.delete(taskId);
    
    if (removedCount > 0) {
      console.log(`🗑️ [DEPENDENCY CACHE] Removed task ${taskId} with ${removedCount} dependencies`);
    }
  }

  /**
   * Updates the dependencies for a specific task and returns the changes made.
   * This method compares the new dependencies with the existing ones and
   * updates the cache accordingly, returning a change set for external use.
   * 
   * @param taskId The ID of the task whose dependencies are being updated
   * @param newDependencies Array of new dependencies for the task
   * @returns DependencyChangeSet containing added and removed dependencies
   */
  updateTaskDependencies(taskId: string, newDependencies: Dependency[]): DependencyChangeSet {
    console.log(`🔄 [DEPENDENCY CACHE] Updating dependencies for task ${taskId}`);
    
    // Get current dependencies for comparison
    const currentDependencies = this.getDependencies(taskId);
    
    // Convert to sets for efficient comparison
    const currentDepSet = new Set(currentDependencies.map(dep => `${dep.taskId}:${dep.type}`));
    const newDepSet = new Set(newDependencies.map(dep => `${dep.taskId}:${dep.type}`));
    
    // Calculate changes
    const addedDependencies: Array<{sourceId: string, targetId: string, type: DependencyType}> = [];
    const removedDependencies: Array<{sourceId: string, targetId: string, type: DependencyType}> = [];
    
    // Find dependencies to remove (in current but not in new)
    for (const currentDep of currentDependencies) {
      const depKey = `${currentDep.taskId}:${currentDep.type}`;
      if (!newDepSet.has(depKey)) {
        removedDependencies.push({
          sourceId: currentDep.taskId,
          targetId: taskId,
          type: currentDep.type
        });
        this.removeDependency(currentDep.taskId, taskId, currentDep.type);
      }
    }
    
    // Find dependencies to add (in new but not in current)
    for (const newDep of newDependencies) {
      const depKey = `${newDep.taskId}:${newDep.type}`;
      if (!currentDepSet.has(depKey)) {
        addedDependencies.push({
          sourceId: newDep.taskId,
          targetId: taskId,
          type: newDep.type
        });
        this.addDependency(newDep.taskId, taskId, newDep.type);
      }
    }
    
    const changeSet: DependencyChangeSet = {
      addedDependencies,
      removedDependencies
    };
    
    // Log summary of changes
    if (addedDependencies.length > 0 || removedDependencies.length > 0) {
      console.log(`✅ [DEPENDENCY CACHE] Updated task ${taskId}: +${addedDependencies.length} -${removedDependencies.length} dependencies`);
    } else {
      console.log(`⚡ [DEPENDENCY CACHE] No dependency changes for task ${taskId}`);
    }
    
    return changeSet;
  }

  /**
   * Gets all tasks that directly or indirectly depend on the given task (transitive closure).
   * For example: if A -> B -> C, calling getAllDownstreamDependents('A') returns ['B', 'C'].
   * 
   * @param taskId The task ID to find all downstream dependents for
   * @returns Array of task IDs that directly or indirectly depend on this task
   */
  getAllDownstreamDependents(taskId: string): string[] {
    const result = new Set<string>();
    const visited = new Set<string>();
    
    const traverse = (currentTaskId: string) => {
      if (visited.has(currentTaskId)) return;
      visited.add(currentTaskId);
      
      const directDependents = this.dependentIds.get(currentTaskId) || new Set();
      for (const dependentId of directDependents) {
        if (!result.has(dependentId)) {
          result.add(dependentId);
          traverse(dependentId); // Recursively find dependents of dependents
        }
      }
    };
    
    traverse(taskId);
    return Array.from(result);
  }

  /**
   * Gets all tasks that the given task directly or indirectly depends on (transitive closure).
   * For example: if A -> B -> C, calling getAllUpstreamDependencies('C') returns ['A', 'B'].
   * 
   * @param taskId The task ID to find all upstream dependencies for
   * @returns Array of task IDs that this task directly or indirectly depends on
   */
  getAllUpstreamDependencies(taskId: string): string[] {
    const result = new Set<string>();
    const visited = new Set<string>();
    
    const traverse = (currentTaskId: string) => {
      if (visited.has(currentTaskId)) return;
      visited.add(currentTaskId);
      
      const directDependencies = this.dependencyIds.get(currentTaskId) || new Set();
      for (const dependencyId of directDependencies) {
        if (!result.has(dependencyId)) {
          result.add(dependencyId);
          traverse(dependencyId); // Recursively find dependencies of dependencies
        }
      }
    };
    
    traverse(taskId);
    return Array.from(result);
  }

  /**
   * Gets cache statistics for debugging and monitoring.
   */
  getStats(): { totalDependencies: number, tasksWithDependencies: number, tasksWithDependents: number } {
    let totalDependencies = 0;
    this.dependencyTypes.forEach(types => {
      totalDependencies += types.size;
    });
    
    return {
      totalDependencies,
      tasksWithDependencies: this.dependencyIds.size,
      tasksWithDependents: this.dependentIds.size
    };
  }

  /**
   * Clears all cached data.
   */
  private clear(): void {
    this.dependentIds.clear();
    this.dependencyIds.clear();
    this.dependencyTypes.clear();
  }

  /**
   * Internal method to add a dependency without logging.
   */
  private addDependencyInternal(sourceId: string, targetId: string, type: DependencyType): void {
    // Add to bidirectional ID mappings
    this.addToSetMap(this.dependentIds, sourceId, targetId);
    this.addToSetMap(this.dependencyIds, targetId, sourceId);
    
    // Add to type mapping with collision-safe separator
    const typeKey = `${sourceId}${DependencyCache.TYPE_KEY_SEPARATOR}${targetId}`;
    this.addToSetMap(this.dependencyTypes, typeKey, type);
  }

  /**
   * Helper method to add a value to a Map<string, Set<T>>.
   */
  private addToSetMap<T>(map: Map<string, Set<T>>, key: string, value: T): void {
    if (!map.has(key)) {
      map.set(key, new Set());
    }
    map.get(key)!.add(value);
  }
}
