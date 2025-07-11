import { jsonObject, jsonArrayMember, jsonMember } from 'typedjson';

export enum DependencyType {
  FS = 'fs',
  FF = 'ff',
  SS = 'ss',
  SF = 'sf'
}

@jsonObject
export class Dependency {

  @jsonMember
  taskId: string = '';

  @jsonMember
  type: DependencyType = DependencyType.FS;
}
@jsonObject
export class Task {

    @jsonMember
    id: string = '';

    @jsonMember
    title: string = '';

    @jsonMember
    ticketUrl: string = '';

    @jsonMember
    color?: string;

    @jsonMember
    scheduleFinalized: boolean = false;

    @jsonMember
    computedStart : Date = new Date();

    @jsonMember
    computedEnd : Date = new Date();

    @jsonArrayMember(Dependency)
    dependencies : Dependency[] = [];

    @jsonMember
    start?: Date;

    @jsonMember
    end?: Date;

    @jsonMember
    earliestBegin?: Date;

    @jsonMember
    latestEnd?: Date;

    @jsonMember
    duration?: number; // z.B. in Stunden oder Tagen

    @jsonMember
    milestone: boolean = false;

    @jsonMember
    group?: string;
  }


  @jsonObject
    export class Group {

    static readonly DEFAULT_GROUP_ID = "DEFAULT_GROUP_ID";
    @jsonMember
    id: string = '';

    @jsonMember
    title: string = '';

    @jsonMember
    color?: string;

  }