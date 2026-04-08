import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { WorkTimeService, WorkTimeBlock, DaySummary, ProjectWeekSummary } from './work-time.service';
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
  
  // Project Overview Modal State
  showProjectOverviewModal: boolean = false;
  
  // Project Assignment Modal State
  showProjectModal: boolean = false;
  projectModalBlock: WorkTimeBlock | null = null;
  selectedProject: string = '';
  selectedColor: string = '';
  selectedUrl: string = '';

  // Project Editor Modal State
  showProjectEditor: boolean = false;
  
  private subscription?: Subscription;
  
  constructor(private workTimeService: WorkTimeService) {}
  
  ngOnInit(): void {
    // Story 16: Bereinige alte Daten beim Initialisieren
    this.workTimeService.cleanupOldData();
    
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

  /**
   * Formatiert Millisekunden als Dezimalstunden mit 2 Nachkommastellen
   * Verwendet Komma als Dezimaltrennzeichen (deutsches Format)
   * @param ms Millisekunden
   * @returns Formatierte Stunden, z.B. "3,25" für 3h 15m
   */
  formatDecimalHours(ms: number): string {
    const hours = ms / (1000 * 60 * 60);
    return hours.toFixed(2).replace('.', ',');
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
    
    const backgroundColor = this.workTimeService.getProjectColor(block.projectName);
    
    return {
      top: `${top}px`,
      height: `${Math.max(height, 20)}px`, // Mindesthöhe 20px
      'background-color': backgroundColor
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

  // --- Projektübersicht Modal ---

  openProjectOverviewModal(): void {
    this.showProjectOverviewModal = true;
  }

  closeProjectOverviewModal(): void {
    this.showProjectOverviewModal = false;
  }

  getProjectOverview() {
    return this.workTimeService.getProjectWeekSummary(
      this.currentWeek.startDate,
      this.currentWeek.endDate
    );
  }

  getProjectUrl(projectName: string): string {
    return this.workTimeService.getProjectUrl(projectName) || '';
  }

  getDayTotal(date: Date): number {
    const dateStr = this.getDayKey(date);
    const projectSummaries = this.getProjectOverview();
    
    let total = 0;
    projectSummaries.forEach(summary => {
      const dayMs = summary.dailyMs.get(dateStr) || 0;
      total += dayMs;
    });
    
    return total;
  }

  // --- Projekt-Zuordnung Modal ---

  openProjectModal(event: MouseEvent, block: WorkTimeBlock): void {
    event.preventDefault();
    event.stopPropagation();

    this.projectModalBlock = block;
    this.selectedProject = block.projectName || '';
    this.selectedColor = block.projectName ? this.workTimeService.getProjectColor(block.projectName) : '';
    this.selectedUrl = block.projectName ? (this.workTimeService.getProjectUrl(block.projectName) || '') : '';
    this.showProjectModal = true;
  }

  closeProjectModal(): void {
    this.showProjectModal = false;
    this.projectModalBlock = null;
    this.selectedProject = '';
  }

  /**
   * Event-Handler für Projekt-Auswahl aus ProjectSelector
   */
  onProjectSelectFromSelector(projectName: string): void {
    this.selectedProject = projectName;
    this.selectedColor = projectName ? this.workTimeService.getProjectColor(projectName) : '';
    this.selectedUrl = projectName ? (this.workTimeService.getProjectUrl(projectName) || '') : '';
  }

  assignProject(): void {
    if (!this.projectModalBlock) return;

    const projectName = this.selectedProject || null;

    const success = this.workTimeService.assignProjectToBlock(
      this.projectModalBlock.id,
      projectName
    );

    if (success) {
      this.closeProjectModal();
    }
  }

  onColorSelect(color: string): void {
    this.selectedColor = color;
    
    // Speichere Farbe sofort wenn Projekt bereits zugeordnet
    if (this.selectedProject) {
      this.workTimeService.setProjectColor(this.selectedProject, color);
    }
  }

  onUrlChange(url: string): void {
    this.selectedUrl = url;

    // Speichere URL sofort wenn Projekt bereits zugeordnet
    if (this.selectedProject) {
      this.workTimeService.setProjectUrl(this.selectedProject, url);
    }
  }

  getBlockColor(block: WorkTimeBlock): string {
    return this.workTimeService.getProjectColor(block.projectName);
  }

  /**
   * Öffnet den Projekt-Editor aus dem Project Assignment Modal heraus.
   * Schließt zuerst das Assignment-Modal, damit nicht zwei Modale übereinander liegen.
   */
  openProjectEditorFromModal(): void {
    // Assignment-Modal temporär schließen
    this.showProjectModal = false;
    this.showProjectEditor = true;
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
    // Wenn im Split-Modus: Split durchführen
    if (this.splitModeActive && this.splitModeBlock?.id === block.id) {
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
      return;
    }
    
    // Wenn nicht im Split-Modus: Projekt-Modal öffnen
    if (!this.splitModeActive) {
      // Prüfe ob Click auf Button war
      const target = event.target as HTMLElement;
      if (target.closest('.block-actions') || target.closest('.resize-handle') || target.closest('.merge-button')) {
        return; // Ignoriere Clicks auf Buttons und Resize-Handles
      }
      
      this.openProjectModal(event, block);
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
    if (event.key === 'Escape') {
      // Split-Modus beenden
      if (this.splitModeActive) {
        this.cancelSplitMode();
        return;
      }
      
      // Projekt-Zuordnung Modal schließen
      if (this.showProjectModal) {
        this.closeProjectModal();
        return;
      }
      
      // Wochenübersicht Modal schließen
      if (this.showWeekSummaryModal) {
        this.closeWeekSummaryModal();
        return;
      }
      
      // Projektübersicht Modal schließen
      if (this.showProjectOverviewModal) {
        this.closeProjectOverviewModal();
        return;
      }

      // Projekt-Editor Modal schließen
      if (this.showProjectEditor) {
        this.showProjectEditor = false;
        return;
      }
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
  
  getProjectColor(projectName: string | undefined): string {
    return this.workTimeService.getProjectColor(projectName);
  }
  
  private scrollTo6AM(): void {
    if (this.timelineScroll) {
      // 6 Stunden * 60px pro Stunde
      setTimeout(() => {
        this.timelineScroll!.nativeElement.scrollTop = 6 * 60;
      }, 0);
    }
  }

  // --- Arbeitszeitgesetz Prüfungen ---

  /**
   * Prüft, ob für einen Tag die 30-Minuten-Pausenregel nach 6h Arbeit eingehalten wurde.
   * Nach 6h Arbeit müssen mindestens 30 Minuten Pause gemacht worden sein.
   * 
   * @param date Der zu prüfende Tag
   * @returns true wenn die Regel verletzt wurde (Warnung anzeigen), false wenn alles ok ist
   */
  violates30MinBreakAfter6Hours(date: Date): boolean {
    const dayBlocks = this.getDayBlocks(date);
    
    // Keine Blöcke oder nur laufende Blöcke -> keine Prüfung möglich
    if (dayBlocks.length === 0) {
      return false;
    }
    
    // Sortiere Blöcke nach Startzeit
    const sortedBlocks = [...dayBlocks].sort((a, b) => 
      new Date(a.start).getTime() - new Date(b.start).getTime()
    );
    
    let totalWorkTime = 0; // in Millisekunden
    let totalBreakTime = 0; // in Millisekunden
    let lastEndTime: number | null = null;
    
    for (const block of sortedBlocks) {
      const blockStart = new Date(block.start).getTime();
      const blockEnd = block.end ? new Date(block.end).getTime() : Date.now();
      const blockDuration = blockEnd - blockStart;
      
      // Wenn es einen vorherigen Block gab, berechne die Pause
      if (lastEndTime !== null && blockStart > lastEndTime) {
        const breakDuration = blockStart - lastEndTime;
        totalBreakTime += breakDuration;
      }
      
      // Addiere Arbeitszeit
      totalWorkTime += blockDuration;
      
      // Prüfe nach jedem Block die Pausenregeln
      const sixHoursInMs = 6 * 60 * 60 * 1000;
      const nineHoursInMs = 9 * 60 * 60 * 1000;
      const thirtyMinutesInMs = 30 * 60 * 1000;
      const fortyFiveMinutesInMs = 45 * 60 * 1000;
      
      // Prüfung 1: Nach 6h Arbeit müssen min. 30 Minuten Pause gemacht worden sein
      if (totalWorkTime > sixHoursInMs && totalBreakTime < thirtyMinutesInMs) {
        return true; // Verstoß!
      }
      
      // Prüfung 2: Bei mehr als 9h Arbeit müssen min. 45 Minuten Pause gemacht worden sein
      if (totalWorkTime > nineHoursInMs && totalBreakTime < fortyFiveMinutesInMs) {
        return true; // Verstoß!
      }
      
      lastEndTime = blockEnd;
    }
    
    return false;
  }

  /**
   * Prüft, ob zwischen dem letzten Block des Vortags und dem ersten Block des aktuellen Tages
   * mindestens 11 Stunden Ruhezeit liegen.
   * 
   * @param date Der zu prüfende Tag (es wird geprüft, ob zwischen Vortag und diesem Tag genug Ruhe war)
   * @returns true wenn die Regel verletzt wurde (zu wenig Ruhezeit), false wenn alles ok ist
   */
  violates11HourRestPeriod(date: Date): boolean {
    const currentDayBlocks = this.getDayBlocks(date);
    
    // Wenn am aktuellen Tag keine Blöcke vorhanden sind, kein Verstoß
    if (currentDayBlocks.length === 0) {
      return false;
    }
    
    // Finde den frühesten Block des aktuellen Tages
    const sortedCurrentBlocks = [...currentDayBlocks].sort((a, b) => 
      new Date(a.start).getTime() - new Date(b.start).getTime()
    );
    const firstBlockToday = sortedCurrentBlocks[0];
    const firstStartToday = new Date(firstBlockToday.start).getTime();
    
    // Hole Blöcke vom Vortag
    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayBlocks = this.getDayBlocks(yesterday);
    
    // Wenn am Vortag keine Blöcke vorhanden sind, kein Verstoß
    if (yesterdayBlocks.length === 0) {
      return false;
    }
    
    // Finde den letzten Block des Vortags
    const sortedYesterdayBlocks = [...yesterdayBlocks].sort((a, b) => 
      new Date(a.start).getTime() - new Date(b.start).getTime()
    );
    const lastBlockYesterday = sortedYesterdayBlocks[sortedYesterdayBlocks.length - 1];
    
    // Wenn der letzte Block gestern noch läuft, können wir nicht prüfen
    if (!lastBlockYesterday.end) {
      return false;
    }
    
    const lastEndYesterday = new Date(lastBlockYesterday.end).getTime();
    
    // Berechne die Ruhezeit
    const restPeriod = firstStartToday - lastEndYesterday;
    const elevenHoursInMs = 11 * 60 * 60 * 1000;
    
    // Verstoß, wenn weniger als 11 Stunden Ruhezeit
    return restPeriod < elevenHoursInMs;
  }

  /**
   * Gibt CSS-Klasse für den Tag-Header zurück, je nach Arbeitszeitgesetz-Verstößen
   */
  getDayHeaderClass(date: Date): string {
    if (this.violates30MinBreakAfter6Hours(date) || this.violates11HourRestPeriod(date)) {
      return 'violation-warning';
    }
    return '';
  }

  /**
   * Gibt eine Beschreibung der Arbeitszeitgesetz-Verstöße für einen Tag zurück.
   * Wird als Tooltip angezeigt.
   */
  getViolationMessage(date: Date): string {
    const violations: string[] = [];
    
    // Prüfe Pausenregeln (30min nach 6h, 45min nach 9h)
    const pauseViolation = this.checkPauseViolation(date);
    if (pauseViolation) {
      violations.push(pauseViolation);
    }
    
    // Prüfe 11h Ruhezeit
    if (this.violates11HourRestPeriod(date)) {
      violations.push('⚠️ Zu wenig Ruhezeit: Weniger als 11h seit Ende der Arbeit gestern');
    }
    
    return violations.join('\n');
  }

  /**
   * Prüft die Pausenregeln und gibt eine Beschreibung zurück, falls verletzt.
   */
  private checkPauseViolation(date: Date): string | null {
    const dayBlocks = this.getDayBlocks(date);
    
    if (dayBlocks.length === 0) {
      return null;
    }
    
    const sortedBlocks = [...dayBlocks].sort((a, b) => 
      new Date(a.start).getTime() - new Date(b.start).getTime()
    );
    
    let totalWorkTime = 0;
    let totalBreakTime = 0;
    let lastEndTime: number | null = null;
    
    for (const block of sortedBlocks) {
      const blockStart = new Date(block.start).getTime();
      const blockEnd = block.end ? new Date(block.end).getTime() : Date.now();
      const blockDuration = blockEnd - blockStart;
      
      if (lastEndTime !== null && blockStart > lastEndTime) {
        const breakDuration = blockStart - lastEndTime;
        totalBreakTime += breakDuration;
      }
      
      totalWorkTime += blockDuration;
      
      const sixHoursInMs = 6 * 60 * 60 * 1000;
      const nineHoursInMs = 9 * 60 * 60 * 1000;
      const thirtyMinutesInMs = 30 * 60 * 1000;
      const fortyFiveMinutesInMs = 45 * 60 * 1000;
      
      // Prüfung 2 zuerst (spezifischer)
      if (totalWorkTime > nineHoursInMs && totalBreakTime < fortyFiveMinutesInMs) {
        const breakMinutes = Math.floor(totalBreakTime / (1000 * 60));
        const workHours = (totalWorkTime / (1000 * 60 * 60)).toFixed(1);
        return `⚠️ Zu wenig Pause: Bei ${workHours}h Arbeit nur ${breakMinutes}min Pause (mind. 45min erforderlich)`;
      }
      
      // Prüfung 1
      if (totalWorkTime > sixHoursInMs && totalBreakTime < thirtyMinutesInMs) {
        const breakMinutes = Math.floor(totalBreakTime / (1000 * 60));
        const workHours = (totalWorkTime / (1000 * 60 * 60)).toFixed(1);
        return `⚠️ Zu wenig Pause: Bei ${workHours}h Arbeit nur ${breakMinutes}min Pause (mind. 30min erforderlich)`;
      }
      
      lastEndTime = blockEnd;
    }
    
    return null;
  }
}
