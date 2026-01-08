import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { WorkTimeService, WorkTimeBlock } from './work-time.service';
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
  
  private subscription?: Subscription;
  
  constructor(private workTimeService: WorkTimeService) {}
  
  ngOnInit(): void {
    this.loadWeekData();
    
    // Live-Updates abonnieren
    this.subscription = this.workTimeService.state$.subscribe(() => {
      this.loadWeekData();
    });
  }
  
  ngAfterViewInit(): void {
    // Scroll zu 06:00 Uhr
    this.scrollTo6AM();
  }
  
  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
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
  
  private scrollTo6AM(): void {
    if (this.timelineScroll) {
      // 6 Stunden * 60px pro Stunde
      setTimeout(() => {
        this.timelineScroll!.nativeElement.scrollTop = 6 * 60;
      }, 0);
    }
  }
}
