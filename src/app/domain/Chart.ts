import { Group, Task } from "./Task";
import { jsonObject, jsonArrayMember, jsonMember, jsonSetMember } from 'typedjson';


@jsonObject
export class Chart {

    @jsonMember
    name: string = "";

    @jsonMember
    id: string = "";

    @jsonArrayMember(Task)
    tasks: Task[] = [];

    @jsonArrayMember(Group)
    groups : Group[] = [];

    @jsonSetMember(String)
    expanded: Set<string> = new Set<string>();

}