import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ColorPickerDirective } from 'ngx-color-picker';
import { WorkTimeService, Project } from '../../features/time-tracking/work-time.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-project-editor-modal',
  imports: [CommonModule, FormsModule, ColorPickerDirective],
  templateUrl: './project-editor-modal.component.html',
  styleUrl: './project-editor-modal.component.scss',
  standalone: true
})
export class ProjectEditorModalComponent implements OnInit, OnDestroy {
  @Input() visible: boolean = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() closed = new EventEmitter<void>();

  projects: Project[] = [];

  // Edit State
  editingProject: string | null = null;
  editName: string = '';
  editColor: string = '';
  editUrl: string = '';
  editError: string = '';

  // Neues Projekt
  showNewProject: boolean = false;
  newProjectName: string = '';
  newProjectColor: string = '';
  newProjectUrl: string = '';
  newProjectError: string = '';

  // Delete-Bestätigung
  confirmingDelete: string | null = null;

  private subscription?: Subscription;

  constructor(private workTimeService: WorkTimeService) {}

  ngOnInit(): void {
    this.loadProjects();
    this.subscription = this.workTimeService.state$.subscribe(() => {
      this.loadProjects();
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  /**
   * Lädt alle Projekte
   */
  private loadProjects(): void {
    this.projects = this.workTimeService.getAllProjects();
  }

  /**
   * Schließt das Modal und setzt alle Edit-States zurück
   */
  close(): void {
    this.cancelEdit();
    this.cancelNewProject();
    this.confirmingDelete = null;
    this.visible = false;
    this.visibleChange.emit(false);
    this.closed.emit();
  }

  // ===== Edit =====

  startEdit(project: Project): void {
    this.cancelNewProject();
    this.confirmingDelete = null;
    this.editingProject = project.name;
    this.editName = project.name;
    this.editColor = project.color;
    this.editUrl = project.url || '';
    this.editError = '';

    setTimeout(() => {
      const input = document.querySelector('.project-edit-name-input') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 50);
  }

  saveEdit(): void {
    if (!this.editingProject) return;

    const newName = this.editName.trim();
    if (!newName) {
      this.editError = 'Der Projektname darf nicht leer sein.';
      return;
    }

    // Name geändert?
    if (this.editingProject !== newName) {
      const success = this.workTimeService.renameProject(this.editingProject, newName);
      if (!success) {
        this.editError = `Ein Projekt mit dem Namen „${newName}" existiert bereits.`;
        return;
      }
    }

    // Farbe und URL aktualisieren
    this.workTimeService.updateProject(newName, {
      color: this.editColor,
      url: this.editUrl
    });

    this.editingProject = null;
    this.editName = '';
    this.editColor = '';
    this.editUrl = '';
    this.editError = '';
  }

  cancelEdit(): void {
    this.editingProject = null;
    this.editName = '';
    this.editColor = '';
    this.editUrl = '';
    this.editError = '';
  }

  onEditColorChange(color: string): void {
    this.editColor = color;
  }

  onEditKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.saveEdit();
    } else if (event.key === 'Escape') {
      this.cancelEdit();
    }
  }

  // ===== Neues Projekt =====

  startNewProject(): void {
    this.cancelEdit();
    this.confirmingDelete = null;
    this.showNewProject = true;
    this.newProjectName = '';
    this.newProjectUrl = '';
    this.newProjectError = '';
    // Zufällige Farbe aus der Palette vorschlagen
    const palette = this.workTimeService.getColorPalette();
    this.newProjectColor = palette[Math.floor(Math.random() * palette.length)];

    setTimeout(() => {
      const input = document.querySelector('.new-project-name-input') as HTMLInputElement;
      if (input) {
        input.focus();
      }
    }, 50);
  }

  createNewProject(): void {
    const projectName = this.newProjectName.trim();
    if (!projectName) {
      this.newProjectError = 'Der Projektname darf nicht leer sein.';
      return;
    }

    // Prüfe ob Name bereits existiert
    const existing = this.workTimeService.getUsedProjectNames();
    if (existing.some(n => n.toLowerCase() === projectName.toLowerCase())) {
      this.newProjectError = `Ein Projekt mit dem Namen „${projectName}" existiert bereits.`;
      return;
    }

    this.workTimeService.registerProject(projectName);
    this.workTimeService.updateProject(projectName, {
      color: this.newProjectColor,
      url: this.newProjectUrl
    });

    this.showNewProject = false;
    this.newProjectName = '';
    this.newProjectColor = '';
    this.newProjectUrl = '';
    this.newProjectError = '';
  }

  cancelNewProject(): void {
    this.showNewProject = false;
    this.newProjectName = '';
    this.newProjectColor = '';
    this.newProjectUrl = '';
    this.newProjectError = '';
  }

  onNewProjectColorChange(color: string): void {
    this.newProjectColor = color;
  }

  onNewProjectKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.createNewProject();
    } else if (event.key === 'Escape') {
      this.cancelNewProject();
    }
  }

  // ===== Delete =====

  startDelete(projectName: string): void {
    this.cancelEdit();
    this.cancelNewProject();
    this.confirmingDelete = projectName;
  }

  confirmDelete(): void {
    if (!this.confirmingDelete) return;

    this.workTimeService.deleteProject(this.confirmingDelete);
    this.confirmingDelete = null;
  }

  cancelDelete(): void {
    this.confirmingDelete = null;
  }

  /**
   * Gibt die Anzahl der Blöcke zurück, die diesem Projekt zugeordnet sind
   */
  getBlockCount(projectName: string): number {
    return this.workTimeService.getAllBlocks()
      .filter(b => b.projectName === projectName).length;
  }

  // ===== Modal Keyboard Handler =====

  onModalKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.editingProject) {
        this.cancelEdit();
      } else if (this.showNewProject) {
        this.cancelNewProject();
      } else if (this.confirmingDelete) {
        this.cancelDelete();
      } else {
        this.close();
      }
    }
  }
}
