// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { GenerationComponent } from './components/generation/generation.component';
import { DetectionComponent } from './components/detection/detection.component';
import { RepairComponent } from './components/repair/repair.component';
import { WorkflowComponent } from './components/workflow/workflow.component';
import { DeploymentComponent } from './components/deployment/deployment.component';


export const routes: Routes = [
  { path: '', redirectTo: 'workflow', pathMatch: 'full' },
  { path: 'generation', component: GenerationComponent },
  { path: 'detection', component: DetectionComponent },
  { path: 'repair', component: RepairComponent },
  { path: 'deployment', component: DeploymentComponent },
  { path: 'workflow', component: WorkflowComponent }
];
