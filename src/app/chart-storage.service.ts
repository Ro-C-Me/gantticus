import { Injectable } from '@angular/core';
import { Chart } from './domain/Chart';
import { TypedJSON } from 'typedjson';

@Injectable({
  providedIn: 'root'
})
export class ChartStorageService {

  private serializer = new TypedJSON(Chart);

  private readonly STORAGE_KEY = 'charts';

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
    const toSave = JSON.stringify(charts);
    console.log('saving charts:');
    console.log(toSave);
    localStorage.setItem(this.STORAGE_KEY, toSave);
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
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (!stored) return [];
    console.log("parsing stored charts:");
    console.log(stored);
    const loadedCharts = this.serializer.parseAsArray(stored);
    return loadedCharts;
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
}
