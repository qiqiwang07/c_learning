function $(selector) {
  return document.querySelector(selector);
}

function appendAIMessage(role, text) {
  const output = $('#ai-output');
  if (!output) return;
  const item = document.createElement('div');
  item.className = `ai-message ai-message-${role}`;
  item.textContent = text;
  output.appendChild(item);
  output.scrollTop = output.scrollHeight;
}

async function getAIResponse(question) {
  // 这里是占位实现。真正接入 DeepSeek API 应该在后端安全处理 API key。
  return `AI 助手已准备好回答你的问题：\n${question}\n\n（提示：请在后端配置 DeepSeek API，并通过安全接口调用，避免将 API key 写入前端。）`;
}

function askAI() {
  const input = $('#ai-input');
  if (!input) return;
  const question = input.value.trim();
  if (!question) return;
  appendAIMessage('user', question);
  input.value = '';
  appendAIMessage('assistant', '正在生成回答，请稍候...');
  getAIResponse(question).then(answer => {
    const assistantNodes = document.querySelectorAll('.ai-message-assistant');
    const last = assistantNodes[assistantNodes.length - 1];
    if (last) {
      last.textContent = answer;
    } else {
      appendAIMessage('assistant', answer);
    }
  }).catch(error => {
    appendAIMessage('assistant', `AI 请求失败：${error.message}`);
  });
}

export function initAI() {
  const sendButton = $('#ai-send');
  const input = $('#ai-input');
  if (!sendButton || !input) return;
  sendButton.onclick = askAI;
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      askAI();
    }
  });
}
