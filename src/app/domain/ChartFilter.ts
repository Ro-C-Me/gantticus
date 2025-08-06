import { jsonObject, jsonMember } from 'typedjson';

@jsonObject
export class ChartFilter {
    @jsonMember
    taskFilter: string = '';
    
    @jsonMember
    showDownstreamDeps: boolean = false;
    
    @jsonMember
    showUpstreamDeps: boolean = false;
    
    @jsonMember
    showOpenTasks: boolean = true;
    
    @jsonMember
    showInProgressTasks: boolean = true;
    
    @jsonMember
    showDoneTasks: boolean = true;
    
    @jsonMember
    showArchivedTasks: boolean = false;
}
