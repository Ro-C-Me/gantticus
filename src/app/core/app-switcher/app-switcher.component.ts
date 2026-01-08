import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AVAILABLE_APPS, AppDefinition } from '../models/app-definition';

@Component({
  selector: 'app-switcher',
  templateUrl: './app-switcher.component.html',
  styleUrl: './app-switcher.component.scss',
  standalone: false
})
export class AppSwitcherComponent {
  apps = AVAILABLE_APPS;
  isOpen = false;

  constructor(private router: Router) {}

  get currentApp(): AppDefinition | undefined {
    const currentRoute = this.router.url.split('?')[0];
    return this.apps.find(app => currentRoute.startsWith(app.route));
  }

  toggleSwitcher() {
    this.isOpen = !this.isOpen;
  }

  switchToApp(app: AppDefinition) {
    this.router.navigate([app.route]);
    this.isOpen = false;
  }

  // Click außerhalb des Switchers schließt ihn
  onClickOutside() {
    this.isOpen = false;
  }
}
