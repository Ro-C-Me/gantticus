import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, interval } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Repräsentiert einen einzelnen Arbeitszeitblock
 */
export interface WorkTimeBlock {
  id: string;              // UUID
  date: string;            // ISO date: "2026-01-09"
  start: string;           // ISO datetime: "2026-01-09T08:15:00"
  end: string | null;      // null = läuft noch
}

/**
 * Container für alle Arbeitszeitblöcke
 */
export interface WorkTimeData {
  blocks: WorkTimeBlock[];
}

/**
 * Service zur Verwaltung der Arbeitszeiterfassung
 * - Startet und stoppt Arbeitszeitblöcke
 * - Persistiert Daten im LocalStorage
 * - Berechnet Tagesgesamtzeit
 */
@Injectable({
  providedIn: 'root'
})
export class WorkTimeService {
  private readonly STORAGE_KEY = 'work-time-blocks';
  
  private dataSubject = new BehaviorSubject<WorkTimeData>(this.loadFromStorage());
  
  // Public Observable für Komponenten
  public data$: Observable<WorkTimeData> = this.dataSubject.asObservable();
  
  // Alias für state$ (für Komponenten, die state$ erwarten)
  public state$: Observable<WorkTimeData> = this.dataSubject.asObservable();
  
  constructor() {
    // Lade initial die Daten aus dem LocalStorage
    this.dataSubject.next(this.loadFromStorage());
  }

  /**
   * Startet einen neuen Arbeitszeitblock
   * @returns Die ID des neuen Blocks
   */
  startWork(): string {
    const now = new Date();
    const newBlock: WorkTimeBlock = {
      id: this.generateUUID(),
      date: this.toDateString(now),
      start: now.toISOString(),
      end: null
    };

    const data = this.dataSubject.value;
    data.blocks.push(newBlock);
    
    this.saveToStorage(data);
    this.dataSubject.next(data);
    
    return newBlock.id;
  }

  /**
   * Beendet den aktuell laufenden Arbeitszeitblock
   * @returns true wenn erfolgreich beendet, false wenn kein Block läuft
   */
  stopWork(): boolean {
    const data = this.dataSubject.value;
    const runningBlock = this.getCurrentBlock(data);
    
    if (!runningBlock) {
      return false;
    }

    runningBlock.end = new Date().toISOString();
    
    this.saveToStorage(data);
    this.dataSubject.next(data);
    
    return true;
  }

  /**
   * Gibt den aktuell laufenden Block zurück (falls vorhanden)
   */
  getCurrentBlock(data?: WorkTimeData): WorkTimeBlock | null {
    const workData = data || this.dataSubject.value;
    return workData.blocks.find(block => block.end === null) || null;
  }

  /**
   * Prüft, ob aktuell ein Timer läuft
   */
  isRunning(): boolean {
    return this.getCurrentBlock() !== null;
  }

  /**
   * Berechnet die Gesamtarbeitszeit für einen bestimmten Tag in Millisekunden
   * @param date ISO Date String (z.B. "2026-01-09")
   */
  getTotalTimeForDate(date: string): number {
    const blocks = this.dataSubject.value.blocks.filter(b => b.date === date);
    return this.calculateTotalTime(blocks);
  }

  /**
   * Berechnet die Gesamtarbeitszeit für den heutigen Tag in Millisekunden
   */
  getTodayTotal(): number {
    const today = this.toDateString(new Date());
    return this.getTotalTimeForDate(today);
  }

  /**
   * Observable, das die aktuelle Gesamtzeit für heute liefert
   * Aktualisiert sich jede Sekunde, wenn ein Timer läuft
   */
  getTodayTotal$(): Observable<number> {
    return interval(1000).pipe(
      map(() => this.getTodayTotal())
    );
  }

  /**
   * Gibt alle Blöcke für ein bestimmtes Datum zurück
   */
  getBlocksForDate(date: string): WorkTimeBlock[] {
    return this.dataSubject.value.blocks.filter(b => b.date === date);
  }

  /**
   * Gibt alle Blöcke für heute zurück
   */
  getTodayBlocks(): WorkTimeBlock[] {
    const today = this.toDateString(new Date());
    return this.getBlocksForDate(today);
  }

  /**
   * Gibt alle Arbeitszeitblöcke zurück
   */
  getAllBlocks(): WorkTimeBlock[] {
    return this.dataSubject.value.blocks;
  }

  // --- Private Helper-Methoden ---

  /**
   * Berechnet die Gesamtzeit aus einer Liste von Blöcken
   */
  private calculateTotalTime(blocks: WorkTimeBlock[]): number {
    return blocks.reduce((total, block) => {
      const start = new Date(block.start).getTime();
      const end = block.end ? new Date(block.end).getTime() : Date.now();
      return total + (end - start);
    }, 0);
  }

  /**
   * Lädt Daten aus dem LocalStorage
   */
  private loadFromStorage(): WorkTimeData {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as WorkTimeData;
        return parsed;
      }
    } catch (error) {
      console.error('Failed to load work time data from storage:', error);
    }
    
    return { blocks: [] };
  }

  /**
   * Speichert Daten im LocalStorage
   */
  private saveToStorage(data: WorkTimeData): void {
    try {
      const serialized = JSON.stringify(data);
      localStorage.setItem(this.STORAGE_KEY, serialized);
    } catch (error) {
      console.error('Failed to save work time data to storage:', error);
    }
  }

  /**
   * Konvertiert ein Date-Objekt in einen ISO-Date-String (YYYY-MM-DD)
   */
  private toDateString(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Generiert eine einfache UUID
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}
