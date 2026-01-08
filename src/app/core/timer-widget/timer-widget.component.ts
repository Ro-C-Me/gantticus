import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { WorkTimeService, WorkTimeBlock } from '../../features/time-tracking/work-time.service';

@Component({
  selector: 'app-timer-widget',
  templateUrl: './timer-widget.component.html',
  styleUrl: './timer-widget.component.scss',
  standalone: false
})
export class TimerWidgetComponent implements OnInit, OnDestroy {
  
  isRunning = false;
  todayTotalMs = 0;
  currentBlock: WorkTimeBlock | null = null;
  
  private subscriptions = new Subscription();

  constructor(private workTimeService: WorkTimeService) {}

  ngOnInit(): void {
    // Initialer Zustand
    this.updateState();
    
    // Live-Updates jede Sekunde
    const totalSub = this.workTimeService.getTodayTotal$().subscribe(() => {
      this.updateState();
    });
    
    this.subscriptions.add(totalSub);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  /**
   * Aktualisiert den internen State
   */
  private updateState(): void {
    this.isRunning = this.workTimeService.isRunning();
    this.todayTotalMs = this.workTimeService.getTodayTotal();
    this.currentBlock = this.workTimeService.getCurrentBlock();
  }

  /**
   * Startet die Arbeitszeiterfassung
   */
  onStartWork(): void {
    this.workTimeService.startWork();
    this.updateState();
  }

  /**
   * Stoppt die Arbeitszeiterfassung
   */
  onStopWork(): void {
    this.workTimeService.stopWork();
    this.updateState();
  }

  /**
   * Formatiert Millisekunden in "Xh Ym" Format
   */
  formatDuration(ms: number): string {
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  /**
   * Formatiert einen ISO-Timestamp in "HH:MM" Format
   */
  formatTime(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * Berechnet die Dauer des aktuellen Blocks
   */
  getCurrentBlockDuration(): number {
    if (!this.currentBlock) return 0;
    
    const start = new Date(this.currentBlock.start).getTime();
    const now = Date.now();
    return now - start;
  }
}
