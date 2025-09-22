# Gantticus Testdaten Generator

Dieser Ordner enthält alle Tools und Skripte zur Generierung von Testdaten für das Gantticus-Projekt.

## 📁 Dateien

### **TypeScript Module (für Angular-Integration)**
- `testdata-generator.ts` - Hauptgenerator-Klasse
- `testdata-example.ts` - Beispiele und Utilities  
- `testdata-generator.component.ts` - Angular-Komponente mit UI

### **Node.js Konsolen-Skripte**
- `quick-testdata.js` - Schneller Generator für die Konsole
- `generate-testdata.js` - Ursprüngliches Konsolen-Skript
- `fix-testdata.py` - Python-Skript zur Korrektur bestehender Daten

### **Generierte Daten**
- `testdata-fixed.json` - Korrigierte Testdaten (ohne DEFAULT_GROUP_ID Problem)

## 🚀 **Verwendung**

### **1. Schnelle Konsolen-Generierung**
```bash
# Ins Verzeichnis wechseln
cd test-data-generation

# Testdaten generieren
node quick-testdata.js --output neue-testdaten.json --pretty
```

### **2. Angular-Integration**
```typescript
// In Angular-App importieren
import { TestDataGenerator } from '../test-data-generation/testdata-generator';

// Verwenden
const generator = new TestDataGenerator();
const chart = generator.generateTestChart();
```

### **3. UI-Komponente**
```typescript
// In Angular-Modul
import { TestDataGeneratorComponent } from '../test-data-generation/testdata-generator.component';

// In Template
<app-testdata-generator></app-testdata-generator>
```

## ⚙️ **Features**

- ✅ **250 Tasks** mit hierarchischen Strukturen
- ✅ **Korrekte Gruppenverwaltung** (keine DEFAULT_GROUP_ID)
- ✅ **Dependency-Validierung** (keine Zyklen)
- ✅ **Vollständige Validierung** der generierten Daten
- ✅ **Multiple Export-Formate** (JSON, TypeScript-Objekte)

## 🔧 **Import-Pfade**

Die Dateien verwenden relative Pfade zum Haupt-App-Verzeichnis:
```typescript
import { Chart } from '../src/app/domain/Chart';
import { Task, Group } from '../src/app/domain/Task';
import { ChartSerialization } from '../src/app/chart-serialization';
```

## 📋 **Nächste Schritte**

1. **Testen Sie die Generierung:**
   ```bash
   cd test-data-generation
   node quick-testdata.js
   ```

2. **Integrieren Sie in die App:**
   - Importieren Sie `TestDataGenerator` in Ihre Komponenten
   - Verwenden Sie `ChartSerialization.deserialize()` zum Laden

3. **Passen Sie die Parameter an:**
   - Editieren Sie die Konstanten in `testdata-generator.ts`
   - Anzahl Tasks, Gruppen, Dependencies, etc.

## 🐛 **Bekannte Fixes**

- ✅ **DEFAULT_GROUP_ID Problem behoben** - Tasks ohne Gruppe bekommen `group: undefined`
- ✅ **Zirkuläre Dependencies verhindert** - Mathematische Validierung
- ✅ **Eindeutige Kinder-Referenzen** - Keine mehrfachen Parent-Kind-Beziehungen
