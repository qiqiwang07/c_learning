import { askAI as requestAI } from './api.js?v=202606071520';
import { state } from './state.js?v=20260607';
import { getCode } from './editor.js?v=20260607';

function $(selector) {
  return document.querySelector(selector);
}

// ✅ 返回节点（关键修复）
function appendAIMessage(role, text) {
  const output = $('#ai-output');
  if (!output) return null;

  const item = document.createElement('div');
  item.className = `ai-message ai-message-${role}`;
  item.textContent = text;

  output.appendChild(item);
  output.scrollTop = output.scrollHeight;

  return item;
}

async function getAIResponse(question) {
  const data = await requestAI(question, {
    language: state.currentLanguage,
    mode: state.currentMode,
    code: getCode(),
  });

  if (!data.success) {
    throw new Error(data.error || 'AI 服务返回失败。');
  }

  return data.answer;
}

let isLoading = false;

async function askAI() {
  if (isLoading) return; // ✅ 防止重复点击

  const input = $('#ai-input');
  const sendButton = $('#ai-send');
  if (!input) return;

  const question = input.value.trim();
  if (!question) return;

  appendAIMessage('user', question);
  input.value = '';

  // ✅ 绑定 loading 节点（关键优化）
  const loadingNode = appendAIMessage('assistant', '正在生成回答，请稍候...');

  isLoading = true;
  input.disabled = true;
  if (sendButton) sendButton.disabled = true;

  try {
    const answer = await getAIResponse(question);
    if (loadingNode) loadingNode.textContent = answer;
  } catch (error) {
    const msg = `AI 请求失败：${error.message || '服务异常'}`;
    if (loadingNode) loadingNode.textContent = msg;
  } finally {
    isLoading = false;
    input.disabled = false;
    if (sendButton) sendButton.disabled = false;
    input.focus();
  }
}

export function initAI() {
  const sendButton = $('#ai-send');
  const input = $('#ai-input');
  if (!sendButton || !input) return;

  sendButton.onclick = askAI;

  // ✅ 修复 =&gt; 并支持 Shift+Enter
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      askAI();
    }
  });
}