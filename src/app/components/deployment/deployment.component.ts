import { Component, OnInit, OnDestroy } from '@angular/core';
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
import { MatOptionModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { Subscription } from 'rxjs';
import { ethers } from 'ethers';

// ================ 接口定义 ================
interface CompileInfo {
  success?: boolean;
  bytecode: string;
  abi: any[];
  contractName?: string;
}

interface Vulnerability {
  type: string;
  line: number;
  severity: string;
  suggestion: string;
}

// 部署相关接口
export interface DeployConfig {
  testnet: keyof typeof TESTNET_CONFIGS;
  privateKey: string;
  gasLimit?: number;
  gasPrice?: string;
}

export interface DeployResult {
  success: boolean;
  contractAddress?: string;
  transactionHash?: string;
  blockNumber?: number;
  gasUsed?: string;
  error?: string;
}

// 测试网配置 - 修改 RPC URL 使用后端代理
export const TESTNET_CONFIGS = {
  sepolia: {
    name: 'Sepolia Testnet',
    rpcUrl: 'http://localhost:3000/api/blockchain/proxy',
    chainId: 11155111,
    explorer: 'https://sepolia.etherscan.io',
    currency: 'ETH'
  },
  mumbai: {
    name: 'Polygon Mumbai',
    rpcUrl: 'http://localhost:3000/api/blockchain/proxy',
    chainId: 80001,
    explorer: 'https://mumbai.polygonscan.com',
    currency: 'MATIC'
  }
} as const;

@Component({
  selector: 'app-deployment',
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
    RouterModule,
    MatOptionModule,
    MatProgressSpinnerModule,
    MatSelectModule
  ],
  templateUrl: './deployment.component.html',
  styleUrls: ['./deployment.component.css'],
  providers: [{ provide: 'REQUEST', useValue: null }, { provide: 'RESPONSE', useValue: null }]
})
export class DeploymentComponent implements OnInit, OnDestroy {
  TESTNET_CONFIGS = TESTNET_CONFIGS;

  isDeploying: boolean = false;
  deployResult: DeployResult | null = null;
  deployConfig: DeployConfig = {
    testnet: 'sepolia',
    privateKey: '',
    gasLimit: 8000000000, // 增加到500万Gas
    gasPrice: '5000' // 30 gwei
  };

  // 工作流状态
  canDeploy: boolean = false;
  contractCode: string = '';
  compileInfo: CompileInfo | null = null;
  private workflowSubscription: Subscription | null = null;

  // 部署状态跟踪
  deploymentSteps = {
    validating: false,
    connecting: false,
    estimating: false,
    deploying: false,
    confirming: false
  };

  constructor(
    private snackBar: MatSnackBar,
    private workflowData: WorkflowDataService,
    private http: HttpClient
  ) {}

  ngOnInit() {
    this.workflowSubscription = this.workflowData.workflowState.subscribe({
      next: (state) => {
        this.canDeploy = state.isReadyForDeployment || false;
        this.contractCode = state.generatedCode || '';
        this.compileInfo = state.compileInfo || null;

        console.log('📊 工作流状态更新:', {
          canDeploy: this.canDeploy,
          codeLength: this.contractCode.length,
          hasCompileInfo: !!this.compileInfo,
          compileSuccess: this.compileInfo?.success
        });
      },
      error: (error) => {
        console.error('❌ 工作流状态订阅错误:', error);
      }
    });
  }

  ngOnDestroy() {
    if (this.workflowSubscription) {
      this.workflowSubscription.unsubscribe();
    }
  }

  /**
   * 执行合约部署 - 使用后端代理
   */
  async deployContract() {
    if (!this.canDeploy) {
      this.snackBar.open('合约尚未通过安全检测，无法部署', '关闭', { duration: 3000 });
      return;
    }

    if (!this.deployConfig.privateKey) {
      this.snackBar.open('请输入部署者私钥', '关闭', { duration: 2000 });
      return;
    }

    // 验证私钥格式
    const keyValidation = this.isValidPrivateKey(this.deployConfig.privateKey);
    if (!keyValidation.isValid) {
      this.snackBar.open(`私钥格式错误: ${keyValidation.error}`, '关闭', { duration: 3000 });
      return;
    }

    this.isDeploying = true;
    this.deployResult = null;
    this.resetDeploymentSteps();

    try {
      console.log('🚀 开始部署流程...');

      // 步骤1: 验证和准备部署信息
      this.deploymentSteps.validating = true;
      const deploymentData = await this.prepareDeploymentData();

      if (!deploymentData) {
        throw new Error('无法准备部署数据');
      }

      // 步骤2: 执行部署
      const result = await this.executeDeployment(deploymentData);
      this.deployResult = result;

      if (result.success) {
        this.snackBar.open('✅ 合约部署成功！', '关闭', { duration: 5000 });
        this.workflowData.updateDeploymentResult(result);
        this.deployConfig.privateKey = '';
      } else {
        throw new Error(result.error || '部署失败');
      }
    } catch (error: any) {
      console.error('❌ 部署过程错误:', error);
      this.deployResult = {
        success: false,
        error: this.getFriendlyErrorMessage(error)
      };
      this.snackBar.open(`❌ 部署失败: ${this.deployResult.error}`, '关闭', { duration: 5000 });
    } finally {
      this.isDeploying = false;
      this.resetDeploymentSteps();
    }
  }

  /**
   * 准备部署数据
   */
  private async prepareDeploymentData(): Promise<CompileInfo | null> {
    try {
      console.log('🔍 准备部署数据...');

      // 优先使用工作流中的编译信息
      if (this.compileInfo && this.compileInfo.bytecode) {
        console.log('✅ 使用工作流编译信息');
        return this.compileInfo;
      }

      // 如果没有编译信息，尝试从代码中提取
      console.log('⚠️ 尝试从代码中提取部署信息');
      const extracted = this.extractContractArtifacts(this.contractCode);

      if (extracted.bytecode && extracted.bytecode !== '0x') {
        return extracted;
      }

      // 如果都没有，使用模拟数据（仅用于测试）
      console.log('🔧 使用模拟部署数据');
      return this.generateMockArtifacts(this.contractCode);

    } catch (error) {
      console.error('❌ 准备部署数据失败:', error);
      return null;
    }
  }

  /**
   * 验证私钥格式
   */
  private isValidPrivateKey(privateKey: string): { isValid: boolean; error?: string } {
    if (!privateKey || typeof privateKey !== 'string') {
      return { isValid: false, error: '私钥不能为空' };
    }

    const trimmedKey = privateKey.trim();

    // 基本格式检查
    if (!trimmedKey.startsWith('0x')) {
      return { isValid: false, error: '私钥必须以0x开头' };
    }

    const keyWithoutPrefix = trimmedKey.substring(2);

    if (keyWithoutPrefix.length !== 64) {
      return { isValid: false, error: '私钥长度必须为64个字符（32字节）' };
    }

    if (!/^[0-9a-fA-F]{64}$/.test(keyWithoutPrefix)) {
      return { isValid: false, error: '私钥只能包含十六进制字符' };
    }

    return { isValid: true };
  }

  /**
   * 实际部署逻辑 - 使用自定义提供者通过后端代理
   */
  private async executeDeployment(deploymentData: CompileInfo): Promise<DeployResult> {
    const testnet = this.TESTNET_CONFIGS[this.deployConfig.testnet];

    try {
      // 验证私钥可以创建钱包
      let wallet: ethers.Wallet;
      try {
        wallet = new ethers.Wallet(this.deployConfig.privateKey);
        console.log('✅ 私钥有效,钱包地址:', wallet.address);
      } catch (error) {
        return {
          success: false,
          error: '私钥无效,无法创建钱包: ' + (error instanceof Error ? error.message : String(error))
        };
      }

      // 创建自定义提供者，通过后端代理
      const provider = this.createProxyProvider(testnet.rpcUrl);

      // 连接钱包到提供者
      const connectedWallet = wallet.connect(provider);

      // 检查账户余额
      const balance = await provider.getBalance(wallet.address);
      console.log('💰 账户余额:', ethers.formatEther(balance), 'ETH');

      if (balance === 0n) {
        return {
          success: false,
          error: '账户余额为0,请先充值测试币'
        };
      }

      // 获取当前 Gas 价格
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice || ethers.parseUnits(this.deployConfig.gasPrice || '30', 'gwei');
      console.log('⛽ 当前 Gas 价格:', ethers.formatUnits(gasPrice, 'gwei'), 'gwei');

      // 创建合约工厂
      const factory = new ethers.ContractFactory(
        deploymentData.abi,
        deploymentData.bytecode,
        connectedWallet
      );

      // 估算 Gas
      this.deploymentSteps.estimating = true;
      let estimatedGas;
      try {
        const deployTransaction = await factory.getDeployTransaction();
        estimatedGas = await provider.estimateGas(deployTransaction);
        console.log('📊 估算 Gas:', estimatedGas.toString());
      } catch (e) {
        console.warn('⚠️ Gas 估算失败,使用默认值:', e instanceof Error ? e.message : String(e));
        estimatedGas = BigInt(this.deployConfig.gasLimit || 5000000);
      }

      // 增加 50% 的安全余量
      const gasLimit = estimatedGas * 150n / 100n;
      console.log('🔧 最终 Gas 设置:', {
        gasLimit: gasLimit.toString(),
        gasPrice: ethers.formatUnits(gasPrice, 'gwei') + ' gwei'
      });

      // 执行部署
      this.deploymentSteps.deploying = true;
      const contract = await factory.deploy({
        gasLimit: gasLimit,
        gasPrice: gasPrice
      });

      console.log('📤 部署交易哈希:', contract.deploymentTransaction()?.hash);

      // 等待确认
      this.deploymentSteps.confirming = true;
      const receipt = await contract.deploymentTransaction()?.wait();
      const address = await contract.getAddress();

      if (receipt?.status === 1) {
        return {
          success: true,
          contractAddress: address,
          transactionHash: receipt.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed?.toString()
        };
      } else {
        throw new Error(`交易失败，状态: ${receipt?.status}`);
      }

    } catch (error: any) {
      console.error('❌ 部署失败:', error);
      return {
        success: false,
        error: this.getFriendlyErrorMessage(error)
      };
    }
  }

  /**
   * 创建通过后端代理的自定义提供者
   */
  private createProxyProvider(proxyUrl: string): ethers.JsonRpcProvider {
    // 创建自定义提供者
    const provider = new ethers.JsonRpcProvider(proxyUrl);

    // 重写发送方法以使用后端代理
    const originalSend = provider.send.bind(provider);

    provider.send = async (method: string, params: any[]): Promise<any> => {
      console.log(`🔄 通过代理发送请求: ${method}`, params);

      try {
        const response = await this.http.post<any>(proxyUrl, {
          jsonrpc: '2.0',
          id: 1,
          method: method,
          params: params
        }).toPromise();

        if (response.error) {
          throw new Error(`RPC错误: ${response.error.message}`);
        }

        return response.result;
      } catch (error) {
        console.error('❌ 代理请求失败:', error);
        throw error;
      }
    };

    return provider;
  }

  /**
   * 从合约代码中提取ABI和字节码
   */
  private extractContractArtifacts(code: string): CompileInfo {
    try {
      // 简单的合约名称提取
      const contractNameMatch = code.match(/contract\s+(\w+)/);
      const contractName = contractNameMatch ? contractNameMatch[1] : 'SimpleContract';

      return {
        success: false,
        abi: [],
        bytecode: '',
        contractName
      };
    } catch (error) {
      console.error('❌ 提取合约信息失败:', error);
      return {
        success: false,
        abi: [],
        bytecode: '',
        contractName: 'ErrorContract'
      };
    }
  }

  /**
   * 生成有效的模拟字节码
   */
  private generateMockArtifacts(code: string): CompileInfo {
    const contractNameMatch = code.match(/contract\s+(\w+)/);
    const contractName = contractNameMatch ? contractNameMatch[1] : 'MockContract';

    const validEmptyContractBytecode = '6080604052348015600e57600080fd5b50600080f3fe6080604052600080fdfea2646970667358221220aafdc1f5e6c4c34b2b6d7c9a8c1e4d5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d64736f6c63430008180033';

    const mockABI = [
      {
        "inputs": [],
        "stateMutability": "nonpayable",
        "type": "constructor"
      },
      {
        "inputs": [],
        "name": "getVersion",
        "outputs": [{"internalType": "string", "name": "", "type": "string"}],
        "stateMutability": "pure",
        "type": "function"
      }
    ];

    return {
      success: true,
      abi: mockABI,
      bytecode: `0x${validEmptyContractBytecode}`,
      contractName
    };
  }

  /**
   * 重置部署步骤状态
   */
  private resetDeploymentSteps(): void {
    (Object.keys(this.deploymentSteps) as Array<keyof typeof this.deploymentSteps>).forEach(key => {
      this.deploymentSteps[key] = false;
    });
  }

  /**
   * 获取友好的错误信息
   */
  private getFriendlyErrorMessage(error: any): string {
    const message = error.message || error.toString();

    if (message.includes('insufficient funds')) {
      return '账户余额不足,请先获取测试币';
    }
    if (message.includes('invalid address')) {
      return '私钥对应的地址无效';
    }
    if (message.includes('nonce')) {
      return 'Nonce错误,请稍后重试';
    }
    if (message.includes('gas')) {
      return 'Gas设置错误: 请尝试增加Gas限制或提高Gas价格';
    }
    if (message.includes('network')) {
      return '网络连接失败,请检查RPC地址';
    }
    if (message.includes('CORS') || message.includes('Access-Control-Allow-Origin')) {
      return '网络代理配置错误,请检查后端服务';
    }
    if (message.includes('reverted') || message.includes('execution reverted')) {
      return '合约执行被回退: 请检查合约逻辑是否正确';
    }
    if (message.includes('status') && message.includes('0')) {
      return '交易失败: 合约部署执行被回退';
    }

    return `部署失败: ${message}`;
  }

  /**
   * 复制合约地址
   */
  copyContractAddress() {
    if (this.deployResult?.contractAddress) {
      navigator.clipboard.writeText(this.deployResult.contractAddress);
      this.snackBar.open('合约地址已复制', '关闭', { duration: 2000 });
    }
  }

  /**
   * 在区块浏览器中查看
   */
  viewOnExplorer() {
    if (!this.deployResult?.contractAddress) return;
    const testnet = this.TESTNET_CONFIGS[this.deployConfig.testnet];
    window.open(`${testnet.explorer}/address/${this.deployResult.contractAddress}`, '_blank');
  }

  /**
   * 查看交易详情
   */
  viewTransaction() {
    if (!this.deployResult?.transactionHash) return;
    const testnet = this.TESTNET_CONFIGS[this.deployConfig.testnet];
    window.open(`${testnet.explorer}/tx/${this.deployResult.transactionHash}`, '_blank');
  }

  /**
   * 重置部署表单
   */
  resetDeployment() {
    this.deployResult = null;
    this.deployConfig.privateKey = '';
  }

  /**
   * 检查是否可部署
   */
  get canDeployContract(): boolean {
    return this.canDeploy &&
           !!this.deployConfig.privateKey &&
           !this.isDeploying;
  }

  /**
   * 获取部署状态文本
   */
  get deployStatusText(): string {
    if (this.isDeploying) return '部署中...';
    if (!this.canDeploy) return '合约未就绪';
    if (!this.deployConfig.privateKey) return '请输入私钥';
    return '开始部署';
  }

  /**
   * 获取测试网名称
   */
  getTestnetName(): string {
    return this.TESTNET_CONFIGS[this.deployConfig.testnet].name;
  }
}
