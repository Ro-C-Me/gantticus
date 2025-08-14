import { Injectable } from '@angular/core';

export interface Toast {
  header: string;
  body: string;
  classname: string;
  icon: string;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private toasts: Toast[] = [];

  getToasts(): Toast[] {
    return this.toasts;
  }

  showError(header: string, body: string): void {
    this.show(header, body, 'bg-danger text-light', 'bi-exclamation-triangle-fill');
  }

  showSuccess(header: string, body: string): void {
    this.show(header, body, 'bg-success text-light', 'bi-check-circle-fill');
  }

  showInfo(header: string, body: string): void {
    this.show(header, body, 'bg-info text-light', 'bi-info-circle-fill');
  }

  showWarning(header: string, body: string): void {
    this.show(header, body, 'bg-warning text-dark', 'bi-exclamation-triangle-fill');
  }

  private show(header: string, body: string, classname: string, icon: string): void {
    const toast: Toast = {
      header,
      body,
      classname,
      icon
    };
    this.toasts.push(toast);
  }

  remove(toast: Toast): void {
    this.toasts = this.toasts.filter(t => t !== toast);
  }

  clear(): void {
    this.toasts = [];
  }
}
