// Performance Logger für ngx-gantt Debugging
// Dieses Service kann in die ngx-gantt Komponenten eingebaut werden um Render-Zeiten zu messen

export class GanttPerformanceLogger {
  private static timers: Map<string, number> = new Map();
  private static enabled = true;

  static setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  static startTimer(operation: string, details?: any) {
    if (!this.enabled) return;
    
    const key = operation;
    const timestamp = performance.now();
    this.timers.set(key, timestamp);
    
    console.log(`🟡 [GANTT PERF] START ${operation}`, details || '');
  }

  static endTimer(operation: string, details?: any) {
    if (!this.enabled) return;
    
    const key = operation;
    const startTime = this.timers.get(key);
    
    if (startTime) {
      const duration = performance.now() - startTime;
      const color = duration > 50 ? '🔴' : duration > 20 ? '🟠' : '🟢';
      
      console.log(`${color} [GANTT PERF] END   ${operation} - ${duration.toFixed(2)}ms`, details || '');
      this.timers.delete(key);
    } else {
      console.warn(`⚠️ [GANTT PERF] Timer "${operation}" was not started`);
    }
  }

  static measureSync<T>(operation: string, fn: () => T, details?: any): T {
    if (!this.enabled) return fn();
    
    this.startTimer(operation, details);
    try {
      const result = fn();
      this.endTimer(operation, details);
      return result;
    } catch (error) {
      this.endTimer(operation, `ERROR: ${error}`);
      throw error;
    }
  }

  static async measureAsync<T>(operation: string, fn: () => Promise<T>, details?: any): Promise<T> {
    if (!this.enabled) return fn();
    
    this.startTimer(operation, details);
    try {
      const result = await fn();
      this.endTimer(operation, details);
      return result;
    } catch (error) {
      this.endTimer(operation, `ERROR: ${error}`);
      throw error;
    }
  }

  static logItemsCount(operation: string, items: any[], groups?: any[]) {
    if (!this.enabled) return;
    
    console.log(`📊 [GANTT PERF] ${operation}:`, {
      items: items.length,
      groups: groups?.length || 0,
      totalElements: (groups?.length || 0) + items.length
    });
  }
}

// Patch-Definitionen für die wichtigsten ngx-gantt Methoden
export const GANTT_PERFORMANCE_PATCHES = {
  // Patch für gantt-upper.ts setupItems()
  setupItemsPatch: `
    private setupItems() {
        GanttPerformanceLogger.measureSync('setupItems', () => {
            this.originItems = uniqBy(this.originItems, 'id');
            this.items = [];
            if (this.groups.length > 0) {
                this.originItems.forEach((origin) => {
                    const group = this.groupsMap[origin.group_id];
                    if (group) {
                        const item = new GanttItemInternal(origin, 0, this.view);
                        group.items.push(item);
                    }
                });
            } else {
                this.originItems.forEach((origin) => {
                    const item = new GanttItemInternal(origin, 0, this.view);
                    this.items.push(item);
                });
            }
        }, { 
            itemsCount: this.originItems.length, 
            groupsCount: this.groups.length 
        });
    }
  `,

  // Patch für ngOnChanges
  ngOnChangesPatch: `
    ngOnChanges(changes: SimpleChanges) {
        GanttPerformanceLogger.startTimer('ngOnChanges', changes);
        
        if (!this.firstChange) {
            if (changes.viewType && changes.viewType.currentValue && changes.viewType.currentValue !== changes.viewType.previousValue) {
                GanttPerformanceLogger.measureSync('changeView', () => {
                    this.changeView(changes.viewType.currentValue);
                });
            }
            if (changes.viewOptions) {
                GanttPerformanceLogger.measureSync('changeView-viewOptions', () => {
                    this.changeView(this.viewType);
                });
            }
            if (changes.originItems || changes.originGroups) {
                GanttPerformanceLogger.measureSync('dataChange', () => {
                    this.setupExpandedState();
                    this.setupGroups();
                    this.setupItems();
                    this.computeRefs();
                }, {
                    itemsChanged: !!changes.originItems,
                    groupsChanged: !!changes.originGroups
                });
            }

            if (changes.originBaselineItems) {
                GanttPerformanceLogger.measureSync('setupBaselineItems', () => {
                    this.setupBaselineItems();
                    this.computeItemsRefs(...this.baselineItems);
                });
            }
        }
        
        GanttPerformanceLogger.endTimer('ngOnChanges');
    }
  `,

  // Patch für computeItemsRefs
  computeItemsRefsPatch: `
    computeItemsRefs(...items: GanttItemInternal[] | GanttBaselineItemInternal[]) {
        GanttPerformanceLogger.measureSync('computeItemsRefs', () => {
            items.forEach((item) => {
                item.updateRefs({
                    width: this.view.width,
                    start: this.view.start.value,
                    end: this.view.end.value
                });
            });
        }, { itemsCount: items.length });
    }
  `
};
