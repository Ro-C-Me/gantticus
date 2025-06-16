import { NgModule, LOCALE_ID } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { GANTT_GLOBAL_CONFIG, GanttI18nLocale, GanttLinkLineType, GanttLinkType, NgxGanttModule } from '@worktile/gantt';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { FormsModule,  ReactiveFormsModule  } from '@angular/forms';
import { TaskEditModalComponent } from './task-edit-modal/task-edit-modal.component';
import { TaskTitleComponent } from "./task-title/task-title.component";
import { GroupTitleComponent } from './group-title/group-title.component';
import { DependencyManagementComponent } from './dependency-management/dependency-management.component';
import { routes } from './app.routes';
import { RouterModule } from '@angular/router';
import localeDe from '@angular/common/locales/de';
import localeEn from '@angular/common/locales/en';
import { registerLocaleData } from '@angular/common';

registerLocaleData(localeDe, 'de');
registerLocaleData(localeEn, 'en');
@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    RouterModule.forRoot(routes),
    BrowserModule,
    NgxGanttModule,
    NgbModule,
    FormsModule,
    ReactiveFormsModule,
    TaskTitleComponent,
    GroupTitleComponent,
    DependencyManagementComponent
],
  providers : [
    { provide: LOCALE_ID, useValue: navigator.language ?? 'en' },
    {
      provide: GANTT_GLOBAL_CONFIG,
      useValue: {
        locale: GanttI18nLocale.enUs,
        linkOptions: {
          dependencyTypes: [GanttLinkType.ff, GanttLinkType.fs, GanttLinkType.sf, GanttLinkType.ss],
          showArrow: true,
          lineType: GanttLinkLineType.curve
        },
        styleOptions: {
          lineHeight: 25,
          barHeight: 15
        }
      },
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
