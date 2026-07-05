import { askAI as askAIRequest } from './api.js';

function $(s) {
  return document.querySelector(s);
}

function appendMessage(role, text, loading = false) {
  const output = $('#ai-output');

  const wrapper = document.createElement('div');
  wrapper.className = `ai-message ai-message-${role}`;

  const bubble = document.createElement('div');
  bubble.className = `ai-bubble ai-bubble-${role}`;

  if (loading) {
    bubble.classList.add('ai-bubble-loading');
  }

  bubble.textContent = text;

  wrapper.appendChild(bubble);
  output.appendChild(wrapper);

  output.scrollTop = output.scrollHeight;
  return bubble;
}

async function askAI() {
  const input = $('#ai-input');
  const btn = $('#ai-send');

  const question = input.value.trim();
  if (!question) return;

  appendMessage('user', question);
  input.value = '';

  const bubble = appendMessage('assistant', '正在思考...', true);
  btn.disabled = true;

  try {
    const data = await askAIRequest(question, {});

    if (!data.success) {
      bubble.textContent = '错误：' + (data.error || 'AI 接口失败');
      bubble.classList.remove('ai-bubble-loading');
      return;
    }

    bubble.textContent = data.answer || 'AI 没有返回内容';
    bubble.classList.remove('ai-bubble-loading');
  } catch (err) {
    bubble.textContent = '请求失败：' + err.message;
    bubble.classList.remove('ai-bubble-loading');
  } finally {
    btn.disabled = false;
  }
}

export function initAI() {
  const input = $('#ai-input');
  const btn = $('#ai-send');

  if (!input || !btn) return;

  btn.onclick = askAI;

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      askAI();
    }
  });
}