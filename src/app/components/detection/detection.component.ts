import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
@Component({
  selector: 'app-detection',
  standalone: true,
  imports: [
    CommonModule,       // ✅ *ngIf, *ngFor
    FormsModule,        // ✅ [(ngModel)]
    MatCardModule,      // ✅ <mat-card>
    MatButtonModule,    // ✅ <button mat-raised-button>
    MatListModule,      // ✅ <mat-list> / <mat-list-item>
    MatFormFieldModule, // ✅ <mat-form-field>
    MatInputModule      // ✅ <textarea matInput>
  ],
  templateUrl: './detection.component.html',
  styleUrls: ['./detection.component.css']
})
export class DetectionComponent {
  code: string = ''; // ✅ 必须声明
  report: any = null; // ✅ 用于 *ngIf="report"

  detect() {
    // 模拟返回漏洞报告
    this.report = {
      vulnerabilities: [
        { type: '重入攻击', line: 22, severity: '高', suggestion: '使用ReentrancyGuard修复' },
        { type: '整数溢出', line: 45, severity: '中', suggestion: '使用SafeMath库' },
      ]
    };
  }
}
