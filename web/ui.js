import { exercises, languages, hints, getExerciseTemplate, getFileExtension, getPlaceholderText } from './data.js?v=20260607';
import { state } from './state.js?v=20260607';
import { initEditor, updateEditorMode, setCode, setEditorReadOnly, getCode } from './editor.js?v=20260607';
import { checkCode, compileCode, saveSnippet, listSnippets, getSnippet } from './api.js?v=202606072215';
import { initAI } from './ai.js?v=202606072215';

function $(sel) {
  return document.querySelector(sel);
}

function appendConsole(text) {
  const output = $('#console-output');
  const line = document.createElement('div');
  line.textContent = text;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function updateShowAnswerButton() {
  const btn = $('#show-answer');
  if (!btn) return;
  if (state.currentMode !== 'teach' || !state.currentExercise) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = 'inline-block';
  btn.textContent = state.answerVisible ? '退出答案模式' : '查看参考答案';
}

function switchMode(mode) {
  state.currentMode = mode;
  $('#btn-teach').classList.toggle('active', mode === 'teach');
  $('#btn-create').classList.toggle('active', mode === 'create');
  updateModeUI();
  appendConsole(`切换到 ${mode === 'teach' ? '教学模式' : '创造模式'}。输入 help 获取命令。`);
}

function updateModeUI() {
  const hint = $('#hint');
  const exercisePanel = $('#exercise-panel');
  const showAnswerBtn = $('#show-answer');
  if (state.currentMode === 'teach') {
    hint.style.display = 'inline-block';
    $('#sidebar').querySelector('h2').textContent = '教学模块';
    if (exercisePanel) exercisePanel.style.display = 'block';
    if (state.currentExercise) {
      showAnswerBtn.style.display = 'inline-block';
      $('#title').textContent = state.currentExercise.title;
      $('#desc').textContent = state.currentExercise.desc;
      $('#sample-in').textContent = state.currentExercise.sampleIn;
      $('#sample-out').textContent = state.currentExercise.sampleOut;
    } else {
      showAnswerBtn.style.display = 'none';
      $('#title').textContent = '请选择练习';
      $('#desc').textContent = '从左侧练习列表中选择一个题目，进入教学模式。';
      $('#sample-in').textContent = '-';
      $('#sample-out').textContent = '-';
      setEditorReadOnly(true);
      setCode(getPlaceholderText(state.currentLanguage));
    }
  } else {
    hint.style.display = 'none';
    $('#sidebar').querySelector('h2').textContent = '创造模块';
    if (exercisePanel) exercisePanel.style.display = 'none';
    showAnswerBtn.style.display = 'none';
    state.currentExercise = null;
    state.answerVisible = false;
    setEditorReadOnly(false);
    setCode(getPlaceholderText(state.currentLanguage, true));
    $('#title').textContent = '创造模式';
    $('#desc').textContent = '在创造模式下，右侧即可直接编程，语言可切换。';
    $('#sample-in').textContent = '-';
    $('#sample-out').textContent = '-';
  }
}

function setLanguage(lang) {
  state.currentLanguage = lang;
  document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.textContent === lang));
  updateEditorMode(lang);
  if (!state.currentExercise) {
    setCode(getPlaceholderText(state.currentLanguage, state.currentMode === 'create'));
  } else if (state.answerVisible) {
    setCode(getExerciseTemplate(state.currentExercise, state.currentLanguage));
  }
  appendConsole(`已切换语言：${lang}。`);
}

function selectExercise(id) {
  const ex = exercises.find(e => e.id === id);
  if (!ex) return;
  state.currentExercise = ex;
  state.answerVisible = false;
  $('#title').textContent = ex.title;
  $('#desc').textContent = ex.desc;
  $('#sample-in').textContent = ex.sampleIn;
  $('#sample-out').textContent = ex.sampleOut;
  setCode(getPlaceholderText(state.currentLanguage));
  setEditorReadOnly(false);
  updateShowAnswerButton();
  appendConsole(`已选择练习：${ex.title}。请先思考，再点击“查看参考答案”。`);
}

function downloadCode() {
  const code = getCode();
  const ext = getFileExtension(state.currentLanguage);
  const blob = new Blob([code], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `练习.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  appendConsole(`已将当前代码打包为练习.${ext} 供本地编译。`);
}

function copyCode() {
  navigator.clipboard.writeText(getCode()).then(() => {
    appendConsole('当前代码已复制到剪贴板。');
  });
}

function showHint() {
  if (!state.currentExercise) {
    appendConsole('请先选择一个练习，然后点击提示按钮。');
    return;
  }
  appendConsole(`提示：${hints[state.currentExercise.title] || '本次练习重点是阅读题目，分步完成输入、处理和输出。'}`);
}

function toggleAnswerMode() {
  if (!state.currentExercise) {
    appendConsole('请先选择一个练习，才能查看参考答案。');
    return;
  }
  state.answerVisible = !state.answerVisible;
  if (state.answerVisible) {
    setCode(getExerciseTemplate(state.currentExercise, state.currentLanguage));
    setEditorReadOnly(true);
    appendConsole('已显示参考答案，当前只读。点击“退出答案模式”继续编程。');
  } else {
    setCode(getPlaceholderText(state.currentLanguage));
    setEditorReadOnly(false);
    appendConsole('已退出答案模式，可开始编程。');
  }
  updateShowAnswerButton();
}

function handleCommand() {
  const raw = $('#command-input').value.trim();
  if (!raw) return;
  appendConsole(`$ ${raw}`);
  $('#command-input').value = '';
  const [command, ...rest] = raw.split(' ');
  switch (command.toLowerCase()) {
    case 'help':
      appendConsole('可用命令：help、check、run、save、list、mode、hint、answer');
      appendConsole('check：本地编译检查当前代码；run：编译并运行当前代码；save：保存当前代码；list：列出已保存代码；mode teach/create：切换模式；hint：教学模式下显示知识点；answer：教学模式切换参考答案。');
      break;
    case 'check':
      runCheck();
      break;
    case 'run':
      runProgram(rest.join(' '));
      break;
    case 'mode':
      if (rest[0] === 'teach' || rest[0] === 'create') {
        switchMode(rest[0]);
      } else {
        appendConsole('请使用 mode teach 或 mode create 切换模式。');
      }
      break;
    case 'save':
      saveCurrentCode();
      break;
    case 'answer':
    case 'showanswer':
      toggleAnswerMode();
      break;
    case 'list':
      refreshSavedList();
      break;
    case 'hint':
      if (state.currentMode === 'teach') showHint();
      else appendConsole('提示按钮仅在教学模式下可用。切换到教学模式后使用 hint。');
      break;
    default:
      appendConsole(`未知命令：${command}。输入 help 查看命令列表。`);
  }
}

async function runCheck() {
  const code = getCode();
  appendConsole('正在检查代码，请稍候...');
  try {
    const data = await checkCode(code, state.currentLanguage);
    if (data.success) {
      appendConsole('编译检查通过，未发现语法错误。');
      if (data.stderr) {
        appendConsole(`编译警告：${data.stderr}`);
      }
    } else {
      appendConsole('编译失败，请检查以下错误：');
      appendConsole(data.stderr || '未知编译错误。');
    }
  } catch (error) {
    appendConsole(`检查失败：${error.message}`);
  }
}

async function runProgram(inputText) {
  if (state.currentMode === 'teach' && !state.currentExercise) {
    appendConsole('请先选择一个练习，然后再运行。');
    return;
  }
  const code = getCode();
  appendConsole('正在编译并运行，请稍候...');
  try {
    const stdin = inputText || (state.currentExercise ? state.currentExercise.sampleIn : '');
    const data = await compileCode(code, stdin, state.currentLanguage);
    if (!data.success) {
      appendConsole('编译或运行失败：');
      appendConsole(data.stderr || '发生未知错误。');
      return;
    }
    appendConsole('运行结果：');
    appendConsole(`返回码：${data.returncode}`);
    if (data.stdout) {
      appendConsole('标准输出：');
      appendConsole(data.stdout);
    }
    if (data.stderr) {
      appendConsole('标准错误：');
      appendConsole(data.stderr);
    }
  } catch (error) {
    appendConsole(`运行失败：${error.message}`);
  }
}

async function saveCurrentCode() {
  if (!state.currentExercise && state.currentMode === 'teach') {
    appendConsole('请先选择一个练习，然后再保存代码。');
    return;
  }
  const code = getCode();
  appendConsole('正在保存代码，请稍候...');
  try {
    const title = state.currentExercise ? state.currentExercise.title : '创造模式代码';
    const data = await saveSnippet(title, state.currentLanguage, code);
    if (data.success) {
      appendConsole(`保存成功，ID=${data.id}`);
      refreshSavedList();
    } else {
      appendConsole(`保存失败：${data.error || '未知错误'}`);
    }
  } catch (error) {
    appendConsole(`保存失败：${error.message}`);
  }
}

async function refreshSavedList() {
  appendConsole('正在刷新已保存代码列表...');
  try {
    const data = await listSnippets();
    if (!data.success) {
      appendConsole(`加载失败：${data.error || '未知错误'}`);
      return;
    }
    const list = $('#saved-list');
    list.innerHTML = '';
    data.snippets.forEach(item => {
      const li = document.createElement('li');
      li.textContent = `[${item.id}] ${item.title} (${item.language})`;
      li.onclick = () => loadSavedSnippet(item.id);
      list.appendChild(li);
    });
    appendConsole(`已加载 ${data.snippets.length} 条已保存代码。点击列表可加载该代码。`);
  } catch (error) {
    appendConsole(`加载失败：${error.message}`);
  }
}

async function loadSavedSnippet(id) {
  appendConsole(`正在加载保存代码 ID=${id}...`);
  try {
    const data = await getSnippet(id);
    if (!data.success) {
      appendConsole(`加载失败：${data.error || '未知错误'}`);
      return;
    }
    const snippet = data.snippet;
    state.currentLanguage = snippet.language || state.currentLanguage;
    setLanguage(state.currentLanguage);
    setCode(snippet.code);
    $('#title').textContent = snippet.title;
    $('#desc').textContent = `已保存代码：${snippet.title}`;
    appendConsole(`已加载保存代码 ID=${snippet.id}。`);
  } catch (error) {
    appendConsole(`加载失败：${error.message}`);
  }
}

export function init() {
  const exerciseList = $('#exercises');
  exercises.forEach(ex => {
    const li = document.createElement('li');
    li.textContent = ex.title;
    li.dataset.id = ex.id;
    li.onclick = () => selectExercise(ex.id);
    exerciseList.appendChild(li);
  });

  const langButtons = $('#language-buttons');
  languages.forEach(lang => {
    const btn = document.createElement('button');
    btn.className = 'lang-btn';
    btn.textContent = lang;
    btn.onclick = () => setLanguage(lang);
    langButtons.appendChild(btn);
  });
  setLanguage(state.currentLanguage);

  $('#download').onclick = downloadCode;
  $('#copy').onclick = copyCode;
  $('#save').onclick = saveCurrentCode;
  $('#refresh-saved').onclick = refreshSavedList;
  $('#show-answer').onclick = toggleAnswerMode;
  $('#hint').onclick = showHint;

  const teachBtn = $('#btn-teach');
  const createBtn = $('#btn-create');
  if (teachBtn) {
    teachBtn.addEventListener('click', event => {
      event.preventDefault();
      switchMode('teach');
    });
  }
  if (createBtn) {
    createBtn.addEventListener('click', event => {
      event.preventDefault();
      switchMode('create');
    });
  }

  $('#command-submit').onclick = handleCommand;
  $('#command-input').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleCommand();
    }
  });

  initEditor(state.currentLanguage);
  setCode(getPlaceholderText(state.currentLanguage));
  setEditorReadOnly(true);
  updateModeUI();
  initAI();
  refreshSavedList();
}
