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
  projectName?: string;    // Optional: Zugeordnetes Projekt
}

/**
 * Container für alle Arbeitszeitblöcke
 */
export interface WorkTimeData {
  blocks: WorkTimeBlock[];
}

/**
 * Repräsentiert einen zusammenhängenden Zeitraum (möglicherweise aus mehreren Blöcken zusammengefasst)
 */
export interface TimeRange {
  start: string;  // ISO datetime
  end: string;    // ISO datetime (nie null, da zusammengefasst)
}

/**
 * Repräsentiert die Zusammenfassung eines Tages
 */
export interface DaySummary {
  date: string;           // ISO date: "2026-01-09"
  dayName: string;        // "Mo", "Di", etc.
  formattedDate: string;  // "12.01.26"
  ranges: TimeRange[];    // Alle Zeiträume des Tages
  totalMs: number;        // Gesamtzeit in Millisekunden
}

/**
 * Repräsentiert die Arbeitszeit eines Projekts über eine Woche
 */
export interface ProjectWeekSummary {
  projectName: string;                    // Name des Projekts (oder "Nicht zugeordnet")
  dailyMs: Map<string, number>;          // Millisekunden pro Tag (key: ISO date)
  totalMs: number;                       // Gesamtzeit über alle Tage
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
  private readonly COLORS_STORAGE_KEY = 'project-colors';
  
  // Vordefinierte Farbpalette
  private readonly COLOR_PALETTE = [
    '#ef4444', // rot
    '#f97316', // orange
    '#f59e0b', // gelb
    '#10b981', // grün
    '#06b6d4', // cyan
    '#3b82f6', // blau
    '#8b5cf6', // violett
    '#ec4899', // pink
    '#64748b'  // grau
  ];
  
  private readonly DEFAULT_UNASSIGNED_COLOR = '#6c757d'; // Bootstrap secondary
  
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

  /**
   * Erstellt eine Wochenübersicht mit zusammengefassten Zeiträumen für Export
   * Blöcke ohne Pausen dazwischen werden automatisch zusammengefasst
   * @param startDate Startdatum der Woche
   * @param endDate Enddatum der Woche
   * @returns Array von DaySummary für jeden Tag mit Arbeitszeit
   */
  getWeekSummary(startDate: Date, endDate: Date): DaySummary[] {
    const summaries: DaySummary[] = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const dateStr = this.toDateString(currentDate);
      const dayBlocks = this.getBlocksForDate(dateStr);
      
      // Nur Tage mit Arbeitszeit
      if (dayBlocks.length === 0) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }
      
      // Sortiere Blöcke nach Startzeit
      const sortedBlocks = [...dayBlocks].sort((a, b) => 
        new Date(a.start).getTime() - new Date(b.start).getTime()
      );
      
      // Fasse zusammenhängende Blöcke zusammen
      const ranges: TimeRange[] = [];
      let currentRange: TimeRange | null = null;
      
      for (const block of sortedBlocks) {
        const blockEnd = block.end || new Date().toISOString(); // Laufende Blöcke: bis jetzt
        
        if (!currentRange) {
          // Erster Block
          currentRange = { start: block.start, end: blockEnd };
        } else if (currentRange.end === block.start) {
          // Block schließt direkt an → erweitern
          currentRange.end = blockEnd;
        } else {
          // Lücke gefunden → aktuellen Range speichern und neuen starten
          ranges.push(currentRange);
          currentRange = { start: block.start, end: blockEnd };
        }
      }
      
      // Letzten Range hinzufügen
      if (currentRange) {
        ranges.push(currentRange);
      }
      
      // Berechne Tagesgesamtzeit
      const totalMs = ranges.reduce((sum, range) => {
        const start = new Date(range.start).getTime();
        const end = new Date(range.end).getTime();
        return sum + (end - start);
      }, 0);
      
      // Formatiere Datum
      const dayNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
      const dayName = dayNames[currentDate.getDay()];
      const day = currentDate.getDate().toString().padStart(2, '0');
      const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
      const year = currentDate.getFullYear().toString().slice(-2);
      const formattedDate = `${day}.${month}.${year}`;
      
      summaries.push({
        date: dateStr,
        dayName,
        formattedDate,
        ranges,
        totalMs
      });
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return summaries;
  }

  /**
   * Ordnet einem Block einen Projektnamen zu
   * @param blockId ID des Blocks
   * @param projectName Name des Projekts (oder null zum Entfernen)
   * @returns true wenn erfolgreich
   */
  assignProjectToBlock(blockId: string, projectName: string | null): boolean {
    const data = this.dataSubject.value;
    const block = data.blocks.find(b => b.id === blockId);

    if (!block) {
      console.error('Block not found:', blockId);
      return false;
    }

    // Setze oder entferne Projektnamen
    if (projectName === null || projectName.trim() === '') {
      delete block.projectName;
    } else {
      block.projectName = projectName.trim();
    }

    this.saveToStorage(data);
    this.dataSubject.next(data);

    console.log('Project assigned to block:', blockId, '→', projectName);
    return true;
  }

  /**
   * Gibt eine sortierte Liste aller bereits verwendeten Projektnamen zurück
   * @returns Array von Projektnamen (unique, sortiert)
   */
  getUsedProjectNames(): string[] {
    const data = this.dataSubject.value;
    const projectNames = new Set<string>();

    data.blocks.forEach(block => {
      if (block.projectName && block.projectName.trim() !== '') {
        projectNames.add(block.projectName.trim());
      }
    });

    return Array.from(projectNames).sort((a, b) => 
      a.localeCompare(b, 'de', { sensitivity: 'base' })
    );
  }

  /**
   * Erstellt eine Projektübersicht über eine Woche
   * Gruppiert Arbeitszeiten nach Projekt und Tag
   * @param startDate Startdatum der Woche
   * @param endDate Enddatum der Woche
   * @returns Array von ProjectWeekSummary, sortiert nach Projektname
   */
  getProjectWeekSummary(startDate: Date, endDate: Date): ProjectWeekSummary[] {
    const data = this.dataSubject.value;
    const projectMap = new Map<string, Map<string, number>>();
    
    // Durchlaufe alle Blöcke im Zeitraum
    data.blocks.forEach(block => {
      const blockDate = new Date(block.date);
      
      // Nur Blöcke innerhalb des Zeitraums
      if (blockDate < startDate || blockDate > endDate) {
        return;
      }
      
      // Projekt bestimmen
      const projectName = block.projectName?.trim() || 'Nicht zugeordnet';
      
      // Berechne Dauer
      const startTime = new Date(block.start).getTime();
      const endTime = block.end ? new Date(block.end).getTime() : Date.now();
      const duration = endTime - startTime;
      
      // Initialisiere Projekt wenn nötig
      if (!projectMap.has(projectName)) {
        projectMap.set(projectName, new Map<string, number>());
      }
      
      const projectDailyMap = projectMap.get(projectName)!;
      const dateStr = block.date;
      
      // Addiere Dauer zum Tag
      const currentDuration = projectDailyMap.get(dateStr) || 0;
      projectDailyMap.set(dateStr, currentDuration + duration);
    });
    
    // Konvertiere Map zu Array
    const summaries: ProjectWeekSummary[] = [];
    
    projectMap.forEach((dailyMs, projectName) => {
      let totalMs = 0;
      
      dailyMs.forEach(ms => {
        totalMs += ms;
      });
      
      summaries.push({
        projectName,
        dailyMs,
        totalMs
      });
    });
    
    // Sortiere: "Nicht zugeordnet" zuletzt, sonst alphabetisch
    summaries.sort((a, b) => {
      if (a.projectName === 'Nicht zugeordnet') return 1;
      if (b.projectName === 'Nicht zugeordnet') return -1;
      return a.projectName.localeCompare(b.projectName, 'de', { sensitivity: 'base' });
    });
    
    return summaries;
  }

  // --- Projekt-Farben Verwaltung ---

  /**
   * Lädt die Projekt-Farben aus dem LocalStorage
   */
  private loadProjectColors(): Map<string, string> {
    try {
      const stored = localStorage.getItem(this.COLORS_STORAGE_KEY);
      if (stored) {
        const obj = JSON.parse(stored);
        return new Map(Object.entries(obj));
      }
    } catch (error) {
      console.error('Failed to load project colors from storage:', error);
    }
    return new Map();
  }

  /**
   * Speichert die Projekt-Farben im LocalStorage
   */
  private saveProjectColors(colors: Map<string, string>): void {
    try {
      const obj = Object.fromEntries(colors);
      localStorage.setItem(this.COLORS_STORAGE_KEY, JSON.stringify(obj));
    } catch (error) {
      console.error('Failed to save project colors to storage:', error);
    }
  }

  /**
   * Gibt die Farbe für ein Projekt zurück
   * Weist automatisch eine Farbe zu, wenn noch keine vorhanden ist
   */
  getProjectColor(projectName: string | null | undefined): string {
    if (!projectName || projectName.trim() === '' || projectName === 'Nicht zugeordnet') {
      return this.DEFAULT_UNASSIGNED_COLOR;
    }

    const colors = this.loadProjectColors();
    
    if (!colors.has(projectName)) {
      // Automatische Farbzuweisung
      const newColor = this.getNextAvailableColor(colors);
      colors.set(projectName, newColor);
      this.saveProjectColors(colors);
      return newColor;
    }

    return colors.get(projectName)!;
  }

  /**
   * Setzt eine Farbe für ein Projekt
   */
  setProjectColor(projectName: string, color: string): void {
    if (!projectName || projectName.trim() === '') {
      return;
    }

    const colors = this.loadProjectColors();
    colors.set(projectName, color);
    this.saveProjectColors(colors);
  }

  /**
   * Gibt eine zufällige verfügbare Farbe aus der Palette zurück
   */
  private getNextAvailableColor(colors: Map<string, string>): string {
    const usedColors = new Set(colors.values());
    
    // Sammle alle ungenutzten Farben
    const availableColors = this.COLOR_PALETTE.filter(color => !usedColors.has(color));
    
    if (availableColors.length > 0) {
      // Wähle zufällige ungenutzte Farbe
      const randomIndex = Math.floor(Math.random() * availableColors.length);
      return availableColors[randomIndex];
    }
    
    // Alle Farben vergeben -> Wähle zufällige Farbe aus gesamter Palette
    const randomIndex = Math.floor(Math.random() * this.COLOR_PALETTE.length);
    return this.COLOR_PALETTE[randomIndex];
  }

  /**
   * Gibt die komplette Farbpalette zurück (für Farb-Picker)
   */
  getColorPalette(): string[] {
    return [...this.COLOR_PALETTE];
  }
}
