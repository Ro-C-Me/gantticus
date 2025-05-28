import { jsonObject, jsonArrayMember, jsonMember } from 'typedjson';
@jsonObject
export class BaseItem {
  @jsonMember
  id: string = '';

  @jsonMember({
    deserializer: (value: any) => value as 'task' | 'group',
    serializer: (value: 'task' | 'group') => value
  })
  type: 'task' | 'group' = 'task';
}
@jsonObject
export class Task {

    @jsonMember
    id: string = '';

    @jsonMember
    title: string = '';

    @jsonMember
    color?: string;

    @jsonMember
    computedStart : Date = new Date();

    @jsonMember
    computedEnd : Date = new Date();

    @jsonArrayMember(String)
    dependsOn : string[] = [];

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

    toBaseItem() : BaseItem {
      return {id : this.id, type : 'task'};
    }
  }

  @jsonObject
    export class Group {

    @jsonMember
    id: string = '';

    @jsonMember
    title: string = '';

    @jsonMember
    color?: string;

    @jsonArrayMember(BaseItem)
    children : BaseItem [] = [];

    toBaseItem() : BaseItem {
      return {id : this.id, type : 'group'};
    }
  }