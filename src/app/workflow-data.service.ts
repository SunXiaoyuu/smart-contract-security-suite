import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WorkflowDataService {
// 存储生成的合约代码
  private generatedCodeSource = new BehaviorSubject<string>('');
  currentGeneratedCode = this.generatedCodeSource.asObservable();

  // 存储检测报告
  private detectionReportSource = new BehaviorSubject<any>(null);
  currentDetectionReport = this.detectionReportSource.asObservable();

  constructor() { }

  // 更新生成的合约代码
  updateGeneratedCode(code: string) {
    this.generatedCodeSource.next(code);
  }

  // 更新检测报告
  updateDetectionReport(report: any) {
    this.detectionReportSource.next(report);
  }

}
