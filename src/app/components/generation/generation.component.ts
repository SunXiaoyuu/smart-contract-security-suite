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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
@Component({
  selector: 'app-generation',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    HttpClientModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
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
          this.snackBar.open('合约生成成功！', '关闭', { duration: 2000 });
        },
        error: (err) => {
          console.error('生成合约失败', err);
          this.snackBar.open('合约生成失败，请稍后重试', '关闭', { duration: 3000 });
          this.isGenerating = false;
        }
      });
  }

  goToDetection() {
    if (!this.generatedCode.trim()) {
      this.snackBar.open('请先生成合约代码', '关闭', { duration: 2000 });
      return;
    }

    this.workflowData.updateGeneratedCode(this.generatedCode);
    this.router.navigate(['/detection']);
  }

  // 新增：清空代码功能
  clearCode() {
    this.generatedCode = '';
    this.snackBar.open('已清空生成的代码', '关闭', { duration: 2000 });
  }

  // 新增：复制代码功能
  copyCode() {
    navigator.clipboard.writeText(this.generatedCode).then(() => {
      this.snackBar.open('代码已复制到剪贴板', '关闭', { duration: 2000 });
    }).catch(err => {
      console.error('复制失败:', err);
      this.snackBar.open('复制失败', '关闭', { duration: 2000 });
    });
  }
}
