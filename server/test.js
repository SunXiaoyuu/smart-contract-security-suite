require('dotenv').config();
const axios = require('axios');

const DEEPSEEK_API_KEY = 'sk-59e780bc34534c52938f1984be83d350';

console.log('测试 API Key:', DEEPSEEK_API_KEY ? DEEPSEEK_API_KEY.substring(0, 15) + '...' : '未设置');

async function testAPI() {
  try {
    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'user', content: '你好' }
        ],
        max_tokens: 50
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        timeout: 10000
      }
    );
    
    console.log('✅ API 调用成功:', response.data.choices[0].message.content);
  } catch (error) {
    console.error('❌ API 调用失败:');
    console.error('状态码:', error.response?.status);
    console.error('错误信息:', JSON.stringify(error.response?.data, null, 2));
    console.error('错误详情:', error.message);
  }
}

testAPI();