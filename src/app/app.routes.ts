import { Routes } from '@angular/router';
import { AppComponent } from './app.component';
import { GanttFeatureComponent } from './features/gantt/gantt-feature.component';
import { TimeTrackingComponent } from './features/time-tracking/time-tracking.component';

export const routes: Routes = [
  { path: '', redirectTo: '/gantt', pathMatch: 'full' },
  { path: 'gantt', component: GanttFeatureComponent },
  { path: 'timetracking', component: TimeTrackingComponent },
];
