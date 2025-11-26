import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { WorkflowDataService } from '../../workflow-data.service';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-generation',
  standalone: true,
  imports: [
    CommonModule,       // 基本指令如 *ngIf, *ngFor
    FormsModule,        // [(ngModel)]
    MatCardModule,      // <mat-card>
    MatFormFieldModule, // <mat-form-field>
    MatInputModule,     // <input matInput>
    MatButtonModule,    // <button mat-raised-button>
    HttpClientModule,
    MatSnackBarModule,
    RouterModule
  ],
  templateUrl: './generation.component.html',
  styleUrls: ['./generation.component.css']
})
export class GenerationComponent {
  description = '';
  generatedCode = '';
  isGenerating = false;

  private apiUrl = 'http://localhost:3000/api/generate';

  constructor(
    private http: HttpClient, 
    private snackBar: MatSnackBar,
    private router: Router,
    private workflowData: WorkflowDataService
  ) {}

  generateContract() {
    if (!this.description.trim()) {
      this.snackBar.open('请输入需求描述', '关闭', { duration: 2000 });
      return;
    }

    this.isGenerating = true;
    this.generatedCode = '';

    this.http.post<{ code: string }>(this.apiUrl, { description: this.description })
      .subscribe({
        next: (res) => {
          this.generatedCode = res.code;
          this.isGenerating = false;
        },
        error: (err) => {
          console.error('生成合约失败', err);
          this.snackBar.open('合约生成失败，请稍后重试', '关闭', { duration: 3000 });
          this.isGenerating = false;
        }
      });
  }

  // 跳转到检测页面
  goToDetection() {
    if (!this.generatedCode.trim()) {
      this.snackBar.open('请先生成合约代码', '关闭', { duration: 2000 });
      return;
    }
    
    // 保存生成的代码
    this.workflowData.updateGeneratedCode(this.generatedCode);
    this.router.navigate(['/detection']);
  }
  
}