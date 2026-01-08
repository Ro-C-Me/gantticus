export interface AppDefinition {
  id: string;
  name: string;
  icon: string;
  route: string;
  description?: string;
}

export const AVAILABLE_APPS: AppDefinition[] = [
  {
    id: 'gantt',
    name: 'Gantt Charts',
    icon: 'bi-diagram-3',
    route: '/gantt',
    description: 'Projektplanung mit Gantt-Diagrammen'
  },
  {
    id: 'timetracking',
    name: 'Time Tracking',
    icon: 'bi-stopwatch',
    route: '/timetracking',
    description: 'Zeiterfassung für Projekte'
  }
];
