let editor = null;

export function initEditor() {
  const textarea = document.getElementById('code');
  if (!textarea) return;

  if (editor) return editor;

  editor = CodeMirror.fromTextArea(textarea, {
    mode: 'text/x-csrc',
    theme: 'dracula',
    lineNumbers: true,
    indentUnit: 2,
    tabSize: 2,
  });

  setTimeout(() => {
    editor.refresh();
  }, 100);

  return editor;
}

export function getCode() {
  return editor ? editor.getValue() : '';
}

export function setCode(code) {
  if (editor) editor.setValue(code);
}

export function refreshEditor() {
  if (editor) editor.refresh();
}