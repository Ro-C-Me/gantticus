export interface BaseItem {
  id: string;
  type: 'task' | 'group';
}
export class Task {
    readonly type = 'task';

    id: string;
    title: string = '';
    computedStart : Date;
    computedEnd : Date;

    dependsOn : string[];

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

    toBaseItem() : BaseItem {
      return {id : this.id, type : 'task'};
    }
  }

  export class Group {
    readonly type = 'group';

    id: string = '';
    title: string = '';

    children : BaseItem [];

    constructor(init?: Partial<Group>) {
      Object.assign(this, init);
      if (init?.children == undefined) {
        this.children = [];
      }
      else {
        this.children = init.children;
      }
    }

    toBaseItem() : BaseItem {
      return {id : this.id, type : 'group'};
    }
  }