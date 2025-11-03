const routes: Routes = [
  { path: 'generation', component: GenerationComponent },
  { path: 'detection', component: DetectionComponent },
  { path: 'repair', component: RepairComponent },
  { path: 'workflow', component: WorkflowComponent },
  { path: '', redirectTo: '/workflow', pathMatch: 'full' }
];
