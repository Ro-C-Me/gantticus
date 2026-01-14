import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WorkTimeService } from '../../features/time-tracking/work-time.service';

@Component({
  selector: 'app-project-selector',
  imports: [CommonModule, FormsModule],
  templateUrl: './project-selector.component.html',
  styleUrl: './project-selector.component.scss',
  standalone: true
})
export class ProjectSelectorComponent implements OnInit {
  @Input() selectedProject: string = '';
  @Input() allowNewProject: boolean = true;
  @Input() placeholder: string = 'Projekt auswählen';
  @Input() size: 'sm' | 'md' = 'sm';
  @Output() projectSelected = new EventEmitter<string>();
  
  availableProjects: string[] = [];
  showNewProjectInput: boolean = false;
  newProjectName: string = '';
  
  constructor(private workTimeService: WorkTimeService) {}
  
  ngOnInit(): void {
    this.loadAvailableProjects();
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
    } else {
      // Auch bei leerem String (Kein Projekt) das Event feuern
      this.showNewProjectInput = false;
      this.selectedProject = value;
      this.projectSelected.emit(value); // Emittiert auch '', wenn "<Kein Projekt>" gewählt
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
    
    this.selectedProject = projectName;
    this.showNewProjectInput = false;
    this.newProjectName = '';
    
    // Emit das neue Projekt
    this.projectSelected.emit(projectName);
    
    // Projekte neu laden
    this.loadAvailableProjects();
  }
  
  /**
   * Bricht die Erstellung eines neuen Projekts ab
   */
  cancelNewProject(): void {
    this.showNewProjectInput = false;
    this.newProjectName = '';
  }
  
  /**
   * Gibt die CSS-Klasse für die Form-Größe zurück
   */
  getSizeClass(): string {
    return this.size === 'sm' ? 'form-select-sm' : '';
  }
}
