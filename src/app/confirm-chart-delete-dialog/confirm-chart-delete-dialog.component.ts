import { Component, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-confirm-chart-delete-dialog',
  imports: [],
  templateUrl: './confirm-chart-delete-dialog.component.html',
  styleUrl: './confirm-chart-delete-dialog.component.scss'
})
export class ConfirmChartDeleteDialogComponent {

  @Input() title: string = 'Bestätigung';
  @Input() message: string = 'Sind Sie sicher?';
  @Input() btnOkText: string = 'Ja';
  @Input() btnCancelText: string = 'Nein';

  constructor(public activeModal: NgbActiveModal) {}

  public decline() {
    this.activeModal.close(false);
  }

  public accept() {
    this.activeModal.close(true);
  }
}
