import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { GANTT_GLOBAL_CONFIG, GanttI18nLocale, GanttLinkLineType, NgxGanttModule } from '@worktile/gantt';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { FormsModule } from '@angular/forms';

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    NgxGanttModule,
    NgbModule,
    FormsModule
  ],
  providers : [
    {
      provide: GANTT_GLOBAL_CONFIG,
      useValue: {
        locale: GanttI18nLocale.enUs,
        linkOptions: {
          showArrow: true,
          lineType: GanttLinkLineType.straight
        }
      },
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
