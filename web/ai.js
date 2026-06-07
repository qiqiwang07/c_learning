import { askAI as requestAI } from './api.js?v=202606071520';
import { state } from './state.js?v=20260607';
import { getCode } from './editor.js?v=20260607';

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

async function askAI() {
  const input = $('#ai-input');
  const sendButton = $('#ai-send');
  if (!input) return;
  const question = input.value.trim();
  if (!question) return;
  appendAIMessage('user', question);
  input.value = '';
  appendAIMessage('assistant', '正在生成回答，请稍候...');
  input.disabled = true;
  if (sendButton) sendButton.disabled = true;
  try {
    const answer = await getAIResponse(question);
    const assistantNodes = document.querySelectorAll('.ai-message-assistant');
    const last = assistantNodes[assistantNodes.length - 1];
    if (last) {
      last.textContent = answer;
    } else {
      appendAIMessage('assistant', answer);
    }
  } catch (error) {
    const assistantNodes = document.querySelectorAll('.ai-message-assistant');
    const last = assistantNodes[assistantNodes.length - 1];
    const message = `AI 请求失败：${error.message}`;
    if (last) {
      last.textContent = message;
    } else {
      appendAIMessage('assistant', message);
    }
  } finally {
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
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      askAI();
    }
  });
}
