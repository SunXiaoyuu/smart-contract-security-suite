import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router, RouterModule } from '@angular/router';
import { WorkflowDataService } from '../../workflow-data.service';

interface Vulnerability {
  type: string;
  line: number;
  severity: string;
  suggestion: string;
}

interface DetectionReport {
  vulnerabilities: Vulnerability[];
  summary?: {
    total: number;
    high: number;
    medium: number;
    low: number;
  };
}

@Component({
  selector: 'app-detection',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatListModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSnackBarModule,
    HttpClientModule,
    RouterModule
  ],
  templateUrl: './detection.component.html',
  styleUrls: ['./detection.component.css']
})
export class DetectionComponent {
  code: string = '';
  report: DetectionReport | null = null;
  fullReport: SafeHtml | null = null;
  isDetecting: boolean = false;
  isGeneratingReport: boolean = false;
  errorMessage: string = '';

  private apiUrl = 'http://localhost:3000/api/detect';
  private reportApiUrl = 'http://localhost:3000/api/report';

  constructor(
    private http: HttpClient,
    private sanitizer: DomSanitizer,
    private snackBar: MatSnackBar,
    private router: Router,
    private workflowData: WorkflowDataService
  ) {}


  // 初始化时获取生成的合约代码
  ngOnInit() {
    this.workflowData.currentGeneratedCode.subscribe(code => {
      if (code) {
        this.code = code;
      }
    });
  }

  /**
   * 复制代码到剪贴板
   */
  copyCode() {
    if (!this.code.trim()) {
      this.snackBar.open('没有可复制的代码', '关闭', { duration: 2000 });
      return;
    }

    navigator.clipboard.writeText(this.code).then(() => {
      this.snackBar.open('代码已复制到剪贴板', '关闭', { duration: 2000 });
    }).catch(() => {
      this.snackBar.open('复制失败，请手动复制', '关闭', { duration: 2000 });
    });
  }

  /**
   * 开始漏洞检测
   */
  detect() {
    if (!this.code.trim()) {
      this.errorMessage = '请输入智能合约代码';
      return;
    }

    this.isDetecting = true;
    this.errorMessage = '';
    this.report = null;
    this.fullReport = null;

    this.http.post<DetectionReport>(this.apiUrl, { code: this.code })
      .subscribe({
        next: (response) => {
          this.report = response;
          this.isDetecting = false;
        },
        error: (error) => {
          console.error('检测失败:', error);
          this.errorMessage = '检测失败，请检查网络连接或稍后重试';
          this.isDetecting = false;
          this.useMockData();
        }
      });
  }

  /**
   * 生成完整检测报告
   */
  generateReport() {
    if (!this.report) {
      this.errorMessage = '请先进行漏洞检测';
      return;
    }

    this.isGeneratingReport = true;
    this.errorMessage = '';

    this.http.post(this.reportApiUrl, 
      { 
        code: this.code,
        vulnerabilities: this.report.vulnerabilities 
      },
      { responseType: 'text' }
    ).subscribe({
      next: (reportHtml) => {
        this.fullReport = this.sanitizer.sanitize(1, reportHtml) as SafeHtml;
        this.isGeneratingReport = false;
      },
      error: (error) => {
        console.error('生成报告失败:', error);
        this.errorMessage = '生成报告失败';
        this.isGeneratingReport = false;
        this.generateLocalReport();
      }
    });
  }

  /**
   * 本地生成HTML报告（备用方案）
   */
  private generateLocalReport() {
    if (!this.report) return;

    const reportHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #333; border-bottom: 2px solid #4CAF50;">智能合约漏洞检测报告</h2>
        <p><strong>检测时间:</strong> ${new Date().toLocaleString('zh-CN')}</p>
        
        <h3 style="color: #666;">检测摘要</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr style="background-color: #f5f5f5;">
            <th style="border: 1px solid #ddd; padding: 8px;">总漏洞数</th>
            <th style="border: 1px solid #ddd; padding: 8px;">高危</th>
            <th style="border: 1px solid #ddd; padding: 8px;">中危</th>
            <th style="border: 1px solid #ddd; padding: 8px;">低危</th>
          </tr>
          <tr style="text-align: center;">
            <td style="border: 1px solid #ddd; padding: 8px;">${this.report.vulnerabilities.length}</td>
            <td style="border: 1px solid #ddd; padding: 8px; color: red;">
              ${this.report.vulnerabilities.filter(v => v.severity === '高').length}
            </td>
            <td style="border: 1px solid #ddd; padding: 8px; color: orange;">
              ${this.report.vulnerabilities.filter(v => v.severity === '中').length}
            </td>
            <td style="border: 1px solid #ddd; padding: 8px; color: blue;">
              ${this.report.vulnerabilities.filter(v => v.severity === '低').length}
            </td>
          </tr>
        </table>

        <h3 style="color: #666;">漏洞详情</h3>
        ${this.report.vulnerabilities.map((v, index) => `
          <div style="border: 1px solid #ddd; padding: 15px; margin-bottom: 15px; border-radius: 5px;">
            <h4 style="margin: 0 0 10px 0; color: ${this.getSeverityColor(v.severity)};">
              ${index + 1}. ${v.type} [${v.severity}]
            </h4>
            <p><strong>位置:</strong> 第 ${v.line} 行</p>
            <p><strong>修复建议:</strong> ${v.suggestion}</p>
          </div>
        `).join('')}

        <hr style="margin: 30px 0;">
        <p style="color: #999; font-size: 12px;">报告生成时间: ${new Date().toLocaleString('zh-CN')}</p>
      </div>
    `;

    this.fullReport = this.sanitizer.sanitize(1, reportHtml) as SafeHtml;
    this.isGeneratingReport = false;
  }

  /**
   * 下载报告
   */
  downloadReport() {
    if (!this.fullReport) return;

    const blob = new Blob([this.fullReport.toString()], { type: 'text/html' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `漏洞检测报告_${new Date().getTime()}.html`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  /**
   * 关闭报告
   */
  closeReport() {
    this.fullReport = null;
  }

  /**
   * 获取严重等级颜色
   */
  getSeverityColor(severity: string): string {
    switch (severity) {
      case '高': return 'red';
      case '中': return 'orange';
      case '低': return 'blue';
      default: return 'gray';
    }
  }

  /**
   * 使用模拟数据（开发测试用）
   */
  private useMockData() {
    this.report = {
      vulnerabilities: [
        { type: '重入攻击', line: 22, severity: '高', suggestion: '使用ReentrancyGuard修复' },
        { type: '整数溢出', line: 45, severity: '中', suggestion: '使用SafeMath库' },
        { type: '未检查的返回值', line: 78, severity: '中', suggestion: '检查外部调用返回值' }
      ]
    };
  }

  // 跳转到修补页面
  goToRepair() {
    if (!this.report) {
      this.snackBar.open('请先完成漏洞检测', '关闭', { duration: 2000 });
      return;
    }
    
    // 保存检测报告
    this.workflowData.updateDetectionReport(this.report);
    this.router.navigate(['/repair']);
  }

  // 重新检测按钮
  reDetect() {
    this.detect();
  }

  //测试网
  goToTestchain(){

  }
}