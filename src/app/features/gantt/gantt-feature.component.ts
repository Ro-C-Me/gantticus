import { Component, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { AppComponent } from '../../app.component';
import { GanttChartComponent } from '../../gantt-chart/gantt-chart.component';

@Component({
  selector: 'app-gantt-feature',
  templateUrl: './gantt-feature.component.html',
  styleUrl: './gantt-feature.component.scss',
  standalone: false,
  providers: []
})
export class GanttFeatureComponent implements OnInit, AfterViewInit {
  @ViewChild(GanttChartComponent) ganttChartComponent!: GanttChartComponent;

  // Diese Komponente delegiert temporär an AppComponent
  constructor(public appComponent: AppComponent) {}

  ngOnInit() {
    // Initialisierung wenn nötig
  }

  ngAfterViewInit() {
    // ViewChild ist jetzt verfügbar - mit AppComponent verbinden
    if (this.ganttChartComponent) {
      this.appComponent.ganttChartComponent = this.ganttChartComponent;
      // Initial update triggern
      setTimeout(() => {
        if (this.ganttChartComponent) {
          this.ganttChartComponent.update();
        }
      }, 0);
    }
  }

  // Alle Properties und Methoden werden an appComponent delegiert
  get chart() { return this.appComponent.chart; }
  get availableCharts() { return this.appComponent.availableCharts; }
  get hasUnsavedChanges() { return this.appComponent.hasUnsavedChanges; }
  get canUndo() { return this.appComponent.canUndo; }
  get canRedo() { return this.appComponent.canRedo; }
  get isEditingName() { return this.appComponent.isEditingName; }
  get filteredTaskIds() { return this.appComponent.filteredTaskIds; }

  onAddTask(parentId?: string) { this.appComponent.onAddTask(parentId); }
  onAddGroup() { this.appComponent.onAddGroup(); }
  onUndo() { this.appComponent.onUndo(); }
  onRedo() { this.appComponent.onRedo(); }
  onEditName() { this.appComponent.onEditName(); }
  onSaveName(name: string) { this.appComponent.onSaveName(name); }
  onCancelEdit() { this.appComponent.onCancelEdit(); }
  onOpenChart(chart: any) { this.appComponent.onOpenChart(chart); }
  onNewChart() { this.appComponent.onNewChart(); }
  onDeleteChart(chart: any) { this.appComponent.onDeleteChart(chart); }
  onSave() { this.appComponent.onSave(); }
  onImageExport() { this.appComponent.onImageExport(); }
  onHtmlExport() { this.appComponent.onHtmlExport(); }
  onCsvExport() { this.appComponent.onCsvExport(); }
  onFilterChange() { this.appComponent.onFilterChange(); }
  clearFilter() { this.appComponent.clearFilter(); }
  onGanttDataChanged(event: any) { this.appComponent.onGanttDataChanged(event); }
  onGanttExpandedChanged(event: any) { this.appComponent.onGanttExpandedChanged(event); }
}

