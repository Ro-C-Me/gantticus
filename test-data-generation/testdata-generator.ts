import { Chart } from '../src/app/domain/Chart';
import { Task, Dependency, DependencyType, Status, Group } from '../src/app/domain/Task';
import { ChartFilter } from '../src/app/domain/ChartFilter';

/**
 * Generator für Testdaten mit spezifizierten Anforderungen:
 * - 250 Tasks insgesamt
 * - 50 Tasks mit Sub-Tasks (max. Tiefe 5)
 * - Jeder Task max. einmal als Kind referenziert
 * - Keine zirkulären Abhängigkeiten
 * - 2/3 der Tasks haben Dependencies zu anderen Tasks
 */
export class TestDataGenerator {
  private readonly totalTasks = 250;
  private readonly tasksWithSubTasks = 50;
  private readonly maxDepth = 5;
  private readonly dependencyRatio = 2 / 3;
  
  private taskCounter = 0;
  private allTasks: Task[] = [];
  private usedChildIds = new Set<string>();
  private taskHierarchy = new Map<string, string[]>(); // parentId -> childIds

  /**
   * Generiert ein vollständiges Chart mit Testdaten
   */
  generateTestChart(): Chart {
    console.log('Generiere Testdaten...');
    
    this.reset();
    
    const chart = new Chart();
    chart.id = 'test-chart-' + Date.now();
    chart.name = 'Test Chart mit 250 Tasks';
    chart.filter = new ChartFilter();
    chart.expanded = new Set<string>();
    
    // Generiere Gruppen
    chart.groups = this.generateGroups();
    
    // Generiere Tasks in hierarchischen Strukturen
    chart.tasks = this.generateTasks();
    
    // Setze Start- und Enddaten für alle Tasks
    this.setTaskDates(chart.tasks);
    
    // Füge Dependencies hinzu
    this.addDependencies(chart.tasks);
    
    console.log(`Chart generiert: ${chart.tasks.length} Tasks, ${this.countSubTasks()} Sub-Tasks, ${this.countDependencies(chart.tasks)} Dependencies`);
    
    return chart;
  }

  private reset(): void {
    this.taskCounter = 0;
    this.allTasks = [];
    this.usedChildIds.clear();
    this.taskHierarchy.clear();
  }

  private generateGroups(): Group[] {
    const groups: Group[] = [];
    
    // Keine DEFAULT_GROUP_ID - diese wird von der Anwendung automatisch erstellt
    
    // Zusätzliche Gruppen
    const groupNames = ['Frontend', 'Backend', 'Testing', 'Deployment', 'Documentation'];
    const colors = ['#007bff', '#28a745', '#ffc107', '#dc3545', '#6f42c1'];
    
    for (let i = 0; i < groupNames.length; i++) {
      const group = new Group();
      group.id = `group-${i + 1}`;
      group.title = groupNames[i];
      group.color = colors[i];
      groups.push(group);
    }
    
    return groups;
  }

  private generateTasks(): Task[] {
    // Erstelle alle Root-Tasks
    const rootTasksCount = this.totalTasks - this.calculateTotalSubTasks();
    
    // Generiere Root-Tasks (davon werden 50 Sub-Tasks bekommen)
    for (let i = 0; i < rootTasksCount; i++) {
      const task = this.createTask(`Root Task ${i + 1}`, null);
      this.allTasks.push(task);
    }
    
    // Wähle 50 zufällige Root-Tasks aus und füge ihnen Sub-Tasks hinzu
    const rootTasksWithSubTasks = this.shuffleArray([...this.allTasks])
      .slice(0, this.tasksWithSubTasks);
    
    for (const parentTask of rootTasksWithSubTasks) {
      this.generateSubTasksRecursively(parentTask, 1);
    }
    
    return this.allTasks;
  }

  private generateSubTasksRecursively(parentTask: Task, currentDepth: number): void {
    if (currentDepth > this.maxDepth) {
      return;
    }
    
    // Zufällige Anzahl von Sub-Tasks (1-4)
    const subTaskCount = Math.floor(Math.random() * 4) + 1;
    
    for (let i = 0; i < subTaskCount; i++) {
      const subTask = this.createTask(
        `${parentTask.title} - Sub ${currentDepth}.${i + 1}`,
        parentTask.group || undefined
      );
      
      this.allTasks.push(subTask);
      
      // Verknüpfe Parent mit Child
      parentTask.children.push(subTask.id);
      this.usedChildIds.add(subTask.id);
      
      if (!this.taskHierarchy.has(parentTask.id)) {
        this.taskHierarchy.set(parentTask.id, []);
      }
      this.taskHierarchy.get(parentTask.id)!.push(subTask.id);
      
      // Rekursiv weitere Sub-Tasks generieren (mit abnehmender Wahrscheinlichkeit)
      const continueProbability = Math.max(0.1, 0.7 - (currentDepth * 0.2));
      if (Math.random() < continueProbability && currentDepth < this.maxDepth) {
        this.generateSubTasksRecursively(subTask, currentDepth + 1);
      }
    }
  }

  private createTask(title: string, groupId: string | null | undefined): Task {
    const task = new Task();
    task.id = `task-${String(++this.taskCounter).padStart(6, '0')}`;
    task.title = title;
    task.status = this.getRandomStatus();
    task.progress = Math.random();
    task.group = groupId || this.getRandomGroupId();
    task.milestone = Math.random() < 0.1; // 10% Meilensteine
    task.scheduleFinalized = Math.random() < 0.3;
    task.computeFromChildren = Math.random() < 0.2;
    task.duration = Math.floor(Math.random() * 10) + 1; // 1-10 Tage
    
    // Zufällige Farbe (optional)
    if (Math.random() < 0.2) {
      task.color = this.getRandomColor();
    }
    
    return task;
  }

  private setTaskDates(tasks: Task[]): void {
    const baseDate = new Date('2025-01-01');
    
    for (const task of tasks) {
      const startOffset = Math.floor(Math.random() * 365); // Bis zu 1 Jahr
      task.start = new Date(baseDate.getTime() + startOffset * 24 * 60 * 60 * 1000);
      
      const duration = task.duration || 5;
      task.end = new Date(task.start.getTime() + duration * 24 * 60 * 60 * 1000);
      
      task.computedStart = task.start;
      task.computedEnd = task.end;
      
      // Gelegentlich earliestBegin und latestEnd setzen
      if (Math.random() < 0.3) {
        task.earliestBegin = new Date(task.start.getTime() - 7 * 24 * 60 * 60 * 1000);
      }
      if (Math.random() < 0.3) {
        task.latestEnd = new Date(task.end.getTime() + 7 * 24 * 60 * 60 * 1000);
      }
    }
  }

  private addDependencies(tasks: Task[]): void {
    const tasksWithDependencies = Math.floor(tasks.length * this.dependencyRatio);
    const shuffledTasks = this.shuffleArray([...tasks]);
    
    for (let i = 0; i < tasksWithDependencies; i++) {
      const task = shuffledTasks[i];
      const dependencyCount = Math.floor(Math.random() * 3) + 1; // 1-3 Dependencies
      
      const availableTargets = tasks.filter(t => 
        t.id !== task.id && 
        !this.wouldCreateCircularDependency(task.id, t.id)
      );
      
      if (availableTargets.length === 0) continue;
      
      const shuffledTargets = this.shuffleArray(availableTargets);
      
      for (let j = 0; j < Math.min(dependencyCount, shuffledTargets.length); j++) {
        const targetTask = shuffledTargets[j];
        
        const dependency = new Dependency();
        dependency.taskId = targetTask.id;
        dependency.type = this.getRandomDependencyType();
        
        task.dependencies.push(dependency);
      }
    }
  }

  private wouldCreateCircularDependency(fromTaskId: string, toTaskId: string): boolean {
    // Prüfe, ob toTask bereits eine direkte oder indirekte Abhängigkeit zu fromTask hat
    const visited = new Set<string>();
    return this.hasPathThroughDependencies(toTaskId, fromTaskId, visited);
  }

  private hasPathThroughDependencies(currentTaskId: string, targetTaskId: string, visited: Set<string>): boolean {
    if (visited.has(currentTaskId)) return false;
    visited.add(currentTaskId);
    
    const currentTask = this.allTasks.find(t => t.id === currentTaskId);
    if (!currentTask) return false;
    
    for (const dep of currentTask.dependencies) {
      if (dep.taskId === targetTaskId) return true;
      if (this.hasPathThroughDependencies(dep.taskId, targetTaskId, visited)) return true;
    }
    
    return false;
  }

  private calculateTotalSubTasks(): number {
    // Schätzung der Sub-Tasks basierend auf durchschnittlicher Hierarchie
    // Bei max. Tiefe 5 und durchschnittlich 2 Sub-Tasks pro Ebene
    let estimate = 0;
    for (let i = 1; i <= this.maxDepth; i++) {
      estimate += this.tasksWithSubTasks * Math.pow(2, i - 1) * Math.pow(0.6, i - 1);
    }
    return Math.floor(estimate);
  }

  private getRandomStatus(): Status {
    const statuses = [Status.OPEN, Status.IN_PROGRESS, Status.DONE, Status.ARCHIVED];
    const weights = [0.4, 0.3, 0.25, 0.05]; // Gewichtung
    
    const random = Math.random();
    let cumulative = 0;
    
    for (let i = 0; i < weights.length; i++) {
      cumulative += weights[i];
      if (random <= cumulative) {
        return statuses[i];
      }
    }
    
    return Status.OPEN;
  }

  private getRandomGroupId(): string | undefined {
    const groupIds = ['group-1', 'group-2', 'group-3', 'group-4', 'group-5'];
    // 30% Chance auf keine Gruppe (undefined) - wird zur DEFAULT_GROUP_ID von der App
    if (Math.random() < 0.3) {
      return undefined;
    }
    return groupIds[Math.floor(Math.random() * groupIds.length)];
  }

  private getRandomDependencyType(): DependencyType {
    const types = [DependencyType.FS, DependencyType.FF, DependencyType.SS, DependencyType.SF];
    const weights = [0.7, 0.15, 0.1, 0.05]; // FS ist am häufigsten
    
    const random = Math.random();
    let cumulative = 0;
    
    for (let i = 0; i < weights.length; i++) {
      cumulative += weights[i];
      if (random <= cumulative) {
        return types[i];
      }
    }
    
    return DependencyType.FS;
  }

  private getRandomColor(): string {
    const colors = [
      '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7',
      '#dda0dd', '#98d8c8', '#f7dc6f', '#bb8fce', '#85c1e9'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private countSubTasks(): number {
    return this.allTasks.filter(task => this.usedChildIds.has(task.id)).length;
  }

  private countDependencies(tasks: Task[]): number {
    return tasks.reduce((count, task) => count + task.dependencies.length, 0);
  }

  /**
   * Exportiert das generierte Chart als JSON-String
   */
  generateTestDataAsJson(): string {
    const chart = this.generateTestChart();
    return JSON.stringify(chart, null, 2);
  }

  /**
   * Generiert mehrere Charts für umfangreichere Tests
   */
  generateMultipleTestCharts(count: number): Chart[] {
    const charts: Chart[] = [];
    
    for (let i = 0; i < count; i++) {
      this.reset();
      const chart = this.generateTestChart();
      chart.id = `test-chart-${i + 1}-${Date.now()}`;
      chart.name = `Test Chart ${i + 1}`;
      charts.push(chart);
    }
    
    return charts;
  }

  /**
   * Validiert die generierten Daten auf Konsistenz
   */
  validateGeneratedData(chart: Chart): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Prüfe Gesamtanzahl Tasks
    if (chart.tasks.length !== this.totalTasks) {
      errors.push(`Erwartete ${this.totalTasks} Tasks, gefunden: ${chart.tasks.length}`);
    }
    
    // Prüfe eindeutige IDs
    const ids = chart.tasks.map(t => t.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      errors.push('Doppelte Task-IDs gefunden');
    }
    
    // Prüfe Kinder-Referenzen
    for (const task of chart.tasks) {
      for (const childId of task.children) {
        const childTask = chart.tasks.find(t => t.id === childId);
        if (!childTask) {
          errors.push(`Task ${task.id} referenziert nicht existierendes Kind: ${childId}`);
        }
      }
    }
    
    // Prüfe auf mehrfach referenzierte Kinder
    const allChildIds = chart.tasks.flatMap(t => t.children);
    const childIdCounts = new Map<string, number>();
    
    for (const childId of allChildIds) {
      childIdCounts.set(childId, (childIdCounts.get(childId) || 0) + 1);
    }
    
    for (const [childId, count] of childIdCounts) {
      if (count > 1) {
        errors.push(`Task ${childId} wird von ${count} Tasks als Kind referenziert`);
      }
    }
    
    // Prüfe Dependencies
    for (const task of chart.tasks) {
      for (const dep of task.dependencies) {
        const depTask = chart.tasks.find(t => t.id === dep.taskId);
        if (!depTask) {
          errors.push(`Task ${task.id} hat Dependency zu nicht existierendem Task: ${dep.taskId}`);
        }
      }
    }
    
    // Prüfe Dependency-Ratio
    const tasksWithDeps = chart.tasks.filter(t => t.dependencies.length > 0).length;
    const actualRatio = tasksWithDeps / chart.tasks.length;
    const expectedRatio = this.dependencyRatio;
    
    if (Math.abs(actualRatio - expectedRatio) > 0.1) {
      warnings.push(`Dependency-Ratio: erwartet ~${(expectedRatio * 100).toFixed(0)}%, tatsächlich ${(actualRatio * 100).toFixed(0)}%`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats: {
        totalTasks: chart.tasks.length,
        subTasks: this.countSubTasks(),
        tasksWithDependencies: tasksWithDeps,
        totalDependencies: this.countDependencies(chart.tasks)
      }
    };
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalTasks: number;
    subTasks: number;
    tasksWithDependencies: number;
    totalDependencies: number;
  };
}
