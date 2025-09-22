#!/usr/bin/env node

/**
 * Schneller Testdaten-Generator für die Konsole
 * Generiert ein Chart mit 250 Tasks direkt als JSON
 */

function generateQuickTestData() {
  console.log('🚀 Generiere Gantticus Testdaten...');
  
  const chart = {
    id: `test-chart-${Date.now()}`,
    name: 'Test Chart mit 250 Tasks',
    tasks: [],
    groups: [
      { id: 'group-1', title: 'Frontend', color: '#007bff' },
      { id: 'group-2', title: 'Backend', color: '#28a745' },
      { id: 'group-3', title: 'Testing', color: '#ffc107' },
      { id: 'group-4', title: 'Deployment', color: '#dc3545' },
      { id: 'group-5', title: 'Documentation', color: '#6f42c1' }
    ],
    expanded: {},
    filter: {
      taskFilter: '',
      showDownstreamDeps: false,
      showUpstreamDeps: false,
      showOpenTasks: true,
      showInProgressTasks: true,
      showDoneTasks: true,
      showArchivedTasks: false
    }
  };

  const statuses = ['OPEN', 'IN_PROGRESS', 'DONE', 'ARCHIVED'];
  const statusWeights = [0.4, 0.3, 0.25, 0.05];
  const depTypes = ['fs', 'ff', 'ss', 'sf'];
  const depTypeWeights = [0.7, 0.15, 0.1, 0.05];
  const groupIds = ['group-1', 'group-2', 'group-3', 'group-4', 'group-5'];
  
  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd', '#98d8c8', '#f7dc6f', '#bb8fce', '#85c1e9'];

  function getRandomWeighted(items, weights) {
    const random = Math.random();
    let cumulative = 0;
    for (let i = 0; i < weights.length; i++) {
      cumulative += weights[i];
      if (random <= cumulative) return items[i];
    }
    return items[0];
  }

  function createTask(id, title, groupId = null) {
    const baseDate = new Date('2025-01-01');
    const startOffset = Math.floor(Math.random() * 365);
    const start = new Date(baseDate.getTime() + startOffset * 24 * 60 * 60 * 1000);
    const duration = Math.floor(Math.random() * 10) + 1;
    const end = new Date(start.getTime() + duration * 24 * 60 * 60 * 1000);

    return {
      id,
      title,
      status: getRandomWeighted(statuses, statusWeights),
      progress: Math.random(),
      ticketUrl: '',
      color: Math.random() < 0.2 ? colors[Math.floor(Math.random() * colors.length)] : undefined,
      scheduleFinalized: Math.random() < 0.3,
      computeFromChildren: Math.random() < 0.2,
      computedStart: start,
      computedEnd: end,
      dependencies: [],
      start,
      end,
      earliestBegin: Math.random() < 0.3 ? new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000) : undefined,
      latestEnd: Math.random() < 0.3 ? new Date(end.getTime() + 7 * 24 * 60 * 60 * 1000) : undefined,
      duration,
      milestone: Math.random() < 0.1,
      group: groupId || (Math.random() < 0.3 ? undefined : groupIds[Math.floor(Math.random() * groupIds.length)]),
      children: []
    };
  }

  // Schritt 1: Erstelle alle 250 Tasks
  console.log('📝 Erstelle 250 Tasks...');
  for (let i = 1; i <= 250; i++) {
    const task = createTask(`task-${String(i).padStart(6, '0')}`, `Task ${i}`);
    chart.tasks.push(task);
  }

  // Schritt 2: Erstelle hierarchische Struktur (50 Tasks mit Sub-Tasks)
  console.log('🌳 Erstelle hierarchische Struktur...');
  const usedAsChild = new Set();
  const rootTasksForSubTasks = shuffleArray([...chart.tasks]).slice(0, 50);

  for (const parentTask of rootTasksForSubTasks) {
    const availableChildren = chart.tasks.filter(t => 
      t.id !== parentTask.id && 
      !usedAsChild.has(t.id) &&
      !parentTask.children.includes(t.id)
    );
    
    if (availableChildren.length > 0) {
      const childCount = Math.floor(Math.random() * 4) + 1; // 1-4 Kinder
      const selectedChildren = shuffleArray(availableChildren).slice(0, Math.min(childCount, availableChildren.length));
      
      for (const child of selectedChildren) {
        parentTask.children.push(child.id);
        usedAsChild.add(child.id);
        
        // Chance auf weitere Sub-Sub-Tasks (max 3 weitere Ebenen)
        if (Math.random() < 0.4) {
          const grandChildren = chart.tasks.filter(t => 
            t.id !== child.id && 
            t.id !== parentTask.id &&
            !usedAsChild.has(t.id)
          );
          
          if (grandChildren.length > 0) {
            const grandChild = grandChildren[Math.floor(Math.random() * grandChildren.length)];
            child.children.push(grandChild.id);
            usedAsChild.add(grandChild.id);
          }
        }
      }
    }
  }

  // Schritt 3: Füge Dependencies hinzu (2/3 der Tasks)
  console.log('🔗 Füge Dependencies hinzu...');
  const tasksForDependencies = Math.floor(chart.tasks.length * 2/3);
  const shuffledTasks = shuffleArray([...chart.tasks]);

  for (let i = 0; i < tasksForDependencies; i++) {
    const task = shuffledTasks[i];
    const dependencyCount = Math.floor(Math.random() * 3) + 1; // 1-3 Dependencies
    
    const availableTargets = chart.tasks.filter(t => 
      t.id !== task.id &&
      !task.dependencies.some(d => d.taskId === t.id)
    );
    
    if (availableTargets.length > 0) {
      const selectedTargets = shuffleArray(availableTargets).slice(0, Math.min(dependencyCount, availableTargets.length));
      
      for (const target of selectedTargets) {
        task.dependencies.push({
          taskId: target.id,
          type: getRandomWeighted(depTypes, depTypeWeights)
        });
      }
    }
  }

  function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Statistiken
  const subTasks = chart.tasks.filter(t => usedAsChild.has(t.id)).length;
  const tasksWithDeps = chart.tasks.filter(t => t.dependencies.length > 0).length;
  const totalDeps = chart.tasks.reduce((sum, t) => sum + t.dependencies.length, 0);

  console.log('✅ Generierung abgeschlossen!');
  console.log(`📊 Statistiken:`);
  console.log(`   - Gesamt Tasks: ${chart.tasks.length}`);
  console.log(`   - Sub-Tasks: ${subTasks}`);
  console.log(`   - Tasks mit Dependencies: ${tasksWithDeps}`);
  console.log(`   - Gesamt Dependencies: ${totalDeps}`);
  console.log(`   - Gruppen: ${chart.groups.length}`);

  return chart;
}

// Hauptausführung
function main() {
  const args = process.argv.slice(2);
  const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;
  const prettyPrint = args.includes('--pretty');

  try {
    const chart = generateQuickTestData();
    const jsonData = prettyPrint ? JSON.stringify(chart, null, 2) : JSON.stringify(chart);

    if (outputFile) {
      const fs = require('fs');
      fs.writeFileSync(outputFile, jsonData, 'utf8');
      console.log(`💾 Daten gespeichert in: ${outputFile}`);
      console.log(`📏 Dateigröße: ${(jsonData.length / 1024).toFixed(1)} KB`);
    } else {
      console.log('\n📋 JSON Daten (erste 500 Zeichen):');
      console.log(jsonData.substring(0, 500) + '...');
      console.log('\n💡 Tipp: Verwenden Sie --output datei.json um in Datei zu speichern');
      console.log('💡 Tipp: Verwenden Sie --pretty für formatierte Ausgabe');
    }

  } catch (error) {
    console.error('❌ Fehler:', error.message);
    process.exit(1);
  }
}

// Hilfe anzeigen
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
🚀 Gantticus Quick Testdata Generator

Verwendung:
  node quick-testdata.js [Optionen]

Optionen:
  --output <datei>    Speichert JSON in angegebene Datei
  --pretty           Formatiert JSON lesbar
  --help, -h         Zeigt diese Hilfe

Beispiele:
  node quick-testdata.js
  node quick-testdata.js --output testdata.json
  node quick-testdata.js --output testdata.json --pretty
`);
  process.exit(0);
}

// Ausführen
main();
