export class Task {
    id: string;
    title: string = '';
    computedStart : Date;
    computedEnd : Date;

    dependsOn : Task[];

    start?: Date;
    end?: Date;
    earliestBegin?: Date;
    latestEnd?: Date;
    duration?: number; // z.B. in Stunden oder Tagen
    milestone: boolean = false;

    constructor(init?: Partial<Task>) {
      Object.assign(this, init);
      this.id = init?.id ?? 'NO_REAL_ID';
      this.computedStart = init?.computedStart ?? new Date();
      this.computedEnd = init?.computedEnd ?? new Date();
      this.milestone = init?.milestone ?? false;
      this.dependsOn = init?.dependsOn ?? [];
    }

  }

  export class Group {
    id: string = '';
    title: string = '';

    children : (Task | Group) [];

    constructor(init?: Partial<Task>) {
      Object.assign(this, init);
      this.children = [];
    }
  }