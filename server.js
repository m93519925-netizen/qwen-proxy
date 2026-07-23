require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TOKEN;
const COOKIE = process.env.COOKIE;

if (!TOKEN || !COOKIE) {
  console.error('❌ Thiếu TOKEN hoặc COOKIE trong file .env');
  process.exit(1);
}

const getHeaders = () => ({
  'accept': 'application/json',
  'content-type': 'application/json',
  'cookie': COOKIE,
  'origin': 'https://chat.qwen.ai',
  'referer': 'https://chat.qwen.ai/',
  'source': 'web',
  'x-accel-buffering': 'no',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  'accept-encoding': 'identity',
});

function extractText(responseText) {
  let fullText = '';
  try {
    const lines = responseText.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6).trim();
      if (json === '[DONE]') break;
      try {
        const data = JSON.parse(json);
        const delta = data?.choices?.[0]?.delta;
        if (delta?.phase === 'answer' && delta?.content) {
          fullText += delta.content;
        }
      } catch {}
    }
  } catch (e) {
    console.error('Extract error:', e.message);
  }
  return fullText;
}

app.get('/', (req, res) => {
  res.json({ status: 'Qwen Proxy running 🚀' });
});

app.post('/proxy', async (req, res) => {
  const { prompt, model } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Thiếu prompt' });

  const chatId = uuidv4();
  const msgId = uuidv4();
  const selectedModel = model || 'qwen3.7-plus';

  try {
    const payload = {
      stream: true,
      version: '2.1',
      incremental_output: true,
      chat_id: chatId,
      chat_mode: 'normal',
      model: selectedModel,
      parent_id: null,
      messages: [
        {
          id: null,
          fid: msgId,
          parentId: null,
          childrenIds: [],
          role: 'user',
          content: prompt,
          user_action: 'chat',
          files: [],
          timestamp: Math.floor(Date.now() / 1000),
          models: [selectedModel],
          model: '',
          chat_type: 't2t',
          feature_config: {
            thinking_enabled: false,
            output_schema: 'phase',
            research_mode: 'normal',
            auto_thinking: false,
            thinking_mode: 'Thinking',
            thinking_format: 'summary',
            auto_search: false
          },
          extra: { meta: { subChatType: 't2t' } },
          sub_chat_type: 't2t',
          parent_id: null
        }
      ],
      timestamp: Math.floor(Date.now() / 1000)
    };

    console.log('📤 Sending to Qwen, model:', selectedModel);
    const response = await fetch(
      `https://chat.qwen.ai/api/v2/chat/completions?chat_id=${chatId}`,
      {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      }
    );

    console.log('Status:', response.status);
    const text = await response.text();
    console.log('Raw (300):', text.slice(0, 300));

    if (!response.ok) {
      return res.status(response.status).json({ error: `Qwen error: ${response.status}` });
    }

    const extracted = extractText(text);
    if (extracted) {
      console.log('✅ Response:', extracted.slice(0, 100));
      res.json({ response: extracted, model: selectedModel });
    } else {
      console.log('⚠️ Không parse được');
      res.json({ response: text.slice(0, 2000), raw: true });
    }

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Qwen Proxy chạy tại http://localhost:${PORT}`);
});
