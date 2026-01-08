import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-navbar',
  templateUrl: './app-navbar.component.html',
  styleUrl: './app-navbar.component.scss',
  standalone: false
})
export class AppNavbarComponent {
  @Input() title: string = 'Gantticus';
  @Input() showActions: boolean = true;
}
