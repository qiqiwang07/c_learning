import { completions, getEditorMode } from './data.js?v=20260607';
import { state } from './state.js?v=20260607';

let editor = null;

export function getCode() {
  return editor ? editor.getValue() : document.querySelector('#code').value;
}

export function setCode(value) {
  if (editor) {
    editor.setValue(value);
  } else {
    document.querySelector('#code').value = value;
  }
}

export function setEditorReadOnly(value) {
  if (editor) {
    editor.setOption('readOnly', value ? 'nocursor' : false);
  } else {
    document.querySelector('#code').readOnly = !!value;
  }
}

export function updateEditorMode(language) {
  if (!editor) return;
  editor.setOption('mode', getEditorMode(language));
}

function codeHint(cm) {
  const cursor = cm.getCursor();
  const token = cm.getTokenAt(cursor);
  const start = token.start;
  const end = cursor.ch;
  const curWord = token.string.slice(0, end - start);
  const list = completions[state.currentLanguage] || [];
  const filtered = list.filter(item => item.startsWith(curWord) || curWord === '');
  return {
    list: filtered.length ? filtered : list,
    from: CodeMirror.Pos(cursor.line, start),
    to: CodeMirror.Pos(cursor.line, end)
  };
}

export function initEditor(language) {
  const textarea = document.querySelector('#code');
  editor = CodeMirror.fromTextArea(textarea, {
    mode: getEditorMode(language),
    lineNumbers: true,
    indentUnit: 2,
    tabSize: 2,
    matchBrackets: true,
    autoCloseBrackets: true,
    extraKeys: {
      'Ctrl-Space': 'autocomplete',
      'Tab': cm => cm.execCommand('insertSoftTab')
    }
  });

  editor.on('keyup', (cm, event) => {
    const code = event.key;
    if (!cm.state.completionActive && /[\w\.]/.test(code)) {
      CodeMirror.commands.autocomplete(cm, {completeSingle: false, hint: codeHint});
    }
  });

  editor.on('focus', () => {
    if (!state.answerVisible && state.currentMode === 'teach' && !state.currentExercise) {
      setCode('/* 教学模式：请选择练习后再查看答案。*/');
    }
  });
}
