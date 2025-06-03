import { Group, Task } from "./Task";
import { jsonObject, jsonArrayMember, jsonMember } from 'typedjson';


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

}