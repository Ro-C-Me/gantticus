import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { WorkTimeService, WorkTimeBlock, DaySummary } from './work-time.service';
import { 
  WeekView, 
  getCurrentWeek, 
  getPreviousWeek, 
  getNextWeek, 
  formatWeekRange,
  isSameDay,
  isWeekend
} from '../../core/work-time/week-utils';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-time-tracking',
  templateUrl: './time-tracking.component.html',
  styleUrl: './time-tracking.component.scss',
  standalone: false
})
export class TimeTrackingComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('timelineScroll') timelineScroll?: ElementRef<HTMLDivElement>;
  
  title = 'Time Tracking';
  currentWeek: WeekView = getCurrentWeek();
  hours: number[] = Array.from({ length: 24 }, (_, i) => i); // 0-23
  
  // Blöcke der aktuellen Woche, gruppiert nach Tag
  weekBlocks: Map<string, WorkTimeBlock[]> = new Map();
  
  // Summen
  daySums: Map<string, number> = new Map(); // Millisekunden pro Tag
  weekTotal: number = 0; // Millisekunden
  
  // Resize State
  private resizing: {
    block: WorkTimeBlock;
    edge: 'start' | 'end';
    initialY: number;
    initialTime: number; // Timestamp in ms
    dayColumn: HTMLElement;
  } | null = null;
  
  // Split State
  splitModeActive: boolean = false;
  splitModeBlock: WorkTimeBlock | null = null;
  splitPreviewY: number | null = null;
  splitPreviewTime: string | null = null; // Formatierte Uhrzeit "HH:mm"
  
  // Week Summary Modal State
  showWeekSummaryModal: boolean = false;
  
  // Project Assignment Modal State
  showProjectModal: boolean = false;
  projectModalBlock: WorkTimeBlock | null = null;
  availableProjects: string[] = [];
  selectedProject: string = '';
  newProjectName: string = '';
  showNewProjectInput: boolean = false;
  
  private subscription?: Subscription;
  
  constructor(private workTimeService: WorkTimeService) {}
  
  ngOnInit(): void {
    this.loadWeekData();
    
    // Live-Updates abonnieren
    this.subscription = this.workTimeService.state$.subscribe(() => {
      this.loadWeekData();
    });
    
    // ESC-Taste zum Abbrechen des Split-Modus
    document.addEventListener('keydown', this.onKeyDown);
  }
  
  ngAfterViewInit(): void {
    // Scroll zu 06:00 Uhr
    this.scrollTo6AM();
  }
  
  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    document.removeEventListener('keydown', this.onKeyDown);
  }
  
  loadWeekData(): void {
    const allBlocks = this.workTimeService.getAllBlocks();
    console.log('Loading week data. Total blocks:', allBlocks.length, allBlocks);
    console.log('Current week:', this.currentWeek);
    
    // Filtere Blöcke der aktuellen Woche
    this.weekBlocks.clear();
    this.daySums.clear();
    this.weekTotal = 0;
    
    this.currentWeek.days.forEach(day => {
      const dayKey = this.getDayKey(day);
      const dayBlocks = allBlocks.filter(block => {
        const blockDate = new Date(block.start);
        return isSameDay(blockDate, day);
      });
      
      console.log(`Day ${dayKey}: ${dayBlocks.length} blocks`, dayBlocks);
      
      this.weekBlocks.set(dayKey, dayBlocks);
      
      // Berechne Tagessumme
      const daySum = dayBlocks.reduce((sum, block) => {
        return sum + this.getBlockDuration(block);
      }, 0);
      
      this.daySums.set(dayKey, daySum);
      this.weekTotal += daySum;
    });
  }
  
  previousWeek(): void {
    this.currentWeek = getPreviousWeek(this.currentWeek);
    this.loadWeekData();
  }
  
  nextWeek(): void {
    this.currentWeek = getNextWeek(this.currentWeek);
    this.loadWeekData();
  }
  
  getWeekRangeText(): string {
    return formatWeekRange(this.currentWeek);
  }
  
  getDayKey(date: Date): string {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  }
  
  getDayBlocks(date: Date): WorkTimeBlock[] {
    return this.weekBlocks.get(this.getDayKey(date)) || [];
  }
  
  getDaySum(date: Date): number {
    return this.daySums.get(this.getDayKey(date)) || 0;
  }
  
  isWeekendDay(date: Date): boolean {
    return isWeekend(date);
  }
  
  formatDayHeader(date: Date): string {
    const dayNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    const dayName = dayNames[date.getDay()];
    const day = date.getDate();
    return `${dayName} ${day}.`;
  }
  
  formatTime(hour: number): string {
    return `${hour.toString().padStart(2, '0')}:00`;
  }
  
  formatDuration(ms: number): string {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  }
  
  getBlockDuration(block: WorkTimeBlock): number {
    const start = new Date(block.start).getTime();
    const end = block.end ? new Date(block.end).getTime() : Date.now();
    return end - start;
  }
  
  // CSS Position für Blöcke berechnen (absolut zum Tag-Container)
  getBlockStyle(block: WorkTimeBlock): any {
    const start = new Date(block.start);
    const end = block.end ? new Date(block.end) : new Date();
    
    const startHour = start.getHours() + start.getMinutes() / 60;
    const endHour = end.getHours() + end.getMinutes() / 60;
    
    const rowHeight = 60; // px pro Stunde
    const top = startHour * rowHeight;
    const height = (endHour - startHour) * rowHeight;
    
    return {
      top: `${top}px`,
      height: `${Math.max(height, 20)}px` // Mindesthöhe 20px
    };
  }
  
  getBlockClass(block: WorkTimeBlock): string {
    return block.end ? 'time-block-completed' : 'time-block-running';
  }
  
  formatBlockTime(block: WorkTimeBlock): string {
    const start = new Date(block.start);
    const startStr = `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')}`;
    
    if (!block.end) {
      return `${startStr} - läuft`;
    }
    
    const end = new Date(block.end);
    const endStr = `${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`;
    return `${startStr} - ${endStr}`;
  }

  // --- Wochenübersicht Modal ---

  openWeekSummaryModal(): void {
    this.showWeekSummaryModal = true;
  }

  closeWeekSummaryModal(): void {
    this.showWeekSummaryModal = false;
  }

  getWeekSummary() {
    return this.workTimeService.getWeekSummary(
      this.currentWeek.startDate,
      this.currentWeek.endDate
    );
  }

  formatTimeRange(range: { start: string; end: string }): string {
    const start = new Date(range.start);
    const end = new Date(range.end);
    
    const startStr = `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')}`;
    const endStr = `${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`;
    
    return `${startStr} - ${endStr}`;
  }

  // --- Projekt-Zuordnung Modal ---

  openProjectModal(event: MouseEvent, block: WorkTimeBlock): void {
    event.preventDefault();
    event.stopPropagation();

    this.projectModalBlock = block;
    this.availableProjects = this.workTimeService.getUsedProjectNames();
    this.selectedProject = block.projectName || '';
    this.newProjectName = '';
    this.showNewProjectInput = false;
    this.showProjectModal = true;
  }

  closeProjectModal(): void {
    this.showProjectModal = false;
    this.projectModalBlock = null;
    this.selectedProject = '';
    this.newProjectName = '';
    this.showNewProjectInput = false;
  }

  onProjectSelect(projectName: string): void {
    this.selectedProject = projectName;
    this.showNewProjectInput = false;
  }

  onNewProjectClick(): void {
    this.showNewProjectInput = true;
    this.selectedProject = '';
    // Focus auf Input setzen
    setTimeout(() => {
      const input = document.getElementById('newProjectInput') as HTMLInputElement;
      input?.focus();
    }, 100);
  }

  assignProject(): void {
    if (!this.projectModalBlock) return;

    let projectName: string | null = null;

    if (this.showNewProjectInput) {
      // Neues Projekt
      projectName = this.newProjectName.trim();
      if (projectName === '') {
        return; // Leere Eingabe ignorieren
      }
    } else if (this.selectedProject) {
      // Bestehendes Projekt
      projectName = this.selectedProject;
    }
    // Wenn beides leer: projectName bleibt null → Zuweisung entfernen

    const success = this.workTimeService.assignProjectToBlock(
      this.projectModalBlock.id,
      projectName
    );

    if (success) {
      this.closeProjectModal();
    }
  }

  removeProjectAssignment(): void {
    if (!this.projectModalBlock) return;

    const success = this.workTimeService.assignProjectToBlock(
      this.projectModalBlock.id,
      null
    );

    if (success) {
      this.closeProjectModal();
    }
  }
  
  // --- Resize-Funktionalität ---
  
  canResizeStart(block: WorkTimeBlock): boolean {
    return true;
  }
  
  canResizeEnd(block: WorkTimeBlock): boolean {
    return block.end !== null;
  }
  
  onDeleteBlock(event: MouseEvent, block: WorkTimeBlock): void {
    event.preventDefault();
    event.stopPropagation();
    
    const success = this.workTimeService.deleteBlock(block.id);
    
    if (success) {
      console.log('Block deleted:', block.id);
    } else {
      console.error('Failed to delete block:', block.id);
    }
  }
  
  // --- Split-Funktionalität ---
  
  canSplitBlock(block: WorkTimeBlock): boolean {
    // Nur abgeschlossene Blöcke können gesplittet werden
    return block.end !== null;
  }

  // --- Merge-Funktionalität ---

  /**
   * Prüft, ob direkt nach diesem Block ein weiterer Block folgt
   * @param block Der zu prüfende Block
   * @returns Den nachfolgenden Block, falls vorhanden, sonst null
   */
  getAdjacentNextBlock(block: WorkTimeBlock): WorkTimeBlock | null {
    if (!block.end) {
      return null; // Laufende Blöcke haben keinen Nachfolger
    }

    const dayBlocks = this.getDayBlocks(new Date(block.date));
    
    // Finde Block, dessen Start gleich dem Ende dieses Blocks ist
    return dayBlocks.find(b => b.start === block.end) || null;
  }

  /**
   * Führt zwei Blöcke zusammen
   */
  onMergeBlocks(event: MouseEvent, block1: WorkTimeBlock, block2: WorkTimeBlock): void {
    event.preventDefault();
    event.stopPropagation();

    const mergedId = this.workTimeService.mergeBlocks(block1.id, block2.id);
    
    if (mergedId) {
      console.log('Blocks merged successfully:', mergedId);
    } else {
      console.error('Failed to merge blocks');
    }
  }
  
  onSplitBlockStart(event: MouseEvent, block: WorkTimeBlock): void {
    event.preventDefault();
    event.stopPropagation();
    
    if (!this.canSplitBlock(block)) return;
    
    this.splitModeActive = true;
    this.splitModeBlock = block;
    this.splitPreviewY = null;
    
    console.log('Split mode activated for block:', block.id);
  }
  
  onBlockClick(event: MouseEvent, block: WorkTimeBlock): void {
    if (!this.splitModeActive || this.splitModeBlock?.id !== block.id) {
      event.stopPropagation();
      return;
    }
    
    event.preventDefault();
    event.stopPropagation();
    
    // Berechne Split-Position
    const blockElement = event.currentTarget as HTMLElement;
    const rect = blockElement.getBoundingClientRect();
    const relativeY = event.clientY - rect.top;
    
    // Berechne Zeit an Klick-Position
    const blockStart = new Date(block.start).getTime();
    const blockEnd = block.end ? new Date(block.end).getTime() : Date.now();
    const blockDuration = blockEnd - blockStart;
    const blockHeight = rect.height;
    
    const ratio = relativeY / blockHeight;
    const splitTimeMs = blockStart + (blockDuration * ratio);
    
    // Snap to 5 minutes
    const snappedTime = this.snapTo5Minutes(splitTimeMs);
    const splitTimeISO = new Date(snappedTime).toISOString();
    
    // Split durchführen
    const result = this.workTimeService.splitBlock(block.id, splitTimeISO);
    
    if (result) {
      console.log('Block split successful:', result);
      this.cancelSplitMode();
    } else {
      console.error('Failed to split block');
    }
  }
  
  onBlockMouseMove(event: MouseEvent, block: WorkTimeBlock): void {
    if (!this.splitModeActive || this.splitModeBlock?.id !== block.id) {
      return;
    }
    
    const blockElement = event.currentTarget as HTMLElement;
    const rect = blockElement.getBoundingClientRect();
    const relativeY = event.clientY - rect.top;
    this.splitPreviewY = relativeY;
    
    // Berechne Zeit an der Cursor-Position
    const blockStart = new Date(block.start).getTime();
    const blockEnd = block.end ? new Date(block.end).getTime() : Date.now();
    const blockDuration = blockEnd - blockStart;
    const blockHeight = rect.height;
    
    const ratio = relativeY / blockHeight;
    const splitTimeMs = blockStart + (blockDuration * ratio);
    
    // Snap to 5 minutes
    const snappedTime = this.snapTo5Minutes(splitTimeMs);
    const splitTime = new Date(snappedTime);
    
    // Formatiere Uhrzeit "HH:mm"
    this.splitPreviewTime = `${splitTime.getHours().toString().padStart(2, '0')}:${splitTime.getMinutes().toString().padStart(2, '0')}`;
  }
  
  cancelSplitMode(): void {
    this.splitModeActive = false;
    this.splitModeBlock = null;
    this.splitPreviewY = null;
    this.splitPreviewTime = null;
    console.log('Split mode cancelled');
  }
  
  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.splitModeActive) {
      this.cancelSplitMode();
    }
  }
  
  // --- Block-Erstellung per Klick ---
  
  onCellClick(event: MouseEvent, day: Date, hour: number): void {
    // Verhindere Event-Bubbling von Resize-Handles
    const target = event.target as HTMLElement;
    if (!target.classList.contains('time-cell')) {
      return;
    }
    
    // Berechne geklickte Zeit innerhalb der Zelle
    const cell = target;
    const rect = cell.getBoundingClientRect();
    const relativeY = event.clientY - rect.top;
    const cellHeight = rect.height; // 60px
    
    // Minuten innerhalb der Stunde (0-59)
    const minutesInHour = (relativeY / cellHeight) * 60;
    
    // Erstelle Datum mit geklickter Zeit
    const clickedTime = new Date(day);
    clickedTime.setHours(hour, minutesInHour, 0, 0);
    
    // Snap to 5 minutes
    let snappedTime = this.snapTo5Minutes(clickedTime.getTime());
    
    // Endzeit: +5 Minuten (Mindestdauer, editierbar)
    const endTime = snappedTime + (5 * 60 * 1000);
    
    const startISO = new Date(snappedTime).toISOString();
    const endISO = new Date(endTime).toISOString();
    
    // Prüfe ob an der Startzeit bereits ein Block existiert
    const dayKey = this.getDayKey(day);
    const existingBlocks = this.weekBlocks.get(dayKey) || [];
    
    const hasOverlap = existingBlocks.some(block => {
      const blockStart = new Date(block.start).getTime();
      const blockEnd = block.end ? new Date(block.end).getTime() : Date.now();
      
      // Prüfe Überlappung: neuer Block [snappedTime, endTime] mit existierendem Block
      return snappedTime < blockEnd && endTime > blockStart;
    });
    
    if (hasOverlap) {
      console.log('Block creation cancelled: overlap detected');
      return; // Ignorieren wenn bereits Block vorhanden
    }
    
    // Erstelle Block als "completed" mit fester Endzeit
    // Nutzer kann das Ende danach per Resize anpassen
    const blockId = this.workTimeService.createBlock(startISO, endISO);
    
    if (blockId) {
      console.log('New block created:', blockId);
      // UI wird automatisch durch state$ aktualisiert
    } else {
      console.error('Failed to create block');
    }
  }
  
  onResizeStart(event: MouseEvent, block: WorkTimeBlock, edge: 'start' | 'end'): void {
    event.preventDefault();
    event.stopPropagation();
    
    if (edge === 'start' && !this.canResizeStart(block)) return;
    if (edge === 'end' && !this.canResizeEnd(block)) return;
    
    const target = event.target as HTMLElement;
    const dayColumn = target.closest('.day-column') as HTMLElement;
    
    if (!dayColumn) return;
    
    const initialTime = edge === 'start' 
      ? new Date(block.start).getTime()
      : new Date(block.end!).getTime();
    
    this.resizing = {
      block,
      edge,
      initialY: event.clientY,
      initialTime,
      dayColumn
    };
    
    document.addEventListener('mousemove', this.onResizeMove);
    document.addEventListener('mouseup', this.onResizeEnd);
    
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }
  
  private onResizeMove = (event: MouseEvent): void => {
    if (!this.resizing) return;
    
    const deltaY = event.clientY - this.resizing.initialY;
    const rowHeight = 60;
    const deltaHours = deltaY / rowHeight;
    const deltaMs = deltaHours * 60 * 60 * 1000;
    
    let newTime = this.resizing.initialTime + deltaMs;
    newTime = this.snapTo5Minutes(newTime);
    
    const blockDate = new Date(this.resizing.block.start);
    const dayStart = new Date(blockDate.setHours(0, 0, 0, 0)).getTime();
    const dayEnd = new Date(blockDate.setHours(23, 59, 59, 999)).getTime();
    
    newTime = Math.max(dayStart, Math.min(dayEnd, newTime));
    
    const minDuration = 5 * 60 * 1000;
    
    if (this.resizing.edge === 'start') {
      const endTime = this.resizing.block.end 
        ? new Date(this.resizing.block.end).getTime()
        : Date.now();
      
      if (endTime - newTime < minDuration) {
        newTime = endTime - minDuration;
      }
    } else {
      const startTime = new Date(this.resizing.block.start).getTime();
      
      if (newTime - startTime < minDuration) {
        newTime = startTime + minDuration;
      }
    }
    
    const newTimeISO = new Date(newTime).toISOString();
    const startISO = this.resizing.edge === 'start' 
      ? newTimeISO 
      : this.resizing.block.start;
    const endISO = this.resizing.edge === 'end' 
      ? newTimeISO 
      : this.resizing.block.end!;
    
    if (this.workTimeService.hasOverlap(this.resizing.block.id, startISO, endISO)) {
      return;
    }
    
    if (this.resizing.edge === 'start') {
      this.resizing.block.start = newTimeISO;
    } else {
      this.resizing.block.end = newTimeISO;
    }
  }
  
  private onResizeEnd = (): void => {
    if (!this.resizing) return;
    
    const { block, edge } = this.resizing;
    
    let success = false;
    if (edge === 'start') {
      success = this.workTimeService.updateBlockStart(block.id, block.start);
    } else {
      success = this.workTimeService.updateBlockEnd(block.id, block.end!);
    }
    
    if (!success) {
      this.loadWeekData();
    }
    
    document.removeEventListener('mousemove', this.onResizeMove);
    document.removeEventListener('mouseup', this.onResizeEnd);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    
    this.resizing = null;
  }
  
  private snapTo5Minutes(timestamp: number): number {
    const date = new Date(timestamp);
    const minutes = date.getMinutes();
    const snappedMinutes = Math.round(minutes / 5) * 5;
    date.setMinutes(snappedMinutes, 0, 0);
    return date.getTime();
  }
  
  private scrollTo6AM(): void {
    if (this.timelineScroll) {
      // 6 Stunden * 60px pro Stunde
      setTimeout(() => {
        this.timelineScroll!.nativeElement.scrollTop = 6 * 60;
      }, 0);
    }
  }
}
