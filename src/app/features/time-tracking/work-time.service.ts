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

  /**
   * Erstellt einen neuen Arbeitszeitblock mit gegebener Start- und Endzeit
   * @param start Startzeit als ISO-String
   * @param end Endzeit als ISO-String oder null für laufenden Block
   * @returns Die ID des neuen Blocks oder null bei Fehler
   */
  createBlock(start: string, end: string | null): string | null {
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : null;
    
    // Validierung
    if (endTime !== null && endTime <= startTime) {
      return null; // Ende muss nach Start liegen
    }
    
    // Overlap-Check (nur wenn Endzeit gesetzt ist)
    if (end !== null && this.hasOverlap('', start, end)) {
      return null; // Überschneidung mit bestehendem Block
    }
    
    const newBlock: WorkTimeBlock = {
      id: this.generateUUID(),
      date: this.toDateString(new Date(start)),
      start: start,
      end: end
    };

    const data = this.dataSubject.value;
    data.blocks.push(newBlock);
    
    this.saveToStorage(data);
    this.dataSubject.next(data);
    
    return newBlock.id;
  }

  /**
   * Aktualisiert die Startzeit eines Blocks
   * @param blockId ID des zu aktualisierenden Blocks
   * @param newStart Neue Startzeit als ISO-String
   * @returns true wenn erfolgreich, false wenn Block nicht gefunden oder Validierung fehlschlägt
   */
  updateBlockStart(blockId: string, newStart: string): boolean {
    const data = this.dataSubject.value;
    const block = data.blocks.find(b => b.id === blockId);
    
    if (!block) {
      return false;
    }

    // Validierung: Start muss vor Ende liegen
    if (block.end) {
      const startTime = new Date(newStart).getTime();
      const endTime = new Date(block.end).getTime();
      
      if (startTime >= endTime) {
        return false; // Ungültig: Start nach oder gleich Ende
      }
    }

    block.start = newStart;
    
    this.saveToStorage(data);
    this.dataSubject.next(data);
    
    return true;
  }

  /**
   * Aktualisiert die Endzeit eines Blocks
   * @param blockId ID des zu aktualisierenden Blocks
   * @param newEnd Neue Endzeit als ISO-String
   * @returns true wenn erfolgreich, false wenn Block nicht gefunden oder Validierung fehlschlägt
   */
  updateBlockEnd(blockId: string, newEnd: string): boolean {
    const data = this.dataSubject.value;
    const block = data.blocks.find(b => b.id === blockId);
    
    if (!block) {
      return false;
    }

    // Laufende Blöcke können nicht über diese Methode beendet werden
    if (block.end === null) {
      return false;
    }

    // Validierung: Ende muss nach Start liegen
    const startTime = new Date(block.start).getTime();
    const endTime = new Date(newEnd).getTime();
    
    if (endTime <= startTime) {
      return false; // Ungültig: Ende vor oder gleich Start
    }

    block.end = newEnd;
    
    this.saveToStorage(data);
    this.dataSubject.next(data);
    
    return true;
  }

  /**
   * Löscht einen Arbeitszeitblock
   * @param blockId ID des zu löschenden Blocks
   * @returns true wenn erfolgreich, false wenn Block nicht gefunden
   */
  deleteBlock(blockId: string): boolean {
    const data = this.dataSubject.value;
    const index = data.blocks.findIndex(b => b.id === blockId);
    
    if (index === -1) {
      return false;
    }

    data.blocks.splice(index, 1);
    
    this.saveToStorage(data);
    this.dataSubject.next(data);
    
    return true;
  }

  /**
   * Teilt einen Block an einer bestimmten Zeit-Position in zwei Blöcke
   * @param blockId ID des zu teilenden Blocks
   * @param splitTime ISO-String der Split-Position
   * @returns Array mit IDs der beiden neuen Blöcke, oder null bei Fehler
   */
  splitBlock(blockId: string, splitTime: string): [string, string] | null {
    const data = this.dataSubject.value;
    const block = data.blocks.find(b => b.id === blockId);
    
    if (!block) {
      return null;
    }

    // Laufende Blöcke können nicht gesplittet werden
    if (block.end === null) {
      return null;
    }

    const startTime = new Date(block.start).getTime();
    const endTime = new Date(block.end).getTime();
    const split = new Date(splitTime).getTime();

    // Validierung: Split muss innerhalb des Blocks liegen
    if (split <= startTime || split >= endTime) {
      return null;
    }

    // Erstelle zwei neue Blöcke
    const block1: WorkTimeBlock = {
      id: this.generateUUID(),
      date: block.date,
      start: block.start,
      end: splitTime
    };

    const block2: WorkTimeBlock = {
      id: this.generateUUID(),
      date: block.date,
      start: splitTime,
      end: block.end
    };

    // Entferne Original-Block
    const index = data.blocks.findIndex(b => b.id === blockId);
    data.blocks.splice(index, 1);

    // Füge neue Blöcke hinzu
    data.blocks.push(block1, block2);

    this.saveToStorage(data);
    this.dataSubject.next(data);

    return [block1.id, block2.id];
  }

  /**
   * Führt zwei direkt aufeinanderfolgende Blöcke zu einem Block zusammen
   * @param blockId1 ID des ersten Blocks
   * @param blockId2 ID des zweiten Blocks
   * @returns ID des neu erstellten Blocks, oder null wenn nicht möglich
   */
  mergeBlocks(blockId1: string, blockId2: string): string | null {
    const data = this.dataSubject.value;
    const block1 = data.blocks.find(b => b.id === blockId1);
    const block2 = data.blocks.find(b => b.id === blockId2);

    if (!block1 || !block2) {
      console.error('One or both blocks not found');
      return null;
    }

    // Validierung: Beide Blöcke müssen am selben Tag sein
    if (block1.date !== block2.date) {
      console.error('Blocks must be on the same day');
      return null;
    }

    // Bestimme welcher Block zuerst kommt
    let firstBlock: WorkTimeBlock;
    let secondBlock: WorkTimeBlock;

    const time1 = new Date(block1.start).getTime();
    const time2 = new Date(block2.start).getTime();

    if (time1 < time2) {
      firstBlock = block1;
      secondBlock = block2;
    } else {
      firstBlock = block2;
      secondBlock = block1;
    }

    // Validierung: Blöcke müssen direkt aneinander angrenzen
    // Ende des ersten Blocks muss gleich Start des zweiten Blocks sein
    if (firstBlock.end !== secondBlock.start) {
      console.error('Blocks must be directly adjacent (end1 === start2)');
      return null;
    }

    // Erstelle neuen zusammengefassten Block
    const mergedBlock: WorkTimeBlock = {
      id: this.generateUUID(),
      date: firstBlock.date,
      start: firstBlock.start,
      end: secondBlock.end // Kann null sein wenn zweiter Block läuft
    };

    // Entferne beide Original-Blöcke
    const index1 = data.blocks.findIndex(b => b.id === blockId1);
    const index2 = data.blocks.findIndex(b => b.id === blockId2);
    
    // Entferne von hinten nach vorne, damit Indizes stabil bleiben
    if (index1 > index2) {
      data.blocks.splice(index1, 1);
      data.blocks.splice(index2, 1);
    } else {
      data.blocks.splice(index2, 1);
      data.blocks.splice(index1, 1);
    }

    // Füge neuen Block hinzu
    data.blocks.push(mergedBlock);

    this.saveToStorage(data);
    this.dataSubject.next(data);

    console.log('Blocks merged:', blockId1, blockId2, '→', mergedBlock.id);
    return mergedBlock.id;
  }

  /**
   * Prüft, ob ein Block sich mit anderen Blöcken am selben Tag überschneidet
   * @param blockId ID des zu prüfenden Blocks
   * @param start Startzeit des Blocks
   * @param end Endzeit des Blocks
   * @returns true wenn Überschneidung existiert
   */
  hasOverlap(blockId: string, start: string, end: string): boolean {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const date = this.toDateString(new Date(start));
    
    const dayBlocks = this.getBlocksForDate(date).filter(b => b.id !== blockId);
    
    return dayBlocks.some(block => {
      const blockStart = new Date(block.start).getTime();
      const blockEnd = block.end ? new Date(block.end).getTime() : Date.now();
      
      // Überschneidung prüfen: A.start < B.end && A.end > B.start
      return startTime < blockEnd && endTime > blockStart;
    });
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
