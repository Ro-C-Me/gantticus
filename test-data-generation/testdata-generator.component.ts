import { Component } from '@angular/core';
import { TestDataGenerator, ValidationResult } from './testdata-generator';
import { Chart } from '../src/app/domain/Chart';
import { ChartSerialization } from '../src/app/chart-serialization';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-testdata-generator',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container mt-4">
      <h2>🧪 Testdaten Generator</h2>
      <p class="text-muted">Generiert Testdaten für Gantt-Charts mit 250 Tasks, hierarchischen Strukturen und Dependencies.</p>
      
      <div class="row">
        <div class="col-md-6">
          <div class="card">
            <div class="card-header">
              <h5>Generator Steuerung</h5>
            </div>
            <div class="card-body">
              <button 
                class="btn btn-primary me-2" 
                (click)="generateTestData()"
                [disabled]="isGenerating">
                <span *ngIf="isGenerating" class="spinner-border spinner-border-sm me-2"></span>
                {{ isGenerating ? 'Generiere...' : 'Testdaten Generieren' }}
              </button>
              
              <button 
                class="btn btn-outline-secondary me-2" 
                (click)="downloadJson()"
                [disabled]="!generatedChart">
                JSON Herunterladen
              </button>
              
              <button 
                class="btn btn-outline-success" 
                (click)="loadIntoApp()" 
                [disabled]="!generatedChart">
                In App Laden
              </button>
            </div>
          </div>
        </div>
        
        <div class="col-md-6" *ngIf="validationResult">
          <div class="card">
            <div class="card-header">
              <h5>Validierung</h5>
            </div>
            <div class="card-body">
              <div class="mb-2">
                <span class="badge" [class]="validationResult.valid ? 'bg-success' : 'bg-danger'">
                  {{ validationResult.valid ? '✓ Gültig' : '✗ Ungültig' }}
                </span>
              </div>
              
              <div *ngIf="validationResult.errors.length > 0" class="alert alert-danger">
                <strong>Fehler:</strong>
                <ul class="mb-0">
                  <li *ngFor="let error of validationResult.errors">{{ error }}</li>
                </ul>
              </div>
              
              <div *ngIf="validationResult.warnings.length > 0" class="alert alert-warning">
                <strong>Warnungen:</strong>
                <ul class="mb-0">
                  <li *ngFor="let warning of validationResult.warnings">{{ warning }}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="row mt-4" *ngIf="validationResult">
        <div class="col-12">
          <div class="card">
            <div class="card-header">
              <h5>Statistiken</h5>
            </div>
            <div class="card-body">
              <div class="row">
                <div class="col-md-3">
                  <div class="text-center">
                    <h3 class="text-primary">{{ validationResult.stats.totalTasks }}</h3>
                    <small class="text-muted">Gesamt Tasks</small>
                  </div>
                </div>
                <div class="col-md-3">
                  <div class="text-center">
                    <h3 class="text-info">{{ validationResult.stats.subTasks }}</h3>
                    <small class="text-muted">Sub-Tasks</small>
                  </div>
                </div>
                <div class="col-md-3">
                  <div class="text-center">
                    <h3 class="text-success">{{ validationResult.stats.tasksWithDependencies }}</h3>
                    <small class="text-muted">Tasks mit Dependencies</small>
                  </div>
                </div>
                <div class="col-md-3">
                  <div class="text-center">
                    <h3 class="text-warning">{{ validationResult.stats.totalDependencies }}</h3>
                    <small class="text-muted">Gesamt Dependencies</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="row mt-4" *ngIf="generatedChart">
        <div class="col-12">
          <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
              <h5>Chart Vorschau</h5>
              <button class="btn btn-sm btn-outline-secondary" (click)="toggleJsonView()">
                {{ showJson ? 'Verbergen' : 'JSON Anzeigen' }}
              </button>
            </div>
            <div class="card-body">
              <div *ngIf="!showJson">
                <h6>{{ generatedChart.name }}</h6>
                <p><strong>ID:</strong> {{ generatedChart.id }}</p>
                <p><strong>Tasks:</strong> {{ generatedChart.tasks.length }}</p>
                <p><strong>Gruppen:</strong> {{ generatedChart.groups.length }}</p>
                
                <h6>Erste 5 Tasks:</h6>
                <div class="table-responsive">
                  <table class="table table-sm">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Titel</th>
                        <th>Status</th>
                        <th>Kinder</th>
                        <th>Dependencies</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr *ngFor="let task of generatedChart.tasks.slice(0, 5)">
                        <td><code>{{ task.id }}</code></td>
                        <td>{{ task.title }}</td>
                        <td><span class="badge bg-secondary">{{ task.status }}</span></td>
                        <td>{{ task.children.length }}</td>
                        <td>{{ task.dependencies.length }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              
              <div *ngIf="showJson">
                <pre class="bg-light p-3" style="max-height: 400px; overflow-y: auto;">{{ jsonData }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .card {
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    pre {
      font-size: 0.8rem;
      border-radius: 4px;
    }
    
    .table th {
      border-top: none;
    }
    
    .spinner-border-sm {
      width: 1rem;
      height: 1rem;
    }
  `]
})
export class TestDataGeneratorComponent {
  generatedChart: Chart | null = null;
  validationResult: ValidationResult | null = null;
  jsonData: string = '';
  isGenerating: boolean = false;
  showJson: boolean = false;

  generateTestData(): void {
    this.isGenerating = true;
    
    // Simuliere async Verhalten für bessere UX
    setTimeout(() => {
      try {
        const generator = new TestDataGenerator();
        
        // Generiere Chart
        this.generatedChart = generator.generateTestChart();
        
        // Validiere
        this.validationResult = generator.validateGeneratedData(this.generatedChart);
        
        // Serialisiere zu JSON
        this.jsonData = ChartSerialization.serializeChart(this.generatedChart);
        
        console.log('Testdaten erfolgreich generiert:', this.validationResult);
        
      } catch (error) {
        console.error('Fehler beim Generieren der Testdaten:', error);
        alert('Fehler beim Generieren der Testdaten. Siehe Konsole für Details.');
      } finally {
        this.isGenerating = false;
      }
    }, 100);
  }

  downloadJson(): void {
    if (!this.jsonData) return;
    
    const blob = new Blob([this.jsonData], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `testdata-chart-${new Date().toISOString().slice(0, 19)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  loadIntoApp(): void {
    if (!this.generatedChart) return;
    
    // Hier würden Sie den generierten Chart in Ihre App laden
    // Beispiel: Durch einen Service oder Event
    console.log('Chart wird in App geladen:', this.generatedChart);
    
    // Für Demonstration - Sie können dies an Ihre App-Logik anpassen
    if (typeof window !== 'undefined') {
      (window as any).loadTestChart?.(this.generatedChart);
    }
    
    alert('Chart wurde geladen! (Siehe Konsole für Details)');
  }

  toggleJsonView(): void {
    this.showJson = !this.showJson;
  }
}
