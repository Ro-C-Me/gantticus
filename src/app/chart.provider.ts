import { InjectionToken } from '@angular/core';
import { Chart } from './domain/Chart';

/**
 * Interface für den Chart-Provider, um Services Zugriff auf das aktuelle Chart zu geben.
 * Dies ermöglicht es Services, Chart-Änderungen vorzunehmen ohne direkte Chart-Parameter zu benötigen.
 */
export interface ChartProvider {
  /**
   * Gibt das aktuelle Chart zurück
   */
  getChart(): Chart;
  
  /**
   * Setzt ein neues Chart (z.B. nach Undo/Redo-Operationen)
   */
  setChart(chart: Chart): void;
  
  /**
   * Triggert ein UI-Update nach Chart-Änderungen
   */
  triggerUpdate(): void;
}

/**
 * Injection Token für den Chart-Provider
 */
export const CHART_PROVIDER = new InjectionToken<ChartProvider>('ChartProvider');