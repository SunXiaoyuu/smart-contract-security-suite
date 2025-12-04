const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const solc = require('solc');
const app = express();
const PORT = 3000;

// ==================== CORS 配置 ====================
const corsOptions = {
  origin: 'http://localhost:4200',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200
};

// 启用 CORS 中间件
app.use(cors(corsOptions));

// 处理预检请求 - 修复：使用具体路由而不是通配符
app.options('/api/blockchain/proxy', cors(corsOptions));
app.options('/api/blockchain/health', cors(corsOptions));
app.options('/api/generate', cors(corsOptions));
app.options('/api/detect', cors(corsOptions));
app.options('/api/report', cors(corsOptions));
app.options('/api/compile', cors(corsOptions));
app.options('/api/fix', cors(corsOptions));
app.options('/api/test-key', cors(corsOptions));

// ==================== Solidity 编译服务 ====================
class SolidityCompiler {
  constructor() {
    this.solcVersion = '0.8.20';
  }

  /**
   * 编译Solidity代码
   */
  async compileSolidity(code, contractName = 'Contract') {
    return new Promise((resolve, reject) => {
      try {
        console.log('🔨 开始编译Solidity代码...');

        // 准备编译输入
        const input = {
          language: 'Solidity',
          sources: {
            [`${contractName}.sol`]: {
              content: code
            }
          },
          settings: {
            outputSelection: {
              '*': {
                '*': ['*']
              }
            },
            optimizer: {
              enabled: true,
              runs: 200
            }
          }
        };

        // 使用solc编译
        const output = JSON.parse(solc.compile(JSON.stringify(input)));

        // 检查编译错误
        if (output.errors) {
          const errors = output.errors.filter(error =>
            error.severity === 'error'
          );
          if (errors.length > 0) {
            const errorMessages = errors.map(err => err.formattedMessage).join('\n');
            throw new Error(`编译错误:\n${errorMessages}`);
          }
        }

        // 检查是否有合约输出
        const contracts = output.contracts[`${contractName}.sol`];
        if (!contracts) {
          throw new Error('未找到编译后的合约，请检查合约名称和代码格式');
        }

        // 获取第一个合约
        const contractKey = Object.keys(contracts)[0];
        const contract = contracts[contractKey];

        if (!contract) {
          throw new Error('无法提取合约信息');
        }

        const result = {
          abi: contract.abi || [],
          bytecode: contract.evm?.bytecode?.object || '',
          deployedBytecode: contract.evm?.deployedBytecode?.object || '',
          assembly: contract.evm?.assembly || '',
          opcodes: contract.evm?.opcodes || '',
          metadata: contract.metadata || ''
        };

        if (!result.bytecode) {
          throw new Error('无法生成字节码，请检查合约是否可编译');
        }

        console.log('✅ 编译成功:', {
          abiLength: result.abi.length,
          bytecodeLength: result.bytecode.length,
          contractName: contractKey
        });

        resolve(result);
      } catch (error) {
        console.error('❌ 编译失败:', error.message);
        reject(error);
      }
    });
  }

  /**
   * 从代码中提取合约名称
   */
  extractContractName(code) {
    const contractMatch = code.match(/contract\s+(\w+)/);
    return contractMatch ? contractMatch[1] : 'Contract';
  }

  /**
   * 验证Solidity代码格式
   */
  validateCode(code) {
    if (!code || code.trim() === '') {
      throw new Error('合约代码不能为空');
    }

    if (!code.includes('pragma solidity')) {
      throw new Error('合约代码必须包含 pragma solidity 声明');
    }

    if (!code.includes('contract')) {
      throw new Error('合约代码必须包含 contract 定义');
    }

    return true;
  }
}

// 创建编译器实例
const compiler = new SolidityCompiler();

// ==================== 工具函数：清理 Markdown 标记 ====================
const cleanCodeBlock = (rawCode) => {
  if (!rawCode) return '';

  let code = rawCode
    .replace(/```solidity[\s\S]*?\n/g, '')
    .replace(/```/g, '')
    .trim();

  // 修复版本号
  code = code.replace(/pragma solidity\s+[\^]?\d+\.\d+\.\d+;/, 'pragma solidity ^0.8.20;');

  // 修复非法的 @security 注释标签
  code = code.replace(/@security/g, 'Security Note:');

  return code;
};

// 启用 JSON 解析中间件
app.use(express.json({ limit: '10mb' }));

// ==================== 直接硬编码 API Key ====================
const DEEPSEEK_API_KEY = 'sk-59e780bc34534c52938f1984be83d350';

console.log('✅ API Key 已加载:', DEEPSEEK_API_KEY.substring(0, 15) + '...');

// ==================== 工具函数：清理临时文件 ====================
const cleanTempFiles = (filePaths) => {
  filePaths.forEach(filePath => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ 已清理: ${path.basename(filePath)}`);
      }
    } catch (err) {
      console.error(`⚠️ 清理失败: ${filePath}`, err.message);
    }
  });
};

// ==================== 可用的区块链节点配置 ====================
const BLOCKCHAIN_NODES = {
  sepolia: [
    'https://eth-sepolia.g.alchemy.com/v2/demo',
    'https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
    'https://rpc.sepolia.org',
    'https://rpc2.sepolia.org',
    'https://ethereum-sepolia-rpc.publicnode.com'
  ],
  mainnet: [
    'https://eth-mainnet.g.alchemy.com/v2/demo',
    'https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
    'https://cloudflare-eth.com'
  ]
};

// ==================== 区块链节点代理接口 ====================
app.post('/api/blockchain/proxy', async (req, res) => {
  console.log('📡 收到区块链节点代理请求...');

  const { method, params, id = 1, network = 'sepolia' } = req.body;

  // 获取可用的节点列表
  const availableNodes = BLOCKCHAIN_NODES[network] || BLOCKCHAIN_NODES.sepolia;

  let lastError = null;

  // 尝试所有可用的节点
  for (const targetUrl of availableNodes) {
    try {
      console.log(`🔄 尝试节点: ${targetUrl.substring(0, 50)}...`);
      console.log('🔄 转发请求到区块链节点:', { method, params });

      const response = await axios.post(targetUrl, {
        jsonrpc: '2.0',
        id: id,
        method: method,
        params: params || []
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 15000
      });

      console.log('✅ 节点响应成功:', method);

      // 设置 CORS 头部
      res.header('Access-Control-Allow-Origin', 'http://localhost:4200');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      return res.json(response.data);

    } catch (error) {
      lastError = error;
      console.warn(`⚠️ 节点 ${targetUrl.substring(0, 30)}... 失败:`, error.message);

      // 如果是 403 错误，继续尝试下一个节点
      if (error.response && error.response.status === 403) {
        console.log('🔄 BlastAPI 已停用，尝试下一个节点...');
        continue;
      }

      // 如果是网络错误，也继续尝试
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        continue;
      }
    }
  }

  // 所有节点都失败
  console.error('❌ 所有节点代理请求都失败:', lastError?.message);

  // 错误响应也设置 CORS 头部
  res.header('Access-Control-Allow-Origin', 'http://localhost:4200');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  res.status(500).json({
    jsonrpc: "2.0",
    id: id,
    error: {
      code: -32000,
      message: '所有区块链节点都请求失败。请检查网络连接或尝试使用其他 RPC 节点。最后错误: ' + (lastError?.message || '未知错误')
    }
  });
});

// ==================== 节点健康检查接口 ====================
app.get('/api/blockchain/health', async (req, res) => {
  console.log('🏥 区块链节点健康检查...');

  const healthResults = {};

  for (const [network, nodes] of Object.entries(BLOCKCHAIN_NODES)) {
    healthResults[network] = [];

    for (const nodeUrl of nodes) {
      try {
        const startTime = Date.now();
        const response = await axios.post(nodeUrl, {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_blockNumber',
          params: []
        }, {
          timeout: 10000
        });

        const responseTime = Date.now() - startTime;
        healthResults[network].push({
          url: nodeUrl,
          status: 'healthy',
          responseTime: responseTime,
          blockNumber: response.data.result
        });

      } catch (error) {
        healthResults[network].push({
          url: nodeUrl,
          status: 'unhealthy',
          error: error.message
        });
      }
    }
  }

  res.json(healthResults);
});

// ==================== 智能合约生成接口 ====================
app.post('/api/generate', async (req, res) => {
  console.log('🧠 收到合约生成请求...');

  const { description } = req.body;

  if (!description || description.trim() === '') {
    return res.status(400).json({ error: '需求描述不能为空' });
  }

  try {
    console.log('📤 发送请求到 DeepSeek API...');

    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: `你是一个专业的 Solidity 智能合约开发专家。请根据用户需求生成完整、可编译的智能合约代码。

要求：
1. 使用 Solidity 0.8.20 版本
2. 包含完整的合约逻辑
3. 代码必须能够通过编译
4. 只输出代码，不要额外解释

代码格式示例：
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MyContract {
    // 合约逻辑
}`
          },
          {
            role: 'user',
            content: `请生成一个智能合约：${description}`
          }
        ],
        temperature: 0.3,
        max_tokens: 2000,
        stream: false
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'User-Agent': 'SmartContract-Generator/1.0'
        },
        timeout: 120000,
        validateStatus: function (status) {
          return status < 500;
        }
      }
    );

    console.log('✅ 收到 DeepSeek 响应');

    if (!response.data.choices || response.data.choices.length === 0) {
      throw new Error('API 返回空响应');
    }

    const rawCode = response.data.choices[0]?.message?.content;

    if (!rawCode) {
      throw new Error('未生成代码内容');
    }

    // 清理代码
    const cleanCode = cleanCodeBlock(rawCode);
    console.log('✅ 合约生成成功，代码长度:', cleanCode.length);

    // 尝试编译验证
    try {
      console.log('🔨 开始编译生成的合约...');
      const compileResult = await compiler.compileSolidity(cleanCode);
      console.log('✅ 合约编译验证通过');

      res.json({
        code: cleanCode,
        compileInfo: {
          success: true,
          bytecode: compileResult.bytecode,
          abi: compileResult.abi,
          contractName: compiler.extractContractName(cleanCode)
        }
      });

    } catch (compileError) {
      console.warn('⚠️ 合约编译有警告，但代码已生成:', compileError.message);

      // 编译失败时仍然返回代码，但标记编译状态
      res.json({
        code: cleanCode,
        compileInfo: {
          success: false,
          error: compileError.message
        }
      });
    }

  } catch (error) {
    console.error('❌ 生成失败详情:');
    console.error('错误类型:', error.code);
    console.error('错误信息:', error.message);

    if (error.response) {
      console.error('状态码:', error.response.status);
      console.error('响应数据:', error.response.data);
    } else if (error.request) {
      console.error('无响应收到，可能是网络问题');
    }

    res.status(500).json({
      error: '合约生成失败',
      details: error.message,
      type: error.code || 'unknown'
    });
  }
});

// ==================== Slither 检测接口 ====================
app.post('/api/detect', async (req, res) => {
  console.log('📥 收到检测请求...');

  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: '请提供智能合约代码' });
  }

  // 清理代码中的 Markdown 标记
  const cleanSourceCode = cleanCodeBlock(code);

  // 临时保存合约文件
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const contractPath = path.join(tempDir, 'Contract.sol');
  const reportPath = path.join(tempDir, 'report.json');

  try {
    fs.writeFileSync(contractPath, cleanSourceCode);
    console.log('🔨 验证合约可编译性...');
    const compileResult = await compiler.compileSolidity(cleanSourceCode);
    console.log('✅ 合约编译验证通过');

    console.log('🔍 正在使用 Slither 检测...');
    const slitherCmd = `slither "${contractPath}" --json "${reportPath}"`;

    exec(slitherCmd, {
      maxBuffer: 1024 * 1024 * 10,
      cwd: tempDir
    }, (error, stdout, stderr) => {

      console.log('📄 Slither 输出:\n', stderr);

      // 读取 JSON 报告文件
      let result;
      try {
        if (fs.existsSync(reportPath)) {
          const reportContent = fs.readFileSync(reportPath, 'utf-8');
          result = JSON.parse(reportContent);
        } else {
          throw new Error('报告文件未生成');
        }
      } catch (parseError) {
        console.error('❌ 读取报告失败:', parseError);
        cleanTempFiles([contractPath, reportPath]);
        return res.status(500).json({
          error: 'Slither 检测失败',
          details: stderr
        });
      }

      // 解析漏洞信息
      const vulnerabilities = result.results?.detectors || [];

      console.log(`✅ 检测完成，发现 ${vulnerabilities.length} 个问题`);

      // 格式化漏洞信息
      const formattedVulnerabilities = vulnerabilities.map(v => {
        const severityMap = {
          'High': '高',
          'Medium': '中',
          'Low': '低',
          'Informational': '信息',
          'Optimization': '优化'
        };

        const severity = severityMap[v.impact] || '中';

        return {
          type: v.check || '未知漏洞',
          line: v.elements?.[0]?.source_mapping?.lines?.[0] || 0,
          severity: severity,
          suggestion: v.description || '请查看详细报告',
          impact: v.impact,
          confidence: v.confidence
        };
      });

      // 计算各等级漏洞数量
      const highCount = formattedVulnerabilities.filter(v => v.severity === '高').length;
      const mediumCount = formattedVulnerabilities.filter(v => v.severity === '中').length;
      const lowCount = formattedVulnerabilities.filter(v => v.severity === '低').length;
      const infoCount = formattedVulnerabilities.filter(v => v.severity === '信息').length;
      const optCount = formattedVulnerabilities.filter(v => v.severity === '优化').length;
      const totalCount = highCount + mediumCount + lowCount + infoCount + optCount;

      console.log('📊 漏洞统计详情:', {
        总问题数: totalCount,
        高危: highCount,
        中危: mediumCount,
        低危: lowCount,
        信息: infoCount,
        优化: optCount
      });

      // 清理临时文件
      cleanTempFiles([contractPath, reportPath]);

      res.json({
        vulnerabilities: formattedVulnerabilities,
        compileInfo: {
          success: true,
          bytecode: compileResult.bytecode,
          abi: compileResult.abi
        },
        summary: {
          total: totalCount,
          high: highCount,
          medium: mediumCount,
          low: lowCount,
          informational: infoCount,
          optimization: optCount
        }
      });
    });
  } catch (err) {
    console.error('❌ 检测失败:', err);
    cleanTempFiles([contractPath, reportPath]);
    res.status(500).json({ error: '系统错误', details: err.message });
  }
});

// ==================== 生成报告接口 ====================
app.post('/api/report', (req, res) => {
  console.log('📊 生成报告请求...');
  const { vulnerabilities } = req.body;

  if (!vulnerabilities || vulnerabilities.length === 0) {
    return res.status(400).send('<h3>没有检测到漏洞</h3>');
  }

  // 生成 HTML 报告
  const reportHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>智能合约检测报告</title>
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
      </style>
    </head>
    <body>
      <div class="container">
        <h2>🛡️ 智能合约漏洞检测报告</h2>
        <p><strong>📅 检测时间:</strong> ${new Date().toLocaleString('zh-CN')}</p>

        <div class="summary">
          <div class="summary-item">
            <h3>${vulnerabilities.length}</h3>
            <p>总问题数</p>
          </div>
          <div class="summary-item">
            <h3 class="high">${vulnerabilities.filter(v => v.severity === '高').length}</h3>
            <p>高危</p>
          </div>
          <div class="summary-item">
            <h3 class="medium">${vulnerabilities.filter(v => v.severity === '中').length}</h3>
            <p>中危</p>
          </div>
          <div class="summary-item">
            <h3 class="low">${vulnerabilities.filter(v => v.severity === '低').length}</h3>
            <p>低危</p>
          </div>
        </div>

        <h3>📋 问题详情</h3>
        ${vulnerabilities.map((v, i) => `
          <div class="vulnerability">
            <h3 class="${v.severity === '高' ? 'high' : v.severity === '中' ? 'medium' : 'low'}">
              ${i + 1}. ${v.type}
              <span class="badge badge-${v.severity === '高' ? 'high' : v.severity === '中' ? 'medium' : 'low'}">
                ${v.severity}
              </span>
            </h3>
            <p><strong>📍 位置:</strong> 第 ${v.line} 行</p>
            <p><strong>💡 修复建议:</strong> ${v.suggestion}</p>
          </div>
        `).join('')}

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
        <p style="color: #999; font-size: 12px; text-align: center;">
          报告生成时间: ${new Date().toLocaleString('zh-CN')} | Powered by Slither
        </p>
      </div>
    </body>
    </html>
  `;

  res.send(reportHtml);
});

// ==================== 独立编译接口 ====================
app.post('/api/compile', async (req, res) => {
  console.log('🔨 收到编译请求...');

  const { code } = req.body;

  if (!code || code.trim() === '') {
    return res.status(400).json({ error: '请提供Solidity代码' });
  }

  try {
    const cleanCode = cleanCodeBlock(code);
    const compileResult = await compiler.compileSolidity(cleanCode);

    res.json({
      success: true,
      abi: compileResult.abi,
      bytecode: compileResult.bytecode,
      deployedBytecode: compileResult.deployedBytecode,
      contractName: compiler.extractContractName(cleanCode)
    });
  } catch (error) {
    console.error('❌ 编译失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== 智能合约漏洞修复接口 ====================
app.post('/api/fix', async (req, res) => {
  console.log('🔧 收到漏洞修复请求...');

  const { code, vulnerabilities } = req.body;

  if (!code || !vulnerabilities) {
    return res.status(400).json({ error: '请提供合约代码和漏洞信息' });
  }

  try {
    // 格式化漏洞描述
    const vulnDesc = vulnerabilities.map((v, i) =>
      `${i + 1}. ${v.type} (第${v.line}行) - 严重等级: ${v.severity}\n   修复建议: ${v.suggestion}`
    ).join('\n');

    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: '你是一个智能合约安全专家。请根据检测到的漏洞，对代码进行修复，并添加安全注释说明修复内容。只输出修复后的完整代码，不要其他解释。'
          },
          {
            role: 'user',
            content: `原始代码：\n\`\`\`solidity\n${code}\n\`\`\`\n\n检测到的漏洞：\n${vulnDesc}\n\n请修复这些漏洞并返回完整代码。`
          }
        ],
        temperature: 0.2,
        max_tokens: 3000,
        stream: false
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'User-Agent': 'SmartContract-Fixer/1.0'
        },
        timeout: 120000,
        validateStatus: function (status) {
          return status < 500;
        }
      }
    );

    if (!response.data.choices || response.data.choices.length === 0) {
      throw new Error('API 返回空响应');
    }

    const rawFixedCode = response.data.choices[0]?.message?.content;

    if (!rawFixedCode) {
      throw new Error('未生成修复代码');
    }

    const fixedCode = cleanCodeBlock(rawFixedCode);

    console.log('✅ 漏洞修复成功');
    res.json({ code: fixedCode });

  } catch (error) {
    console.error('❌ 修复失败详情:');
    console.error('错误类型:', error.code);
    console.error('错误信息:', error.message);

    if (error.response) {
      console.error('状态码:', error.response.status);
      console.error('响应数据:', error.response.data);
    } else if (error.request) {
      console.error('无响应收到，可能是网络问题');
    }

    res.status(500).json({
      error: '漏洞修复失败',
      details: error.message,
      type: error.code || 'unknown'
    });
  }
});

// ==================== API Key 测试接口 ====================
app.get('/api/test-key', async (req, res) => {
  try {
    const response = await axios.get('https://api.deepseek.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      timeout: 10000
    });
    res.json({ valid: true, models: response.data.data.length });
  } catch (error) {
    res.json({ valid: false, error: error.message });
  }
});

// ==================== 启动服务器 ====================
app.listen(PORT, () => {
  console.log(`✅ 检测服务已启动: http://localhost:${PORT}`);
  console.log(`🌐 CORS 已配置，允许来源: http://localhost:4200`);
  console.log(`📡 可用接口：`);
  console.log(`   - POST /api/blockchain/proxy (区块链代理)`);
  console.log(`   - GET  /api/blockchain/health (节点健康检查)`);
  console.log(`   - POST /api/generate (智能合约生成)`);
  console.log(`   - POST /api/detect   (Slither 检测)`);
  console.log(`   - POST /api/fix      (漏洞修复)`);
  console.log(`   - POST /api/report   (生成报告)`);
  console.log(`   - GET  /api/test-key (测试 API Key)`);
  console.log(`🔑 API Key: ${DEEPSEEK_API_KEY.substring(0, 10)}...`);
  console.log(`🌐 配置的区块链节点:`);
  console.log(`   - Sepolia: ${BLOCKCHAIN_NODES.sepolia.length} 个可用节点`);
  console.log(`   - Mainnet: ${BLOCKCHAIN_NODES.mainnet.length} 个可用节点`);
});
