#!/usr/bin/env node

/**
 * Konsolen-Skript zum Generieren von Testdaten für Gantticus
 * 
 * Verwendung:
 *   node generate-testdata.js [Optionen]
 * 
 * Optionen:
 *   --output-file <datei>  Speichert JSON in angegebene Datei
 *   --charts <anzahl>      Generiert mehrere Charts (Standard: 1)
 *   --validate             Führt Validierung durch (Standard: true)
 *   --verbose              Ausführliche Ausgabe
 */

// Diese Implementierung würde in einer echten Node.js Umgebung laufen
// Hier als Template für TypeScript/JavaScript Ausführung

const fs = require('fs');
const path = require('path');

// Simulierte Imports - in echter Umgebung würden diese aus den TS-Modulen kommen
// import { TestDataGenerator } from './testdata-generator';
// import { ChartSerialization } from './chart-serialization';

class ConsoleTestDataGenerator {
  
  static run() {
    const args = process.argv.slice(2);
    const options = this.parseArguments(args);
    
    console.log('🚀 Gantticus Testdaten Generator');
    console.log('================================');
    
    if (options.verbose) {
      console.log('Optionen:', JSON.stringify(options, null, 2));
    }
    
    try {
      // Hier würde der echte Generator aufgerufen
      const testData = this.generateTestData(options);
      
      if (options.outputFile) {
        this.saveToFile(testData, options.outputFile);
        console.log(`✅ Testdaten gespeichert in: ${options.outputFile}`);
      } else {
        console.log('\n📊 Generierte Testdaten:');
        console.log(testData.substring(0, 500) + '...[gekürzt]');
      }
      
    } catch (error) {
      console.error('❌ Fehler beim Generieren:', error.message);
      process.exit(1);
    }
  }
  
  static parseArguments(args) {
    const options = {
      outputFile: null,
      charts: 1,
      validate: true,
      verbose: false
    };
    
    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case '--output-file':
          options.outputFile = args[++i];
          break;
        case '--charts':
          options.charts = parseInt(args[++i]) || 1;
          break;
        case '--no-validate':
          options.validate = false;
          break;
        case '--verbose':
          options.verbose = true;
          break;
        case '--help':
          this.showHelp();
          process.exit(0);
      }
    }
    
    return options;
  }
  
  static generateTestData(options) {
    // Simulierte Testdaten-Generierung
    // In echter Implementierung:
    // const generator = new TestDataGenerator();
    // return generator.generateTestDataAsJson();
    
    const mockChart = {
      id: `test-chart-${Date.now()}`,
      name: 'Generated Test Chart',
      tasks: Array.from({ length: 250 }, (_, i) => ({
        id: `task-${String(i + 1).padStart(6, '0')}`,
        title: `Test Task ${i + 1}`,
        status: 'OPEN',
        progress: Math.random(),
        children: [],
        dependencies: []
      })),
      groups: [
        { id: 'DEFAULT_GROUP_ID', title: 'Standard', color: '#6c757d' }
      ],
      expanded: {},
      filter: {
        taskFilter: '',
        showOpenTasks: true,
        showInProgressTasks: true,
        showDoneTasks: true,
        showArchivedTasks: false
      }
    };
    
    return JSON.stringify(mockChart, null, 2);
  }
  
  static saveToFile(data, filename) {
    const fullPath = path.resolve(filename);
    fs.writeFileSync(fullPath, data, 'utf8');
  }
  
  static showHelp() {
    console.log(`
Gantticus Testdaten Generator

Verwendung:
  node generate-testdata.js [Optionen]

Optionen:
  --output-file <datei>    Speichert JSON in angegebene Datei
  --charts <anzahl>        Generiert mehrere Charts (Standard: 1)
  --no-validate           Überspringt Validierung
  --verbose               Ausführliche Ausgabe
  --help                  Zeigt diese Hilfe

Beispiele:
  node generate-testdata.js
  node generate-testdata.js --output-file testdata.json
  node generate-testdata.js --charts 3 --output-file multiple-charts.json
  node generate-testdata.js --verbose --output-file detailed-testdata.json
`);
  }
}

// Hauptausführung wenn Skript direkt aufgerufen wird
if (require.main === module) {
  ConsoleTestDataGenerator.run();
}

module.exports = ConsoleTestDataGenerator;
