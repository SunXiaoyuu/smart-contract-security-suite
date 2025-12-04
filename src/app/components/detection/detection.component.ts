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
    informational: number;  // 添加信息类
    optimization: number;  // 添加优化类
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

  // 工作流状态
  canDeploy: boolean = false;
  isFinalDetection: boolean = false;

  private apiUrl = 'http://localhost:3000/api/detect';
  private reportApiUrl = 'http://localhost:3000/api/report';

  constructor(
    private http: HttpClient,
    private sanitizer: DomSanitizer,
    private snackBar: MatSnackBar,
    private router: Router,
    private workflowData: WorkflowDataService
  ) {}

  ngOnInit() {
    this.workflowData.workflowState.subscribe(state => {
      if (state.generatedCode) {
        this.code = state.generatedCode;
      }

      if (state.finalDetectionReport) {
        this.report = state.finalDetectionReport;
        this.isFinalDetection = true;
        this.checkDeploymentReadiness();
      }

      this.canDeploy = state.isReadyForDeployment;
    });
  }

  /**
 * 修复部署就绪检查逻辑
 * 只考虑高危、中危、低危漏洞，忽略信息和优化类问题
 */
private checkDeploymentReadiness() {
  if (!this.report) {
    this.canDeploy = false;
    this.workflowData.updateDeploymentReadiness(false);
    return;
  }

  // 重新计算各等级漏洞数量（只计算需要关注的等级）
  const highCount = this.report.vulnerabilities.filter(v => v.severity === '高').length;
  const mediumCount = this.report.vulnerabilities.filter(v => v.severity === '中').length;
  const lowCount = this.report.vulnerabilities.filter(v => v.severity === '低').length;

  // 信息和优化类问题不计入部署阻止条件
  const infoCount = this.report.vulnerabilities.filter(v => v.severity === '信息').length;
  const optCount = this.report.vulnerabilities.filter(v => v.severity === '优化').length;
  const totalCount = highCount + mediumCount + lowCount;

  // 更新summary数据，确保一致性
  this.report.summary = {
    total: this.report.vulnerabilities.length,
    high: highCount,
    medium: mediumCount,
    low: lowCount,
    informational: infoCount,
    optimization: optCount
  };

  // 部署条件：只有高危、中危、低危漏洞数为0时才允许部署
  // 信息和优化类问题不影响部署
  const hasCriticalVulnerabilities = highCount > 0 || mediumCount > 0 || lowCount > 0;

  this.canDeploy = !hasCriticalVulnerabilities;
  this.workflowData.updateDeploymentReadiness(this.canDeploy);

  console.log('🔍 部署就绪检查详情:', {
    总漏洞数: totalCount,
    高危: highCount,
    中危: mediumCount,
    低危: lowCount,
    信息类: infoCount,
    优化类: optCount,
    可部署: this.canDeploy
  });

  if (this.canDeploy) {
    let message = '✅ 合约已通过安全检测，可以部署到测试网';
    if (infoCount > 0 || optCount > 0) {
      message += ` (包含 ${infoCount} 个信息提示和 ${optCount} 个优化建议)`;
    }
    this.snackBar.open(message, '关闭', { duration: 5000 });
  } else {
    const message = this.getDeploymentBlockedMessage(highCount, mediumCount, lowCount);
    if (this.isFinalDetection) {
      this.snackBar.open(message, '关闭', { duration: 5000 });
    }
  }
}

  /**
   * 获取部署被阻止的详细原因
   */
  private getDeploymentBlockedMessage(highCount: number, mediumCount: number, lowCount: number): string {
    if (highCount > 0) {
      return `❌ 发现 ${highCount} 个高危漏洞，无法部署`;
    } else if (mediumCount > 0) {
      return `⚠️ 发现 ${mediumCount} 个中危漏洞，建议修复后再部署`;
    } else if (lowCount > 0) {
      return `ℹ️ 发现 ${lowCount} 个低危漏洞，可选择性修复`;
    }
    return '✅ 合约安全，可以部署';
  }

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

  detect() {
    if (!this.code.trim()) {
      this.errorMessage = '请输入智能合约代码';
      return;
    }

    this.isDetecting = true;
    this.errorMessage = '';
    this.report = null;
    this.fullReport = null;
    this.canDeploy = false;
    this.workflowData.updateDeploymentReadiness(false);

    this.http.post<DetectionReport>(this.apiUrl, { code: this.code })
      .subscribe({
        next: (response) => {
          this.report = response;
          this.isDetecting = false;
          this.workflowData.updateDetectionReport(response);

          // 检查部署就绪状态
          this.checkDeploymentReadiness();

          if (this.isFinalDetection) {
            this.workflowData.updateRepairResult(this.code, response);
          }
        },
        error: (error) => {
          console.error('检测失败:', error);
          this.errorMessage = '检测失败，请检查网络连接或稍后重试';
          this.isDetecting = false;
          this.useMockData();
        }
      });
  }

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
        this.fullReport = this.sanitizer.bypassSecurityTrustHtml(reportHtml);
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
   * 生成本地HTML报告（备用方案）
   */
  private generateLocalReport() {
    if (!this.report) return;

     // 重新计算漏洞统计
    const highCount = this.report.vulnerabilities.filter(v => v.severity === '高').length;
    const mediumCount = this.report.vulnerabilities.filter(v => v.severity === '中').length;
    const lowCount = this.report.vulnerabilities.filter(v => v.severity === '低').length;
    const infoCount = this.report.vulnerabilities.filter(v => v.severity === '信息').length;
    const optCount = this.report.vulnerabilities.filter(v => v.severity === '优化').length;

  // 总问题数（所有类型）
  const totalCount = this.report.summary?.total || this.report.vulnerabilities.length;
  // 关键问题数（影响部署的）
  const criticalCount = highCount + mediumCount + lowCount;

    const reportHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>智能合约漏洞检测报告</title>
        <style>
          body {
            font-family: 'Microsoft YaHei', Arial, sans-serif;
            padding: 30px;
            background: #f5f5f5;
          }
          .container {
            max-width: 1000px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h2 {
            color: #333;
            border-bottom: 3px solid #4CAF50;
            padding-bottom: 10px;
          }
          .summary {
            display: flex;
            justify-content: space-around;
            margin: 20px 0;
          }
          .summary-item {
            text-align: center;
            padding: 20px;
            border-radius: 8px;
            background: #f9f9f9;
          }
          .summary-item h3 {
            margin: 0;
            font-size: 32px;
          }
          .vulnerability {
            border: 1px solid #ddd;
            padding: 20px;
            margin: 15px 0;
            border-radius: 8px;
            background: #fafafa;
          }
          .high { color: #d32f2f; font-weight: bold; }
          .medium { color: #f57c00; font-weight: bold; }
          .low { color: #1976d2; }
          .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
          }
          .badge-high { background: #ffebee; color: #d32f2f; }
          .badge-medium { background: #fff3e0; color: #f57c00; }
          .badge-low { background: #e3f2fd; color: #1976d2; }
          .deploy-status {
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: center;
            font-weight: bold;
          }
          .deploy-ready { background: #e8f5e8; color: #2e7d32; border: 2px solid #4caf50; }
          .deploy-blocked { background: #ffebee; color: #c62828; border: 2px solid #f44336; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>🛡️ 智能合约漏洞检测报告</h2>
          <p><strong>检测时间:</strong> ${new Date().toLocaleString('zh-CN')}</p>

          <!-- 部署状态显示 -->
           <div class="deploy-status ${criticalCount === 0 ? 'deploy-ready' : 'deploy-blocked'}">
          ${criticalCount === 0 ?
            `✅ 合约已通过安全检测，可以部署到测试网` :
            `❌ 发现 ${criticalCount} 个关键漏洞，无法部署`}
          ${(infoCount > 0 || optCount > 0) ?
            `<br><small>包含 ${infoCount} 个信息提示和 ${optCount} 个优化建议</small>` : ''}
        </div>

          <h3>检测摘要</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr style="background-color: #f5f5f5;">
              <th style="border: 1px solid #ddd; padding: 8px;">总漏洞数</th>
              <th style="border: 1px solid #ddd; padding: 8px;">高危</th>
              <th style="border: 1px solid #ddd; padding: 8px;">中危</th>
              <th style="border: 1px solid #ddd; padding: 8px;">低危</th>
              <th style="border: 1px solid #ddd; padding: 8px;">信息</th>
              <th style="border: 1px solid #ddd; padding: 8px;">优化</th>
              <th style="border: 1px solid #ddd; padding: 8px;">部署状态</th>
            </tr>
            <tr style="text-align: center;">
              <td style="border: 1px solid #ddd; padding: 8px;">${totalCount}</td>
              <td style="border: 1px solid #ddd; padding: 8px; color: red;">${highCount}</td>
              <td style="border: 1px solid #ddd; padding: 8px; color: orange;">${mediumCount}</td>
              <td style="border: 1px solid #ddd; padding: 8px; color: blue;">${lowCount}</td>
              <td style="border: 1px solid #ddd; padding: 8px; color: purple;">${infoCount}</td>
              <td style="border: 1px solid #ddd; padding: 8px; color: green;">${optCount}</td>
              <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; color: ${criticalCount === 0 ? 'green' : 'red'};">
                ${criticalCount === 0 ? '可部署' : '不可部署'}
              </td>
            </tr>
          </table>

          <h3>漏洞详情</h3>
          ${this.report.vulnerabilities.map((v, index) => `
            <div class="vulnerability">
              <h4 style="margin: 0 0 10px 0; color: ${this.getSeverityColor(v.severity)};">
                ${index + 1}. ${v.type}
                <span class="badge badge-${v.severity === '高' ? 'high' : v.severity === '中' ? 'medium' : 'low'}">
                  ${v.severity}
                </span>
              </h4>
              <p><strong>位置:</strong> 第 ${v.line} 行</p>
              <p><strong>修复建议:</strong> ${v.suggestion}</p>
            </div>
          `).join('')}

          <hr style="margin: 30px 0;">
          <p style="color: #999; font-size: 12px;">报告生成时间: ${new Date().toLocaleString('zh-CN')}</p>
        </div>
      </body>
      </html>
    `;

    this.fullReport = this.sanitizer.bypassSecurityTrustHtml(reportHtml);
    this.isGeneratingReport = false;
  }

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

  closeReport() {
    this.fullReport = null;
  }

  getSeverityColor(severity: string): string {
    switch (severity) {
      case '高': return '#d32f2f';
      case '中': return '#f57c00';
      case '低': return '#1976d2';
      default: return 'gray';
    }
  }

  private useMockData() {
    this.report = {
      vulnerabilities: [
        { type: '重入攻击', line: 22, severity: '高', suggestion: '使用ReentrancyGuard修复' },
        { type: '整数溢出', line: 45, severity: '中', suggestion: '使用SafeMath库' },
        { type: '未检查的返回值', line: 78, severity: '中', suggestion: '检查外部调用返回值' }
      ]
    };
    // 模拟检测完成后检查部署状态
    setTimeout(() => this.checkDeploymentReadiness(), 100);
  }

  goToRepair() {
    if (!this.report) {
      this.snackBar.open('请先完成漏洞检测', '关闭', { duration: 2000 });
      return;
    }

    this.workflowData.updateDetectionReport(this.report);
    this.router.navigate(['/repair']);
  }

  goToDeployment() {
    if (!this.canDeploy) {
      // 显示详细的阻止原因
      if (this.report) {
        const highCount = this.report.vulnerabilities.filter(v => v.severity === '高').length;
        const mediumCount = this.report.vulnerabilities.filter(v => v.severity === '中').length;
        const lowCount = this.report.vulnerabilities.filter(v => v.severity === '低').length;

        const message = this.getDeploymentBlockedMessage(highCount, mediumCount, lowCount);
        this.snackBar.open(message, '关闭', { duration: 5000 });
      } else {
        this.snackBar.open('合约尚未通过安全检测，无法部署', '关闭', { duration: 3000 });
      }
      return;
    }
    this.router.navigate(['/deployment']);
  }

  reDetect() {
    this.isFinalDetection = true;
    this.detect();
  }

  /**
   * 获取漏洞统计信息（用于显示）
   */
  getVulnerabilityStats(): { total: number, high: number, medium: number, low: number } {
    if (!this.report) {
      return { total: 0, high: 0, medium: 0, low: 0 };
    }

    const highCount = this.report.vulnerabilities.filter(v => v.severity === '高').length;
    const mediumCount = this.report.vulnerabilities.filter(v => v.severity === '中').length;
    const lowCount = this.report.vulnerabilities.filter(v => v.severity === '低').length;

    return {
      total: this.report.vulnerabilities.length,
      high: highCount,
      medium: mediumCount,
      low: lowCount
    };
  }
}
