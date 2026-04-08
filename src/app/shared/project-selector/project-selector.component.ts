import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WorkTimeService } from '../../features/time-tracking/work-time.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-project-selector',
  imports: [CommonModule, FormsModule],
  templateUrl: './project-selector.component.html',
  styleUrl: './project-selector.component.scss',
  standalone: true
})
export class ProjectSelectorComponent implements OnInit, OnDestroy {
  @Input() selectedProject: string = '';
  @Input() allowNewProject: boolean = true;
  @Input() placeholder: string = 'Projekt auswählen';
  @Input() size: 'sm' | 'md' = 'sm';
  @Output() projectSelected = new EventEmitter<string>();
  @Output() manageProjects = new EventEmitter<void>();
  
  availableProjects: string[] = [];
  showNewProjectInput: boolean = false;
  newProjectName: string = '';
  
  private subscription?: Subscription;
  
  constructor(private workTimeService: WorkTimeService) {}
  
  ngOnInit(): void {
    this.loadAvailableProjects();
    
    // Live-Updates abonnieren: Wenn sich der Service-State ändert, Projekte neu laden
    this.subscription = this.workTimeService.state$.subscribe(() => {
      this.loadAvailableProjects();
    });
  }
  
  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }
  
  /**
   * Lädt verfügbare Projekte
   */
  private loadAvailableProjects(): void {
    this.availableProjects = this.workTimeService.getUsedProjectNames();
  }
  
  /**
   * Wird aufgerufen wenn Dropdown-Wert sich ändert
   */
  onDropdownChange(value: string): void {
    if (value === '__new__') {
      this.showNewProjectInput = true;
      this.newProjectName = '';
      
      // Fokus auf Input-Feld setzen
      setTimeout(() => {
        const input = document.getElementById('newProjectInput') as HTMLInputElement;
        if (input) {
          input.focus();
        }
      }, 100);
    } else if (value === '__manage__') {
      // Dropdown zurücksetzen auf vorherigen Wert (nicht "__manage__" anzeigen)
      // und Event emittieren
      this.selectedProject = this.selectedProject; // Wert beibehalten
      this.manageProjects.emit();
    } else {
      // Auch bei leerem String (Kein Projekt) das Event feuern
      this.showNewProjectInput = false;
      this.selectedProject = value;
      this.projectSelected.emit(value);
    }
  }
  
  /**
   * Erstellt ein neues Projekt
   */
  createNewProject(): void {
    const projectName = this.newProjectName.trim();
    
    if (!projectName) {
      this.cancelNewProject();
      return;
    }
    
    // Projekt sofort im Service registrieren (mit automatischer Farbe)
    this.workTimeService.registerProject(projectName);
    
    this.selectedProject = projectName;
    this.showNewProjectInput = false;
    this.newProjectName = '';
    
    // Emit das neue Projekt
    this.projectSelected.emit(projectName);
  }
  
  /**
   * Bricht die Erstellung eines neuen Projekts ab
   */
  cancelNewProject(): void {
    this.showNewProjectInput = false;
    this.newProjectName = '';
  }

  /**
   * Öffnet den Projekt-Editor
   */
  onManageProjects(): void {
    this.manageProjects.emit();
  }
  
  /**
   * Gibt die CSS-Klasse für die Form-Größe zurück
   */
  getSizeClass(): string {
    return this.size === 'sm' ? 'form-select-sm' : '';
  }
}
