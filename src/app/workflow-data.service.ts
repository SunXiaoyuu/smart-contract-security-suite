import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface WorkflowState {
  generatedCode: string;
  detectionReport: any;
  repairedCode: string;
  finalDetectionReport: any; // 修补后的检测报告
  isReadyForDeployment: boolean; // 是否可部署（修补后检测无漏洞）
  deploymentResult: any;
  compileInfo?: {  // 新增编译信息
    success?: boolean;
    bytecode: string;
    abi: any[];
    contractName: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class WorkflowDataService {
  private _workflowState = new BehaviorSubject<WorkflowState>({
    generatedCode: '',
    detectionReport: null,
    repairedCode: '',
    finalDetectionReport: null,
    isReadyForDeployment: false,
    deploymentResult: null
  });

  // 添加缺失的属性 - 用于组件订阅
  public get currentGeneratedCode(): Observable<string> {
    return this._workflowState.pipe(
      map(state => state.generatedCode)
    );
  }

  public get currentDetectionReport(): Observable<any> {
    return this._workflowState.pipe(
      map(state => state.detectionReport)
    );
  }

  public get currentRepairedCode(): Observable<string> {
    return this._workflowState.pipe(
      map(state => state.repairedCode)
    );
  }

  public get currentFinalDetectionReport(): Observable<any> {
    return this._workflowState.pipe(
      map(state => state.finalDetectionReport)
    );
  }

  public get currentDeploymentResult(): Observable<any> {
    return this._workflowState.pipe(
      map(state => state.deploymentResult)
    );
  }
// 添加更新编译信息的方法
updateCompileInfo(compileInfo: any) {
  const currentState = this._workflowState.value;
  this._workflowState.next({
    ...currentState,
    compileInfo: compileInfo
  });
}
  // 更新生成的合约代码
  updateGeneratedCode(code: string) {
    const current = this._workflowState.value;
    this._workflowState.next({
      ...current,
      generatedCode: code,
      isReadyForDeployment: false // 生成新代码时重置部署状态
    });
  }

  // 更新检测报告
  updateDetectionReport(report: any) {
    const hasVulnerabilities = report?.vulnerabilities?.length > 0;

    const current = this._workflowState.value;
    this._workflowState.next({
      ...current,
      detectionReport: report,
      isReadyForDeployment: false // 有漏洞时不能部署
    });
  }

  // 更新修复后的代码和最终检测报告
  updateRepairResult(repairedCode: string, finalReport: any) {
    const hasVulnerabilities = finalReport?.vulnerabilities?.length > 0;

    const current = this._workflowState.value;
    this._workflowState.next({
      ...current,
      repairedCode: repairedCode,
      finalDetectionReport: finalReport,
      isReadyForDeployment: !hasVulnerabilities // 无漏洞时可部署
    });
  }

  // 新增：更新部署就绪状态
  updateDeploymentReadiness(isReady: boolean) {
    const current = this._workflowState.value;
    this._workflowState.next({
      ...current,
      isReadyForDeployment: isReady
    });
  }

  // 新增：更新部署结果
  updateDeploymentResult(result: any) {
    const current = this._workflowState.value;
    this._workflowState.next({
      ...current,
      deploymentResult: result
    });
  }

  // 获取工作流状态
  get workflowState(): Observable<WorkflowState> {
    return this._workflowState.asObservable();
  }

  // 检查是否可部署
  get canDeploy(): boolean {
    return this._workflowState.value.isReadyForDeployment;
  }

  // 获取部署用的合约代码（优先使用修复后的代码）
  get codeForDeployment(): string {
    const state = this._workflowState.value;
    return state.repairedCode || state.generatedCode;
  }

  // 重置工作流状态
  resetWorkflow() {
    this._workflowState.next({
      generatedCode: '',
      detectionReport: null,
      repairedCode: '',
      finalDetectionReport: null,
      isReadyForDeployment: false,
      deploymentResult: null
    });
  }

  // 新增：仅重置部署相关状态（保留代码和报告）
  resetDeploymentState() {
    const current = this._workflowState.value;
    this._workflowState.next({
      ...current,
      deploymentResult: null
    });
  }

  // 新增：获取当前状态快照（用于同步操作）
  getCurrentState(): WorkflowState {
    return this._workflowState.value;
  }

  // 新增：检查是否有可部署的合约代码
  hasDeployableCode(): boolean {
    const state = this._workflowState.value;
    return !!(state.repairedCode || state.generatedCode);
  }

  // 新增：获取最终的检测报告（用于部署前的验证）
  getFinalDetectionStatus(): { hasVulnerabilities: boolean; vulnerabilityCount: number } {
    const state = this._workflowState.value;
    const report = state.finalDetectionReport || state.detectionReport;

    if (!report) {
      return { hasVulnerabilities: true, vulnerabilityCount: 0 };
    }

    const vulnerabilityCount = report.vulnerabilities?.length || 0;
    return {
      hasVulnerabilities: vulnerabilityCount > 0,
      vulnerabilityCount
    };
  }
}
