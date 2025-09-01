import { TaskFilterPipe, TaskFilter } from './task-filter.pipe';
import { Task, Status, DependencyType } from '../domain/Task';

describe('TaskFilterPipe', () => {
  let pipe: TaskFilterPipe;
  let tasks: Task[];

  beforeEach(() => {
    pipe = new TaskFilterPipe();
    
    // Test-Tasks erstellen
    tasks = [
      { 
        id: '1', 
        title: 'Task 1', 
        status: Status.OPEN, 
        dependencies: [],
        children: [],
        group: 'group1',
        scheduleFinalized: false,
        milestone: false,
        computeFromChildren: false,
        progress: 0,
        ticketUrl: '',
        computedStart: new Date('2024-01-01'),
        computedEnd: new Date('2024-01-05')
      },
      { 
        id: '2', 
        title: 'Task 2', 
        status: Status.IN_PROGRESS, 
        dependencies: [{ taskId: '1', type: DependencyType.FS }],
        children: [],
        group: 'group1',
        scheduleFinalized: false,
        milestone: false,
        computeFromChildren: false,
        progress: 50,
        ticketUrl: '',
        computedStart: new Date('2024-01-06'),
        computedEnd: new Date('2024-01-10')
      },
      { 
        id: '3', 
        title: 'Done Task', 
        status: Status.DONE, 
        dependencies: [],
        children: [],
        group: 'group2',
        scheduleFinalized: true,
        milestone: false,
        computeFromChildren: false,
        progress: 100,
        ticketUrl: '',
        computedStart: new Date('2024-01-01'),
        computedEnd: new Date('2024-01-03')
      },
      { 
        id: '4', 
        title: 'Archived Task', 
        status: Status.ARCHIVED, 
        dependencies: [],
        children: [],
        group: 'group2',
        scheduleFinalized: true,
        milestone: false,
        computeFromChildren: false,
        progress: 100,
        ticketUrl: '',
        computedStart: new Date('2023-12-01'),
        computedEnd: new Date('2023-12-05')
      },
      { 
        id: '5', 
        title: 'Parent Task', 
        status: Status.OPEN, 
        dependencies: [],
        children: ['6'],
        group: 'group1',
        scheduleFinalized: false,
        milestone: false,
        computeFromChildren: true,
        progress: 25,
        ticketUrl: '',
        computedStart: new Date('2024-01-15'),
        computedEnd: new Date('2024-01-20')
      },
      { 
        id: '6', 
        title: 'Child Task', 
        status: Status.IN_PROGRESS, 
        dependencies: [],
        children: [],
        group: 'group1',
        scheduleFinalized: false,
        milestone: false,
        computeFromChildren: false,
        progress: 25,
        ticketUrl: '',
        computedStart: new Date('2024-01-15'),
        computedEnd: new Date('2024-01-20')
      }
    ];
  });

  it('should create an instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('should return all tasks when no filter is applied', () => {
    const filter: TaskFilter = {
      taskFilter: '',
      showDownstreamDeps: false,
      showUpstreamDeps: false,
      showOpenTasks: true,
      showInProgressTasks: true,
      showDoneTasks: true,
      showArchivedTasks: true
    };

    const result = pipe.transform(tasks, filter);
    expect(result.length).toBe(6);
  });

  it('should filter by task title', () => {
    const filter: TaskFilter = {
      taskFilter: 'Task 1',
      showDownstreamDeps: false,
      showUpstreamDeps: false,
      showOpenTasks: true,
      showInProgressTasks: true,
      showDoneTasks: true,
      showArchivedTasks: true
    };

    const result = pipe.transform(tasks, filter);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('1');
  });

  it('should filter by status - only open tasks', () => {
    const filter: TaskFilter = {
      taskFilter: '',
      showDownstreamDeps: false,
      showUpstreamDeps: false,
      showOpenTasks: true,
      showInProgressTasks: false,
      showDoneTasks: false,
      showArchivedTasks: false
    };

    const result = pipe.transform(tasks, filter);
    expect(result.length).toBe(2); // Task 1 and Parent Task
    expect(result.every(task => task.status === Status.OPEN)).toBe(true);
  });

  it('should include downstream dependencies', () => {
    const filter: TaskFilter = {
      taskFilter: 'Task 1',
      showDownstreamDeps: true,
      showUpstreamDeps: false,
      showOpenTasks: true,
      showInProgressTasks: true,
      showDoneTasks: true,
      showArchivedTasks: true
    };

    const result = pipe.transform(tasks, filter);
    expect(result.length).toBe(2); // Task 1 + Task 2 (depends on Task 1)
    expect(result.some(task => task.id === '1')).toBe(true);
    expect(result.some(task => task.id === '2')).toBe(true);
  });

  it('should include upstream dependencies', () => {
    const filter: TaskFilter = {
      taskFilter: 'Task 2',
      showDownstreamDeps: false,
      showUpstreamDeps: true,
      showOpenTasks: true,
      showInProgressTasks: true,
      showDoneTasks: true,
      showArchivedTasks: true
    };

    const result = pipe.transform(tasks, filter);
    expect(result.length).toBe(2); // Task 2 + Task 1 (Task 2 depends on it)
    expect(result.some(task => task.id === '1')).toBe(true);
    expect(result.some(task => task.id === '2')).toBe(true);
  });

  it('should include parent when child matches filter', () => {
    const filter: TaskFilter = {
      taskFilter: 'Child Task',
      showDownstreamDeps: false,
      showUpstreamDeps: false,
      showOpenTasks: true,
      showInProgressTasks: true,
      showDoneTasks: true,
      showArchivedTasks: true
    };

    const result = pipe.transform(tasks, filter);
    expect(result.length).toBe(2); // Parent Task + Child Task
    expect(result.some(task => task.id === '5')).toBe(true); // Parent
    expect(result.some(task => task.id === '6')).toBe(true); // Child
  });

  it('should return empty array when no tasks provided', () => {
    const filter: TaskFilter = {
      taskFilter: '',
      showDownstreamDeps: false,
      showUpstreamDeps: false,
      showOpenTasks: true,
      showInProgressTasks: true,
      showDoneTasks: true,
      showArchivedTasks: true
    };

    const result = pipe.transform([], filter);
    expect(result).toEqual([]);
  });

  it('should return original tasks when no filter provided', () => {
    const result = pipe.transform(tasks, null as any);
    expect(result).toEqual(tasks);
  });
});
