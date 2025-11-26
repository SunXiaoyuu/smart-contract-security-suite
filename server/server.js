const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = 3000;

//wyl
// ==================== 工具函数：清理 Markdown 标记 ====================
const cleanCodeBlock = (rawCode) => {
  if (!rawCode) return '';
  // 去除 ```solidity, ```, 以及可能的前后空格

  let code = rawCode
    .replace(/```solidity[\s\S]*?\n/g, '') // 去除 Markdown 开头
    .replace(/```/g, '')                   // 去除 Markdown 结尾
    .trim();

    // 1. 修复版本号 (强制使用 0.8.20)
  code = code.replace(/pragma solidity\s+[\^]?\d+\.\d+\.\d+;/, 'pragma solidity ^0.8.20;');

  // 2. 🔧 新增：修复非法的 @security 注释标签
  // 将 "@security" 替换为 "Security Note:"，这样编译器就会把它当作普通注释处理
  code = code.replace(/@security/g, 'Security Note:');

  return code;
  
  // return rawCode
  //   .replace(/```solidity[\s\S]*?\n/g, '') // 去除开头的 ```solidity
  //   .replace(/```/g, '')                   // 去除结尾的 ```
  //   .trim();                               // 去除首尾空格
};

// 启用 CORS
app.use(cors({
  origin: 'http://localhost:4200',
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// 读取 DeepSeek API Key
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-59e780bc34534c52938f1984be83d350';

if (!DEEPSEEK_API_KEY) {
  console.warn('⚠️ 未设置 DEEPSEEK_API_KEY，生成和修复功能将不可用');
} else {
  console.log('✅ API Key 已加载:', DEEPSEEK_API_KEY.substring(0, 15) + '...');
}

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

// ==================== Slither 检测接口 ====================
app.post('/api/detect', async (req, res) => {
  console.log('📥 收到检测请求...');
  
  const { code } = req.body;
  
  if (!code) {
    return res.status(400).json({ error: '请提供智能合约代码' });
  }

  //wyl 1. 清理代码中的 Markdown 标记
  const cleanSourceCode = cleanCodeBlock(code);
  // =============== 新增代码结束 ===============


  // 临时保存合约文件
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const contractPath = path.join(tempDir, 'Contract.sol');
  const reportPath = path.join(tempDir, 'report.json');
  
  try {
    //wyl

    fs.writeFileSync(contractPath, cleanSourceCode);
    //fs.writeFileSync(contractPath, code);
    console.log('🔍 正在使用 Slither 检测...');

    // 修复：使用反引号正确拼接字符串
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

      const formattedVulnerabilities = vulnerabilities.map(v => {
        const severityMap = {
          'High': '高',
          'Medium': '中',
          'Low': '低',
          'Informational': '信息'
        };

        return {
          type: v.check || '未知漏洞',
          line: v.elements?.[0]?.source_mapping?.lines?.[0] || 0,
          severity: severityMap[v.impact] || '中',
          suggestion: v.description || '请查看详细报告',
          impact: v.impact,
          confidence: v.confidence
        };
      });

      // 清理临时文件
      cleanTempFiles([contractPath, reportPath]);

      res.json({
        vulnerabilities: formattedVulnerabilities,
        summary: {
          total: formattedVulnerabilities.length,
          high: formattedVulnerabilities.filter(v => v.severity === '高').length,
          medium: formattedVulnerabilities.filter(v => v.severity === '中').length,
          low: formattedVulnerabilities.filter(v => v.severity === '低').length
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

// ==================== 智能合约生成接口 ====================
app.post('/api/generate', async (req, res) => {
  console.log('🧠 收到合约生成请求...');
  
  const { description } = req.body;

  if (!description || description.trim() === '') {
    return res.status(400).json({ error: '需求描述不能为空' });
  }

  if (!DEEPSEEK_API_KEY) {
    return res.status(500).json({ error: '服务未配置 API Key' });
  }

  try {
    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: '你是一个专业的 Solidity 智能合约开发专家。请根据用户需求生成完整的智能合约代码，包含详细注释。只输出代码，不要额外解释。'
          },
          {
            role: 'user',
            content: `请生成一个智能合约：${description}`
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        timeout: 30000
      }
    );

    //wylgai  const code = response.data.choices?.[0]?.message?.content || '未生成代码';
    //wyl
    const rawCode = response.data.choices?.[0]?.message?.content || '未生成代码';
    const code = cleanCodeBlock(rawCode); // <--- 使用清理函数


    console.log('✅ 合约生成成功');
    res.json({ code });

  } catch (error) {
    console.error('❌ 生成失败:', error.response?.data || error.message);
    res.status(500).json({ 
      error: '合约生成失败',
      details: error.response?.data?.error?.message || error.message
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

  if (!DEEPSEEK_API_KEY) {
    return res.status(500).json({ error: '服务未配置 API Key' });
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
        max_tokens: 3000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        timeout: 30000
      }
    );

    const fixedCode = response.data.choices?.[0]?.message?.content || '修复失败';
    
    console.log('✅ 漏洞修复成功');
    res.json({ code: fixedCode });

  } catch (error) {
    console.error('❌ 修复失败:', error.response?.data || error.message);
    res.status(500).json({ 
      error: '漏洞修复失败',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// ==================== 启动服务器 ====================
app.listen(PORT, () => {
  console.log(`✅ 检测服务已启动: http://localhost:${PORT}`);
  console.log(`📡 可用接口：`);
  console.log(`   - POST /api/detect   (Slither 检测)`);
  console.log(`   - POST /api/generate (智能合约生成)`);
  console.log(`   - POST /api/fix      (漏洞修复)`);
  console.log(`   - POST /api/report   (生成报告)`);
});