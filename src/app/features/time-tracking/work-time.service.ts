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
 * Repräsentiert ein Projekt in der Projekt-Registry
 */
export interface Project {
  name: string;
  color: string;
  url?: string;             // Optionale URL zu externem Projektmanagement-Tool
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
  private readonly PROJECTS_STORAGE_KEY = 'projects';
  private readonly LEGACY_COLORS_STORAGE_KEY = 'project-colors';
  
  // Aufbewahrungsdauer für Zeiterfassungsdaten in Kalenderwochen
  private readonly RETENTION_WEEKS = 6;
  
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
   * @param projectName Optional: Name des Projekts für den Block
   * @returns Die ID des neuen Blocks
   */
  startWork(projectName?: string): string {
    const now = new Date();
    const newBlock: WorkTimeBlock = {
      id: this.generateUUID(),
      date: this.toDateString(now),
      start: now.toISOString(),
      end: null,
      projectName: projectName || undefined
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
   * Verwendet lokale Zeitzone, um Verschiebungen durch Sommer-/Winterzeit zu vermeiden.
   */
  private toDateString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
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
      //Parse block.date als lokale Mitternacht (nicht UTC), damit der Vergleich
      // mit startDate/endDate (lokale Mitternacht) konsistent ist.
      const [y, m, d] = block.date.split('-').map(Number);
      const blockDate = new Date(y, m - 1, d, 0, 0, 0, 0);
      
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

  // --- Projekt-Verwaltung ---

  /**
   * Lädt Projekte aus dem LocalStorage.
   * Migriert automatisch vom alten 'project-colors' Format falls nötig.
   */
  private loadProjects(): Project[] {
    try {
      const stored = localStorage.getItem(this.PROJECTS_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored) as Project[];
      }

      // Migration: Prüfe ob alte 'project-colors' Daten existieren
      const legacyStored = localStorage.getItem(this.LEGACY_COLORS_STORAGE_KEY);
      if (legacyStored) {
        const legacyObj = JSON.parse(legacyStored) as Record<string, string>;
        const migrated: Project[] = Object.entries(legacyObj).map(([name, color]) => ({
          name,
          color
        }));
        // Speichere migrierte Daten im neuen Format
        this.saveProjects(migrated);
        // Entferne altes Format
        localStorage.removeItem(this.LEGACY_COLORS_STORAGE_KEY);
        console.log(`Migrated ${migrated.length} projects from legacy 'project-colors' to 'projects' format.`);
        return migrated;
      }
    } catch (error) {
      console.error('Failed to load projects from storage:', error);
    }
    return [];
  }

  /**
   * Speichert Projekte im LocalStorage
   */
  private saveProjects(projects: Project[]): void {
    try {
      localStorage.setItem(this.PROJECTS_STORAGE_KEY, JSON.stringify(projects));
    } catch (error) {
      console.error('Failed to save projects to storage:', error);
    }
  }

  /**
   * Gibt ein Projekt anhand des Namens zurück
   */
  getProject(projectName: string): Project | undefined {
    return this.loadProjects().find(p => p.name === projectName);
  }

  /**
   * Gibt alle registrierten Projekte zurück, sortiert nach Name
   */
  getAllProjects(): Project[] {
    return this.loadProjects().sort((a, b) =>
      a.name.localeCompare(b.name, 'de', { sensitivity: 'base' })
    );
  }

  /**
   * Gibt alle registrierten Projektnamen zurück (unique, sortiert)
   */
  getUsedProjectNames(): string[] {
    return this.getAllProjects().map(p => p.name);
  }

  /**
   * Gibt die Farbe für ein Projekt zurück
   * Weist automatisch eine Farbe zu, wenn noch keine vorhanden ist
   */
  getProjectColor(projectName: string | null | undefined): string {
    if (!projectName || projectName.trim() === '' || projectName === 'Nicht zugeordnet') {
      return this.DEFAULT_UNASSIGNED_COLOR;
    }

    const projects = this.loadProjects();
    const project = projects.find(p => p.name === projectName);

    if (!project) {
      // Automatische Farbzuweisung + Registrierung
      const usedColors = new Set(projects.map(p => p.color));
      const newColor = this.getNextAvailableColor(usedColors);
      projects.push({ name: projectName, color: newColor });
      this.saveProjects(projects);
      return newColor;
    }

    return project.color;
  }

  /**
   * Gibt die URL für ein Projekt zurück (oder undefined)
   */
  getProjectUrl(projectName: string | null | undefined): string | undefined {
    if (!projectName) return undefined;
    const project = this.getProject(projectName);
    return project?.url;
  }

  /**
   * Setzt eine Farbe für ein Projekt
   */
  setProjectColor(projectName: string, color: string): void {
    if (!projectName || projectName.trim() === '') return;

    const projects = this.loadProjects();
    const project = projects.find(p => p.name === projectName);

    if (project) {
      project.color = color;
    } else {
      projects.push({ name: projectName, color });
    }

    this.saveProjects(projects);
  }

  /**
   * Setzt eine URL für ein Projekt
   */
  setProjectUrl(projectName: string, url: string): void {
    if (!projectName || projectName.trim() === '') return;

    const projects = this.loadProjects();
    const project = projects.find(p => p.name === projectName);

    if (project) {
      project.url = url.trim() || undefined;
      this.saveProjects(projects);
    }
  }

  /**
   * Aktualisiert ein Projekt komplett (Name bleibt als Key erhalten)
   */
  updateProject(projectName: string, updates: Partial<Omit<Project, 'name'>>): void {
    if (!projectName || projectName.trim() === '') return;

    const projects = this.loadProjects();
    const project = projects.find(p => p.name === projectName);

    if (project) {
      if (updates.color !== undefined) project.color = updates.color;
      if (updates.url !== undefined) project.url = updates.url.trim() || undefined;
      this.saveProjects(projects);
      this.notifyStateChange();
    }
  }

  /**
   * Registriert ein neues Projekt in der Projekt-Registry mit einer automatischen Farbe
   */
  registerProject(projectName: string): void {
    if (!projectName || projectName.trim() === '') return;

    const projects = this.loadProjects();

    // Nur registrieren wenn noch nicht vorhanden
    if (!projects.some(p => p.name === projectName)) {
      const usedColors = new Set(projects.map(p => p.color));
      const newColor = this.getNextAvailableColor(usedColors);
      projects.push({ name: projectName, color: newColor });
      this.saveProjects(projects);
      this.notifyStateChange();
    }
  }

  /**
   * Benennt ein Projekt um: Aktualisiert die Projekt-Registry und alle Blöcke
   * @returns true wenn erfolgreich, false bei Fehler (z.B. neuer Name existiert bereits)
   */
  renameProject(oldName: string, newName: string): boolean {
    if (!oldName || !newName || oldName.trim() === '' || newName.trim() === '') {
      return false;
    }

    const trimmedOld = oldName.trim();
    const trimmedNew = newName.trim();

    if (trimmedOld === trimmedNew) return true;

    const projects = this.loadProjects();

    // Prüfe ob neuer Name bereits existiert
    if (projects.some(p => p.name === trimmedNew)) {
      return false;
    }

    const project = projects.find(p => p.name === trimmedOld);
    if (project) {
      project.name = trimmedNew;
      this.saveProjects(projects);
    }

    // Alle Blöcke aktualisieren, die das alte Projekt referenzieren
    const data = this.dataSubject.value;
    let changed = false;
    data.blocks.forEach(block => {
      if (block.projectName === trimmedOld) {
        block.projectName = trimmedNew;
        changed = true;
      }
    });

    if (changed) {
      this.saveToStorage(data);
    }

    this.notifyStateChange();
    return true;
  }

  /**
   * Löscht ein Projekt: Entfernt es aus der Registry und setzt alle Blöcke
   * mit diesem Projekt auf "Nicht zugeordnet" (projectName = undefined)
   */
  deleteProject(projectName: string): boolean {
    if (!projectName || projectName.trim() === '') return false;

    const trimmedName = projectName.trim();

    // Aus Projekt-Registry entfernen
    const projects = this.loadProjects();
    const filtered = projects.filter(p => p.name !== trimmedName);
    this.saveProjects(filtered);

    // Alle Blöcke aktualisieren: projectName entfernen
    const data = this.dataSubject.value;
    let changed = false;
    data.blocks.forEach(block => {
      if (block.projectName === trimmedName) {
        delete block.projectName;
        changed = true;
      }
    });

    if (changed) {
      this.saveToStorage(data);
    }

    this.notifyStateChange();
    return true;
  }

  /**
   * Triggert ein State-Update ohne die Blöcke zu ändern
   */
  private notifyStateChange(): void {
    this.dataSubject.next(this.dataSubject.value);
  }

  /**
   * Gibt eine zufällige verfügbare Farbe aus der Palette zurück
   */
  private getNextAvailableColor(usedColors: Set<string>): string {
    const availableColors = this.COLOR_PALETTE.filter(color => !usedColors.has(color));

    if (availableColors.length > 0) {
      return availableColors[Math.floor(Math.random() * availableColors.length)];
    }

    return this.COLOR_PALETTE[Math.floor(Math.random() * this.COLOR_PALETTE.length)];
  }

  /**
   * Gibt die komplette Farbpalette zurück (für Farb-Picker)
   */
  getColorPalette(): string[] {
    return [...this.COLOR_PALETTE];
  }

  // ========== Story 16: Automatische Datenbereinigung ==========

  /**
   * Bereinigt alte Zeiterfassungsdaten und nicht mehr verwendete Projekte
   * Löscht alle Blöcke aus Kalenderwochen, die älter als RETENTION_WEEKS sind
   * Entfernt anschließend Projekte ohne verbleibende Blöcke aus der Registry
   * 
   * @returns Statistik über gelöschte Daten
   */
  cleanupOldData(): { deletedBlocks: number, deletedProjects: number } {
    const data = this.dataSubject.value;
    
    // Berechne Grenz-Datum (6 Kalenderwochen zurück)
    const today = new Date();
    const cutoffDate = new Date(today);
    cutoffDate.setDate(cutoffDate.getDate() - (this.RETENTION_WEEKS * 7));
    
    // Finde Montag der Grenz-Woche (damit wir ganze Wochen löschen)
    const cutoffMonday = this.getMonday(cutoffDate);
    
    // Zähle Blöcke vor der Bereinigung
    const initialBlockCount = data.blocks.length;
    
    // Filter: Behalte nur Blöcke, die am oder nach dem Grenz-Montag liegen
    const filteredBlocks = data.blocks.filter(block => {
      // Parse block.date als lokale Mitternacht (nicht UTC)
      const [y, m, d] = block.date.split('-').map(Number);
      const blockDate = new Date(y, m - 1, d);
      return blockDate >= cutoffMonday;
    });
    
    const deletedBlocks = initialBlockCount - filteredBlocks.length;
    
    // Wenn keine Blöcke gelöscht wurden, keine weiteren Aktionen nötig
    if (deletedBlocks === 0) {
      return { deletedBlocks: 0, deletedProjects: 0 };
    }
    
    // Sammle alle Projektnamen aus verbleibenden Blöcken
    const remainingProjects = new Set<string>();
    filteredBlocks.forEach(block => {
      if (block.projectName && block.projectName.trim() !== '') {
        remainingProjects.add(block.projectName);
      }
    });
    
    // Bereinige Projekt-Registry: Lösche Projekte ohne verbleibende Blöcke
    const projects = this.loadProjects();
    const initialProjectCount = projects.length;
    const cleanedProjects = projects.filter(p => remainingProjects.has(p.name));
    const deletedProjects = initialProjectCount - cleanedProjects.length;
    
    // Speichere gefilterte Blöcke
    if (deletedBlocks > 0) {
      data.blocks = filteredBlocks;
      this.saveToStorage(data);
      this.dataSubject.next(data);
    }
    
    // Speichere bereinigte Projekt-Registry
    if (deletedProjects > 0) {
      this.saveProjects(cleanedProjects);
    }
    
    return { deletedBlocks, deletedProjects };
  }
  
  /**
   * Gibt den Montag einer Woche zurück (Helper für cleanupOldData)
   */
  private getMonday(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  }
}
