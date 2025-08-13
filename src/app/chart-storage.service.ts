import { Injectable } from '@angular/core';
import { Chart } from './domain/Chart';
import { ChartSerialization } from './chart-serialization';
interface ChartBackup {
  timestamp: number;
  charts: Chart[];
}

@Injectable({
  providedIn: 'root'
})
export class ChartStorageService {

  private readonly STORAGE_KEY = 'charts';
  private readonly BACKUP_STORAGE_KEY = 'charts_backups';
  private readonly BACKUP_INTERVAL_HOURS = 1;
  private readonly MAX_BACKUPS = 10;

  // Chart speichern oder aktualisieren
  saveChart(chart: Chart): void {

    const charts = this.getAllCharts();
    const index = charts.findIndex(c => c.id === chart.id);
    if (index == -1) {
      console.log("Chart with id " + chart.id + " doesn't exist yet");
      charts.push(chart);
    } else {
      charts.splice(index, 1, chart);
    }

    this.saveCharts(charts);
  }

  private saveCharts(charts: Chart[]) {
    try {
      const toSave = ChartSerialization.serialize(charts);
      if (toSave === undefined || toSave === null) {
        throw new Error('Serialization returned undefined/null');
      }
      console.log('saving charts:');
      console.log(toSave);
      localStorage.setItem(this.STORAGE_KEY, toSave);
      console.log('Charts successfully saved');
      
      // Nach erfolgreichem Speichern: Backup prüfen
      this.tryCreateBackup(charts);
      
    } catch (error) {
      console.error('Failed to save charts:', error);
      throw error; // Verhindert weiteres Verarbeiten
    }
  }

  // Chart per ID laden
  getChart(id: string): Chart | undefined {
    console.log("load chart with id " + id);
    const charts = this.getAllCharts();
    const newLocal = charts.find(c => c.id == id);
    console.log(newLocal);
    return newLocal;
  }

  // Alle Chart-IDs und -Namen als Array zurückgeben
  getChartList(): { id: string; name: string }[] {
    const charts = this.getAllCharts();
    return Array.from(charts.values()).map(chart => ({ id: chart.id, name: chart.name }));
  }

  // Hilfsmethode: Alle Charts aus dem Local Storage holen
  private getAllCharts(): Chart[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return [];
      console.log("parsing stored charts:");
      console.log(stored);
      const loadedCharts = ChartSerialization.deserializeArray(stored);
      
      if (!Array.isArray(loadedCharts)) {
        console.error('Deserialization did not return an array');
        return [];
      }
      
      return loadedCharts;
    } catch (error) {
      console.error('Failed to load charts from storage:', error);
      return [];
    }
  }


  deleteChart(chart: Chart) {

    const charts = this.getAllCharts();
    const idx = charts.findIndex(c => c.id == chart.id);
    if (idx == -1) {
      console.log("No stored chart with id " + chart.id);
    }
    else {
      charts.splice(idx, 1);
      this.saveCharts(charts);
    }
  }

  // Backup-Funktionalität
  private tryCreateBackup(charts: Chart[]): void {
    try {
      if (this.shouldCreateBackup()) {
        this.createBackup(charts);
        console.log('Backup successfully created');
      }
    } catch (error) {
      console.error('Failed to create backup:', error);
      // Backup-Fehler soll normales Speichern nicht beeinträchtigen
    }
  }

  private shouldCreateBackup(): boolean {
    const backups = this.getBackups();
    if (backups.length === 0) {
      return true; // Erstes Backup
    }
    
    const lastBackupTime = Math.max(...backups.map(b => b.timestamp));
    const hoursSinceLastBackup = (Date.now() - lastBackupTime) / (1000 * 60 * 60);
    
    return hoursSinceLastBackup >= this.BACKUP_INTERVAL_HOURS;
  }

  private createBackup(charts: Chart[]): void {
    const backups = this.getBackups();
    
    // Neues Backup hinzufügen
    const newBackup: ChartBackup = {
      timestamp: Date.now(),
      charts: [...charts] // Kopie erstellen
    };
    
    backups.push(newBackup);
    
    // Alte Backups entfernen (nur die neuesten MAX_BACKUPS behalten)
    backups.sort((a, b) => b.timestamp - a.timestamp); // Neueste zuerst
    if (backups.length > this.MAX_BACKUPS) {
      backups.splice(this.MAX_BACKUPS);
    }
    
    // Backups speichern
    const serializedBackups = JSON.stringify(backups);
    localStorage.setItem(this.BACKUP_STORAGE_KEY, serializedBackups);
  }

  private getBackups(): ChartBackup[] {
    try {
      const stored = localStorage.getItem(this.BACKUP_STORAGE_KEY);
      if (!stored) return [];
      
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];
      
      return parsed.filter(backup => 
        backup && 
        typeof backup.timestamp === 'number' && 
        Array.isArray(backup.charts)
      );
    } catch (error) {
      console.error('Failed to load backups:', error);
      return [];
    }
  }
}
