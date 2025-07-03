import { Injectable } from '@angular/core';
import { Chart } from './domain/Chart';
import { ChartSerialization } from './chart-serialization';
import { BehaviorSubject, Subject, timer } from 'rxjs';
import { debounce } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class UndoRedoService {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private maxStackSize = 50;
  
  // Tracking für ungespeicherte Änderungen
  private lastSavedStateIndex: number = -1;
  
  // BehaviorSubjects für die Steuerung der UI-Elemente (Aktivierung/Deaktivierung)
  private canUndoSubject = new BehaviorSubject<boolean>(false);
  private canRedoSubject = new BehaviorSubject<boolean>(false);
  private hasUnsavedChangesSubject = new BehaviorSubject<boolean>(false);
  
  // Für debounced Save
  private debouncedSaveSubject = new Subject<Chart>();
  private debounceTime = 500; // 500ms Verzögerung
  
  canUndo$ = this.canUndoSubject.asObservable();
  canRedo$ = this.canRedoSubject.asObservable();
  hasUnsavedChanges$ = this.hasUnsavedChangesSubject.asObservable();

  constructor() {
    // Debounced Save-Mechanismus einrichten
    this.debouncedSaveSubject.pipe(
      debounce(() => timer(this.debounceTime))
    ).subscribe(chart => {
      this.saveState(chart);
    });
  }

  /**
   * Speichert den aktuellen Zustand eines Charts im Undo-Stack
   * @param chart Das zu speichernde Chart
   */
  saveState(chart: Chart): void {
    // Aktuellen Chart-Zustand serialisieren
    const serializedChart = ChartSerialization.serializeChart(chart);
    
    // Wenn der Redo-Stack bei einer neuen Aktion nicht mehr gültig ist
    this.redoStack = [];
    this.updateCanRedo();

    // Zuerst prüfen, ob der neue Zustand sich vom letzten unterscheidet
    if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === serializedChart) {
      return; // Keine Änderung, nichts speichern
    }

    // Auf den Undo-Stack legen
    this.undoStack.push(serializedChart);
    
    // Stack-Größe überprüfen
    if (this.undoStack.length > this.maxStackSize) {
      // Ältesten Zustand entfernen
      this.undoStack.shift();
      // lastSavedStateIndex anpassen, falls er betroffen ist
      if (this.lastSavedStateIndex >= 0) {
        this.lastSavedStateIndex--;
        if (this.lastSavedStateIndex < 0) {
          this.lastSavedStateIndex = -1; // Gespeicherter Zustand ist nicht mehr im Stack
        }
      }
    }
    
    this.updateCanUndo();
    this.updateHasUnsavedChanges();
  }

  /**
   * Führt eine Undo-Operation durch
   * @returns Das Chart aus dem vorherigen Zustand oder null, wenn keine Undo-Operation möglich ist
   */
  undo(chart: Chart): Chart | null {
    if (this.undoStack.length <= 1) {
      return null; // Nichts zum Rückgängigmachen oder nur der aktuelle Zustand ist auf dem Stack
    }

    // Aktuellen Zustand auf den Redo-Stack legen
    const currentState = ChartSerialization.serializeChart(chart);
    this.redoStack.push(currentState);
    
    // Undo-Stack aktualisieren (letzten Zustand entfernen)
    const previousState = this.undoStack.pop();
    
    if (!previousState || this.undoStack.length === 0) {
      return null; // Sollte nicht passieren, aber zur Sicherheit
    }

    // Letzten Zustand vom Stack abrufen (jetzt der neue "aktuelle" Zustand)
    const newCurrentState = this.undoStack[this.undoStack.length - 1];
    
    // Status-Änderungen in Observables
    this.updateCanUndo();
    this.updateCanRedo();
    this.updateHasUnsavedChanges();
    
    // Chart aus dem serialisierten Zustand wiederherstellen
    return ChartSerialization.deserialize(newCurrentState) || null;
  }

  /**
   * Führt eine Redo-Operation durch
   * @returns Das Chart aus dem nächsten Zustand oder null, wenn keine Redo-Operation möglich ist
   */
  redo(chart: Chart): Chart | null {
    if (this.redoStack.length === 0) {
      return null; // Nichts wiederherzustellen
    }
    
    // Aktuellen Zustand auf den Undo-Stack legen
    const currentState = ChartSerialization.serializeChart(chart);
    this.undoStack.push(currentState);
    
    // Nächsten Zustand vom Redo-Stack abrufen
    const nextState = this.redoStack.pop();
    
    if (!nextState) {
      return null; // Sollte nicht passieren, aber zur Sicherheit
    }
    
    // Status-Änderungen in Observables
    this.updateCanUndo();
    this.updateCanRedo();
    this.updateHasUnsavedChanges();
    
    // Chart aus dem serialisierten Zustand wiederherstellen
    return ChartSerialization.deserialize(nextState) || null;
  }

  /**
   * Löscht alle gespeicherten Zustände (z.B. nach dem Laden eines neuen Charts)
   */
  clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.lastSavedStateIndex = -1; // Reset des gespeicherten Index
    this.updateCanUndo();
    this.updateCanRedo();
    this.updateHasUnsavedChanges();
  }

  /**
   * Speichert den initialen Zustand eines neuen/geladenen Charts
   */
  initStateForChart(chart: Chart): void {
    this.clearHistory();
    this.saveState(chart);
    this.markAsSaved(); // Neuer/geladener Chart ist als gespeichert zu betrachten
  }

  /**
   * Speichert den aktuellen Zustand mit Verzögerung (Debouncing)
   * Ideal für schnell aufeinanderfolgende Änderungen wie Scrollen
   * @param chart Das zu speichernde Chart
   */
  debouncedSaveState(chart: Chart): void {
    this.debouncedSaveSubject.next(chart);
  }

  /**
   * Markiert den aktuellen Zustand als gespeichert
   */
  markAsSaved(): void {
    this.lastSavedStateIndex = this.undoStack.length - 1;
    this.updateHasUnsavedChanges();
  }

  private updateCanUndo(): void {
    this.canUndoSubject.next(this.undoStack.length > 1);
  }
  
  private updateCanRedo(): void {
    this.canRedoSubject.next(this.redoStack.length > 0);
  }

  private updateHasUnsavedChanges(): void {
    const currentIndex = this.undoStack.length - 1;
    const hasUnsavedChanges = this.lastSavedStateIndex !== currentIndex;
    this.hasUnsavedChangesSubject.next(hasUnsavedChanges);
  }
}
