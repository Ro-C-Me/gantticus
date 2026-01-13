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
  
  // Projekt-Auswahl
  availableProjects: string[] = [];
  selectedProjectName: string = '';
  showNewProjectInput: boolean = false;
  newProjectName: string = '';
  
  private subscriptions = new Subscription();

  constructor(private workTimeService: WorkTimeService) {}

  ngOnInit(): void {
    // Initialer Zustand
    this.updateState();
    
    // Lade verfügbare Projekte
    this.loadAvailableProjects();
    
    // Live-Updates jede Sekunde
    const totalSub = this.workTimeService.getTodayTotal$().subscribe(() => {
      this.updateState();
      this.loadAvailableProjects();
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
    
    // Setze selectedProjectName auf aktuelles Projekt des laufenden Blocks
    if (this.isRunning && this.currentBlock) {
      this.selectedProjectName = this.currentBlock.projectName || '';
    }
  }

  /**
   * Lädt die verfügbaren Projekte aus dem Service
   */
  private loadAvailableProjects(): void {
    this.availableProjects = this.workTimeService.getUsedProjectNames();
  }

  /**
   * Startet die Arbeitszeiterfassung
   */
  onStartWork(): void {
    // Übergebe das ausgewählte Projekt (oder undefined wenn "Kein Projekt")
    const projectName = this.selectedProjectName || undefined;
    this.workTimeService.startWork(projectName);
    this.updateState();
  }

  /**
   * Wird aufgerufen wenn Projekt während laufendem Block geändert wird
   */
  onRunningProjectChange(value: string): void {
    if (value === '__new__') {
      this.showNewProjectInput = true;
      this.newProjectName = '';
      this.selectedProjectName = this.currentBlock?.projectName || '';
      
      // Fokus auf Input-Feld setzen
      setTimeout(() => {
        const input = document.getElementById('newProjectInputWidget') as HTMLInputElement;
        if (input) {
          input.focus();
        }
      }, 100);
    } else {
      // Projekt direkt zuordnen
      this.showNewProjectInput = false;
      if (this.currentBlock) {
        this.workTimeService.assignProjectToBlock(this.currentBlock.id, value || null);
        this.updateState();
      }
    }
  }

  /**
   * Erstellt ein neues Projekt und ordnet es dem laufenden Block zu
   */
  createNewProjectForRunningBlock(): void {
    const projectName = this.newProjectName.trim();
    
    if (!projectName) {
      this.cancelNewProject();
      return;
    }

    if (!this.currentBlock) {
      console.error('Kein laufender Block vorhanden');
      this.cancelNewProject();
      return;
    }

    // Ordne das neue Projekt dem laufenden Block zu
    this.workTimeService.assignProjectToBlock(this.currentBlock.id, projectName);
    
    this.showNewProjectInput = false;
    this.newProjectName = '';
    
    // State aktualisieren
    this.updateState();
    this.loadAvailableProjects();
  }

  /**
   * Bricht die Erstellung eines neuen Projekts ab
   */
  cancelNewProject(): void {
    this.showNewProjectInput = false;
    this.newProjectName = '';
    // Setze Dropdown zurück auf aktuelles Projekt
    this.selectedProjectName = this.currentBlock?.projectName || '';
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

  /**
   * Gibt die Farbe für das aktuelle Projekt zurück
   */
  getCurrentProjectColor(): string {
    if (!this.currentBlock?.projectName) return '#6c757d';
    return this.workTimeService.getProjectColor(this.currentBlock.projectName);
  }
}
