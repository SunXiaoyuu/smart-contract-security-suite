import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Router, RouterModule } from '@angular/router';
import { WorkflowDataService } from '../../workflow-data.service';

@Component({
  selector: 'app-repair',
  standalone: true,                   // 关键：标记为 standalone 组件
  templateUrl: './repair.component.html',
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,                 // 注意HttpClientModule必须导入
    MatCardModule,
    MatButtonModule,
    MatListModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    RouterModule
  ],
})
export class RepairComponent {

  code: string = '';         // 合约代码
  reports: string = '';      // 审计报告

  patchSuggestions: any = null; // 修补建议
  repairedCode: string = '';    // 修补后的代码

  isAnalyzing: boolean = false; // 分析加载状态
  isRepairing: boolean = false; // 修补加载状态

  constructor(
    private http: HttpClient,
    private snackBar: MatSnackBar,
    private router: Router,
    private workflowData: WorkflowDataService
  ) {}

  // 初始化时获取数据
  ngOnInit() {
    this.workflowData.currentGeneratedCode.subscribe(code => {
      if (code) {
        this.code = code;
      }
    });

    this.workflowData.currentDetectionReport.subscribe(report => {
      if (report) {
        this.reports = JSON.stringify(report, null, 2);
      }
    });
  }


  applySuggestion() {
    if (!this.code.trim()) {
      this.snackBar.open('❌ 请先输入智能合约代码', '关闭', { duration: 3000 });
      return;
    }
    if (!this.reports.trim()) {
      this.snackBar.open('❌ 请先输入审计报告', '关闭', { duration: 3000 });
      return;
    }
    this.isAnalyzing = true;
    this.patchSuggestions = null;

    const prompt = `
你是一个智能合约安全专家。根据以下智能合约代码和审计报告，生成详细的修补建议。

智能合约代码：
\`\`\`solidity
${this.code}
\`\`\`

审计报告：
${this.reports}

请分析每个漏洞，并给出具体的修补建议。输出格式为 JSON 数组，每个建议包含：
- num: 序号
- line: 行号
- sug: 具体修补建议

只输出 JSON，不要其他解释。示例格式：
[
  { "num": "1", "line": "22", "sug": "加入 nonReentrant 修饰符防止重入攻击" },
  { "num": "2", "line": "45", "sug": "使用 SafeMath 库防止整数溢出" }
]
`;

    this.http.post<any>('http://localhost:3000/api/generate', { description: prompt }).subscribe({
      next: (res) => {
        this.isAnalyzing = false;
        try {
          let jsonStr = res.code;
          jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const suggestions = JSON.parse(jsonStr);
          this.patchSuggestions = { suggestion: Array.isArray(suggestions) ? suggestions : [suggestions] };
          this.snackBar.open('✅ 分析完成！', '关闭', { duration: 3000 });
        } catch (error) {
          console.error('解析 JSON 失败:', error);
          this.patchSuggestions = { suggestion: [{ num: '1', line: '-', sug: res.code }] };
          this.snackBar.open('⚠️ 建议生成成功，但格式需要调整', '关闭', { duration: 3000 });
        }
      },
      error: (err) => {
        this.isAnalyzing = false;
        this.snackBar.open('❌ 分析失败：' + (err.error?.error || err.message), '关闭', { duration: 5000 });
      }
    });
  }

  applyPatch() {
    if (!this.code.trim()) {
      this.snackBar.open('❌ 请先输入智能合约代码', '关闭', { duration: 3000 });
      return;
    }
    if (!this.reports.trim()) {
      this.snackBar.open('❌ 请先输入审计报告', '关闭', { duration: 3000 });
      return;
    }
    this.isRepairing = true;
    this.repairedCode = '';

    const prompt = `
你是一个智能合约安全专家。请根据以下智能合约代码和审计报告，修复所有漏洞并返回修复后的前两个函数。

原始代码：
\`\`\`solidity
${this.code}
\`\`\`

审计报告：
${this.reports}

要求：
1. 修复所有已知漏洞
2. 保持原有功能逻辑不变
3. 添加安全注释说明修复内容
4. 只输出修复后的完整 Solidity 代码，不要额外解释
`;

    this.http.post<any>('http://localhost:3000/api/generate', { description: prompt }).subscribe({
      next: (res) => {
        this.isRepairing = false;
        let code = res.code || '';
        code = code.replace(/```solidity\n?/g, '').replace(/```\n?/g, '').trim();
        this.repairedCode = code;
        this.snackBar.open('✅ 修补完成！', '关闭', { duration: 3000 });
      },
      error: (err) => {
        this.isRepairing = false;
        this.snackBar.open('❌ 修补失败：' + (err.error?.error || err.message), '关闭', { duration: 5000 });
      }
    });
  }

  copyRepairedCode() {
    if (!this.repairedCode) {
      this.snackBar.open('⚠️ 没有代码可复制', '关闭', { duration: 2000 });
      return;
    }
    navigator.clipboard.writeText(this.repairedCode).then(() => {
      this.snackBar.open('✅ 代码已复制到剪贴板', '关闭', { duration: 2000 });
    });
  }

  // 跳转到再次检测
  goToReDetection() {
    if (!this.repairedCode) {
      this.snackBar.open('请先完成漏洞修补', '关闭', { duration: 2000 });
      return;
    }
    
    // 更新代码为修补后的代码，用于再次检测
    this.workflowData.updateGeneratedCode(this.repairedCode);
    this.router.navigate(['/detection']);
  }

}