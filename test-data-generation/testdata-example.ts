import { TestDataGenerator } from './testdata-generator';
import { ChartSerialization } from '../src/app/chart-serialization';

/**
 * Beispielskript zum Generieren und Ausgeben von Testdaten
 */
export class TestDataExample {
  
  static generateAndPrintTestData(): { chart: any, jsonData: string, validation: any } {
    console.log('=== Gantticus Test Data Generator ===');
    
    const generator = new TestDataGenerator();
    
    // Generiere Test-Chart
    const chart = generator.generateTestChart();
    
    // Validiere die generierten Daten
    const validation = generator.validateGeneratedData(chart);
    
    console.log('\n=== Validierung ===');
    console.log(`Gültig: ${validation.valid ? '✓' : '✗'}`);
    
    if (validation.errors.length > 0) {
      console.log('\nFehler:');
      validation.errors.forEach(error => console.log(`- ${error}`));
    }
    
    if (validation.warnings.length > 0) {
      console.log('\nWarnungen:');
      validation.warnings.forEach(warning => console.log(`- ${warning}`));
    }
    
    console.log('\n=== Statistiken ===');
    console.log(`Gesamt Tasks: ${validation.stats.totalTasks}`);
    console.log(`Sub-Tasks: ${validation.stats.subTasks}`);
    console.log(`Tasks mit Dependencies: ${validation.stats.tasksWithDependencies}`);
    console.log(`Gesamt Dependencies: ${validation.stats.totalDependencies}`);
    
    // Serialisiere das Chart als JSON
    const jsonData = ChartSerialization.serializeChart(chart);
    
    console.log('\n=== JSON Export ===');
    console.log('Chart wurde serialisiert. Länge:', jsonData.length, 'Zeichen');
    
    // Optional: JSON in Datei schreiben oder in die Konsole ausgeben
    if (typeof process !== 'undefined' && process.argv.includes('--output-json')) {
      console.log('\n=== JSON Daten ===');
      console.log(jsonData);
    }
    
    return { chart, jsonData, validation };
  }
  
  static generateMultipleCharts(count: number = 3): { charts: any[], jsonData: string } {
    console.log(`\n=== Generiere ${count} Test-Charts ===`);
    
    const generator = new TestDataGenerator();
    const charts = generator.generateMultipleTestCharts(count);
    
    charts.forEach((chart, index) => {
      const validation = generator.validateGeneratedData(chart);
      console.log(`Chart ${index + 1}: ${validation.valid ? '✓' : '✗'} - ${validation.stats.totalTasks} Tasks`);
    });
    
    // Serialisiere alle Charts als Array
    const jsonData = ChartSerialization.serialize(charts);
    console.log(`Alle Charts serialisiert. Länge: ${jsonData.length} Zeichen`);
    
    return { charts, jsonData };
  }
  
  /**
   * Generiert Testdaten und gibt sie direkt als JSON zurück
   */
  static getTestDataAsJson(): string {
    const generator = new TestDataGenerator();
    return generator.generateTestDataAsJson();
  }
  
  /**
   * Lädt das generierte Chart in die Anwendung (für Integration)
   */
  static loadTestDataIntoApp(): any {
    const jsonData = this.getTestDataAsJson();
    return ChartSerialization.deserialize(jsonData);
  }
}

// Wenn das Skript direkt ausgeführt wird
if (typeof window === 'undefined' && typeof require !== 'undefined') {
  // Node.js Umgebung - führe das Beispiel aus
  TestDataExample.generateAndPrintTestData();
  TestDataExample.generateMultipleCharts(2);
}
