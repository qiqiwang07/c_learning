const exercises = [
  {
    id: 'primes-range',
    title: '区间质数',
    desc: '提示输入两个整数，并打印它们之间（含端点）的所有质数。',
    templates: {
      C: `/*
 * 区间质数程序
 * 说明：提示用户输入两个整数，输出它们之间（包含端点）的所有质数。
 */
#include <stdio.h>
#include <stdbool.h>

bool is_prime(int n) {
  if (n <= 1) return false;
  if (n == 2) return true;
  if (n % 2 == 0) return false;
  for (int i = 3; i * i <= n; i += 2) {
    if (n % i == 0) return false;
  }
  return true;
}

int main(void) {
  int a, b;
  if (scanf("%d %d", &a, &b) != 2) return 1;
  if (a > b) { int t = a; a = b; b = t; }
  for (int n = a; n <= b; n++) {
    if (is_prime(n)) printf("%d\n", n);
  }
  return 0;
}
`,
      'C++': `#include <bits/stdc++.h>
using namespace std;

bool is_prime(int n) {
  if (n <= 1) return false;
  if (n == 2) return true;
  if (n % 2 == 0) return false;
  for (int i = 3; i * i <= n; i += 2) {
    if (n % i == 0) return false;
  }
  return true;
}

int main() {
  int a, b;
  if (!(cin >> a >> b)) return 1;
  if (a > b) swap(a, b);
  for (int n = a; n <= b; n++) {
    if (is_prime(n)) cout << n << '\n';
  }
  return 0;
}
`,
      Java: `import java.util.Scanner;

public class Main {
  private static boolean isPrime(int n) {
    if (n <= 1) return false;
    if (n == 2) return true;
    if (n % 2 == 0) return false;
    for (int i = 3; i * i <= n; i += 2) {
      if (n % i == 0) return false;
    }
    return true;
  }

  public static void main(String[] args) {
    Scanner scanner = new Scanner(System.in);
    int a = scanner.nextInt();
    int b = scanner.nextInt();
    if (a > b) {
      int t = a; a = b; b = t;
    }
    for (int n = a; n <= b; n++) {
      if (isPrime(n)) System.out.println(n);
    }
  }
}
`,
      Python: `def is_prime(n):
    if n <= 1:
        return False
    if n == 2:
        return True
    if n % 2 == 0:
        return False
    i = 3
    while i * i <= n:
        if n % i == 0:
            return False
        i += 2
    return True


a, b = map(int, input().split())
if a > b:
    a, b = b, a
for n in range(a, b + 1):
    if is_prime(n):
        print(n)
`,
      JavaScript: `const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const data = [];
rl.on('line', line => {
  data.push(...line.trim().split(/\s+/).map(Number));
  if (data.length >= 2) {
    const [a, b] = data;
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    for (let n = start; n <= end; n++) {
      if (isPrime(n)) console.log(n);
    }
    rl.close();
  }
});

function isPrime(n) {
  if (n <= 1) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}
`,
      Go: `package main

import (
  "bufio"
  "fmt"
  "os"
)

func isPrime(n int) bool {
  if n <= 1 {
    return false
  }
  if n == 2 {
    return true
  }
  if n%2 == 0 {
    return false
  }
  for i := 3; i*i <= n; i += 2 {
    if n%i == 0 {
      return false
    }
  }
  return true
}

func main() {
  reader := bufio.NewReader(os.Stdin)
  var a, b int
  fmt.Fscan(reader, &a, &b)
  if a > b {
    a, b = b, a
  }
  for n := a; n <= b; n++ {
    if isPrime(n) {
      fmt.Println(n)
    }
  }
}
`,
      Rust: `use std::io::{self, BufRead};

fn is_prime(n: i32) -> bool {
    if n <= 1 {
        return false;
    }
    if n == 2 {
        return true;
    }
    if n % 2 == 0 {
        return false;
    }
    let mut i = 3;
    while i * i <= n {
        if n % i == 0 {
            return false;
        }
        i += 2;
    }
    true
}

fn main() {
    let stdin = io::stdin();
    let mut nums = Vec::new();
    for line in stdin.lock().lines() {
        if let Ok(text) = line {
            for token in text.split_whitespace() {
                if let Ok(value) = token.parse::<i32>() {
                    nums.push(value);
                }
            }
        }
        if nums.len() >= 2 {
            break;
        }
    }
    if nums.len() < 2 {
        return;
    }
    let mut a = nums[0];
    let mut b = nums[1];
    if a > b {
        std::mem::swap(&mut a, &mut b);
    }
    for n in a..=b {
        if is_prime(n) {
            println!("{}", n);
        }
    }
}
`
    },
    sampleIn: '10 30',
    sampleOut: '11\n13\n17\n19\n23\n29\n'
  },
  {
    id: 'big-multiply',
    title: '大整数乘法',
    desc: '读取两行大整数（字符串形式），使用字符数组模拟竖式乘法，输出精确乘积的十进制字符串（无前导零）。',
    templates: {
      C: `/*
 * 大整数乘法
 * 说明：从标准输入读取两行大整数（字符串形式），使用字符数组模拟竖式乘法，输出乘积的十进制表示（无前导零）。
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

char* multiply(const char* num1, const char* num2) {
  int len1 = strlen(num1);
  int len2 = strlen(num2);
  if ((len1 == 1 && num1[0] == '0') || (len2 == 1 && num2[0] == '0')) {
    char* result = malloc(2);
    strcpy(result, "0");
    return result;
  }
  int max_len = len1 + len2;
  int* res = calloc(max_len, sizeof(int));
  for (int i = 0; i < len1; i++) {
    for (int j = 0; j < len2; j++) {
      int mul = (num1[i] - '0') * (num2[j] - '0');
      int pos = (len1 - 1 - i) + (len2 - 1 - j);
      res[pos] += mul;
    }
  }
  int carry = 0;
  for (int k = 0; k < max_len; k++) {
    int sum = res[k] + carry;
    res[k] = sum % 10;
    carry = sum / 10;
  }
  int end = max_len - 1;
  while (end >= 0 && res[end] == 0) end--;
  if (end < 0) {
    free(res);
    char* result = malloc(2);
    strcpy(result, "0");
    return result;
  }
  int result_len = end + 1;
  char* result = malloc(result_len + 1);
  for (int k = 0; k < result_len; k++) {
    result[k] = res[end - k] + '0';
  }
  result[result_len] = '\0';
  free(res);
  return result;
}

int main(void) {
  char num1[1001];
  char num2[1001];
  if (fgets(num1, sizeof(num1), stdin) == NULL) return 1;
  if (fgets(num2, sizeof(num2), stdin) == NULL) return 1;
  num1[strcspn(num1, "\n")] = '\0';
  num2[strcspn(num2, "\n")] = '\0';
  char* result = multiply(num1, num2);
  printf("%s\n", result);
  free(result);
  return 0;
}
`,
      'C++': `#include <bits/stdc++.h>
using namespace std;

string multiply(const string &a, const string &b) {
  if (a == "0" || b == "0") return "0";
  vector<int> res(a.size() + b.size());
  for (int i = a.size() - 1; i >= 0; --i) {
    for (int j = b.size() - 1; j >= 0; --j) {
      res[a.size() - 1 - i + b.size() - 1 - j] += (a[i] - '0') * (b[j] - '0');
    }
  }
  int carry = 0;
  for (int k = 0; k < (int)res.size(); ++k) {
    int sum = res[k] + carry;
    res[k] = sum % 10;
    carry = sum / 10;
  }
  while (res.size() > 1 && res.back() == 0) res.pop_back();
  string result;
  for (int i = res.size() - 1; i >= 0; --i) result.push_back('0' + res[i]);
  return result;
}

int main() {
  string a, b;
  if (!getline(cin, a)) return 1;
  if (!getline(cin, b)) return 1;
  cout << multiply(a, b) << '\n';
  return 0;
}
`,
      Java: `import java.math.BigInteger;
import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner scanner = new Scanner(System.in);
    String a = scanner.nextLine().trim();
    String b = scanner.nextLine().trim();
    BigInteger result = new BigInteger(a).multiply(new BigInteger(b));
    System.out.println(result);
  }
}
`,
      Python: `a = input().strip()
b = input().strip()
print(int(a) * int(b))
`,
      JavaScript: `const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const lines = [];
rl.on('line', line => {
  lines.push(line.trim());
  if (lines.length >= 2) {
    const a = BigInt(lines[0]);
    const b = BigInt(lines[1]);
    console.log((a * b).toString());
    rl.close();
  }
});
`,
      Go: `package main

import (
  "bufio"
  "fmt"
  "math/big"
  "os"
  "strings"
)

func main() {
  reader := bufio.NewReader(os.Stdin)
  a, _ := reader.ReadString('\n')
  b, _ := reader.ReadString('\n')
  a = strings.TrimSpace(a)
  b = strings.TrimSpace(b)
  x := new(big.Int)
  y := new(big.Int)
  x.SetString(a, 10)
  y.SetString(b, 10)
  fmt.Println(new(big.Int).Mul(x, y))
}
`,
      Rust: `use std::io::{self, BufRead};

fn multiply(a: &str, b: &str) -> String {
    let len1 = a.len();
    let len2 = b.len();
    let mut res = vec![0; len1 + len2];
    for (i, ca) in a.chars().rev().enumerate() {
        for (j, cb) in b.chars().rev().enumerate() {
            if let (Some(da), Some(db)) = (ca.to_digit(10), cb.to_digit(10)) {
                res[i + j] += (da * db) as usize;
            }
        }
    }
    let mut carry = 0;
    for x in res.iter_mut() {
        *x += carry;
        carry = *x / 10;
        *x %= 10;
    }
    while res.len() > 1 && *res.last().unwrap() == 0 {
        res.pop();
    }
    res.iter().rev().map(|d| char::from_digit(*d as u32, 10).unwrap()).collect()
}

fn main() {
    let stdin = io::stdin();
    let mut lines = stdin.lock().lines();
    let a = lines.next().unwrap().unwrap();
    let b = lines.next().unwrap().unwrap();
    println!("{}", multiply(a.trim(), b.trim()));
}
`
    },
    sampleIn: '123\n456',
    sampleOut: '56088\n'
  },
  {
    id: 'sum-array',
    title: '数组求和',
    desc: '读取 n，接着读取 n 个整数，输出它们的和。',
    templates: {
      C: `/*
 * 数组求和
 * 说明：读取整数 n，然后读取 n 个整数，输出它们的和。
 */
#include <stdio.h>
int main(void) {
  int n;
  if (scanf("%d", &n) != 1) return 1;
  long long s = 0;
  for (int i = 0; i < n; i++) {
    int x;
    if (scanf("%d", &x) != 1) return 1;
    s += x;
  }
  printf("%lld\n", s);
  return 0;
}
`,
      'C++': `#include <bits/stdc++.h>
using namespace std;
int main() {
  int n;
  if (!(cin >> n)) return 1;
  long long sum = 0;
  for (int i = 0; i < n; i++) {
    int x;
    cin >> x;
    sum += x;
  }
  cout << sum << '\n';
  return 0;
}
`,
      Java: `import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    Scanner scanner = new Scanner(System.in);
    int n = scanner.nextInt();
    long sum = 0;
    for (int i = 0; i < n; i++) {
      sum += scanner.nextInt();
    }
    System.out.println(sum);
  }
}
`,
      Python: `n = int(input().strip())
print(sum(int(x) for x in input().split()))
`,
      JavaScript: `const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let data = [];
rl.on('line', line => {
  data.push(...line.trim().split(/\s+/));
  if (data.length >= 1) {
    const n = parseInt(data.shift(), 10);
    if (data.length >= n) {
      const sum = data.slice(0, n).reduce((acc, cur) => acc + Number(cur), 0);
      console.log(sum);
      rl.close();
    }
  }
});
`,
      Go: `package main

import (
  "bufio"
  "fmt"
  "os"
  "strconv"
  "strings"
)

func main() {
  reader := bufio.NewReader(os.Stdin)
  line, _ := reader.ReadString('\n')
  n, _ := strconv.Atoi(strings.TrimSpace(line))
  line, _ = reader.ReadString('\n')
  parts := strings.Fields(line)
  sum := 0
  for i := 0; i < n && i < len(parts); i++ {
    x, _ := strconv.Atoi(parts[i])
    sum += x
  }
  fmt.Println(sum)
}
`,
      Rust: `use std::io::{self, BufRead};

fn main() {
    let stdin = io::stdin();
    let mut lines = stdin.lock().lines();
    let n: usize = lines.next().unwrap().unwrap().trim().parse().unwrap();
    let numbers: Vec<i64> = lines
        .next()
        .unwrap()
        .unwrap()
        .split_whitespace()
        .take(n)
        .map(|s| s.parse().unwrap())
        .collect();
    println!("{}", numbers.iter().sum::<i64>());
}
`
    },
    sampleIn: '5\n1 2 3 4 5',
    sampleOut: '15\n'
  }
];

const languages = [
  'C',
  'C++',
  'Java',
  'Python',
  'JavaScript',
  'Go',
  'Rust'
];

const hints = {
  '区间质数': '本次知识点：循环、函数、条件判断、输入输出与边界处理。先实现 is_prime()，再遍历区间并输出质数。保持 a/b 顺序，避免漏掉端点。',
  '大整数乘法': '本次知识点：字符串处理、字符与数字转换、数组模拟乘法、内存管理。用字符数组保存每位结果，按位处理进位，最后去掉前导零。',
  '数组求和': '本次知识点：数组/循环、输入读取、累加求和。先读取 n，然后再次读取每个整数并累加。注意 scanf 返回值判断，防止输入读取失败。'
};

let currentMode = 'teach';
let currentExercise = null;
let currentLanguage = 'C';
let answerVisible = false;
let editor = null;

const codeMirrorModes = {
  'C': 'text/x-csrc',
  'C++': 'text/x-c++src',
  'Java': 'text/x-java',
  'Python': 'python',
  'JavaScript': 'javascript',
  'Go': 'go',
  'Rust': 'rust'
};

const languageExtensions = {
  'C': 'c',
  'C++': 'cpp',
  'Java': 'java',
  'Python': 'py',
  'JavaScript': 'js',
  'Go': 'go',
  'Rust': 'rs'
};

function getExerciseTemplate(ex, lang) {
  if (!ex || !ex.templates) return '';
  return ex.templates[lang] || ex.templates['C'] || '';
}

function getFileExtension(lang) {
  return languageExtensions[lang] || 'c';
}

function getPlaceholderText(lang, createMode = false) {
  const message = createMode
    ? '创造模式：直接开始编写你的代码。'
    : '教学模式：请选择练习后再查看答案。';
  if (lang === 'Python') return `# ${message}`;
  if (lang === 'Java' || lang === 'JavaScript' || lang === 'Go' || lang === 'Rust' || lang === 'C++') return `// ${message}`;
  return `/* ${message} */`;
}

const completions = {
  C: ['int', 'return', 'if', 'else', 'for', 'while', 'break', 'continue', 'switch', 'case', 'default', 'struct', 'typedef', 'enum', 'const', 'static', 'void', 'char', 'float', 'double', 'sizeof', 'malloc', 'free', 'printf', 'scanf'],
  'C++': ['int', 'return', 'if', 'else', 'for', 'while', 'break', 'continue', 'class', 'struct', 'namespace', 'std', 'using', 'auto', 'template', 'typename', 'virtual', 'public', 'private', 'protected', 'new', 'delete', 'cout', 'cin'],
  Java: ['public', 'private', 'protected', 'class', 'interface', 'extends', 'implements', 'static', 'void', 'int', 'boolean', 'String', 'new', 'return', 'if', 'else', 'for', 'while', 'switch', 'case'],
  Python: ['def', 'return', 'if', 'elif', 'else', 'for', 'while', 'import', 'from', 'as', 'class', 'self', 'try', 'except', 'with', 'lambda', 'print', 'range', 'len'],
  JavaScript: ['function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'class', 'new', 'this', 'document', 'window', 'console', 'Array', 'Math'],
  Go: ['package', 'import', 'func', 'var', 'const', 'type', 'struct', 'interface', 'return', 'if', 'else', 'for', 'range', 'go', 'defer', 'map', 'make', 'chan'],
  Rust: ['fn', 'let', 'mut', 'pub', 'struct', 'enum', 'impl', 'trait', 'match', 'if', 'else', 'for', 'while', 'loop', 'return', 'use', 'mod', 'const', 'static']
};

function getCode() {
  return editor ? editor.getValue() : $('#code').value;
}

function setCode(value) {
  if (editor) {
    editor.setValue(value);
  } else {
    $('#code').value = value;
  }
}

function setEditorReadOnly(value) {
  if (editor) {
    editor.setOption('readOnly', value ? 'nocursor' : false);
  } else {
    $('#code').readOnly = !!value;
  }
}

function getEditorMode(lang) {
  return codeMirrorModes[lang] || 'text/x-csrc';
}

function initEditor() {
  const textarea = $('#code');
  editor = CodeMirror.fromTextArea(textarea, {
    mode: getEditorMode(currentLanguage),
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
    if (!answerVisible && currentMode === 'teach' && !currentExercise) {
      setCode('/* 教学模式：请选择练习后再查看答案。*/');
    }
  });
}

function updateEditorMode() {
  if (!editor) return;
  editor.setOption('mode', getEditorMode(currentLanguage));
}

function codeHint(cm) {
  const cursor = cm.getCursor();
  const token = cm.getTokenAt(cursor);
  const start = token.start;
  const end = cursor.ch;
  const curWord = token.string.slice(0, end - start);
  const list = completions[currentLanguage] || [];
  const filtered = list.filter(item => item.startsWith(curWord) || curWord === '');
  return {
    list: filtered.length ? filtered : list,
    from: CodeMirror.Pos(cursor.line, start),
    to: CodeMirror.Pos(cursor.line, end)
  };
}

function $(sel) { return document.querySelector(sel); }

function init() {
  const ul = $('#exercises');
  exercises.forEach(ex => {
    const li = document.createElement('li');
    li.textContent = ex.title;
    li.dataset.id = ex.id;
    li.onclick = () => select(ex.id);
    ul.appendChild(li);
  });

  const langButtons = $('#language-buttons');
  languages.forEach(lang => {
    const btn = document.createElement('button');
    btn.className = 'lang-btn';
    btn.textContent = lang;
    btn.onclick = () => setLanguage(lang);
    langButtons.appendChild(btn);
  });
  setLanguage(currentLanguage);

  $('#download').onclick = downloadCode;
  $('#copy').onclick = copyCode;
  $('#save').onclick = saveCurrentCode;
  $('#refresh-saved').onclick = refreshSavedList;
  $('#show-answer').onclick = toggleAnswerMode;
  $('#hint').onclick = showHint;
  $('#btn-teach').onclick = () => switchMode('teach');
  $('#btn-create').onclick = () => switchMode('create');
  $('#command-submit').onclick = handleCommand;
  $('#command-input').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleCommand();
    }
  });

  initEditor();
  setCode(getPlaceholderText(currentLanguage));
  setEditorReadOnly(true);
  updateModeUI();
  refreshSavedList();
}

function switchMode(mode) {
  currentMode = mode;
  $('#btn-teach').classList.toggle('active', mode === 'teach');
  $('#btn-create').classList.toggle('active', mode === 'create');
  updateModeUI();
  appendConsole(`切换到 ${mode === 'teach' ? '教学模式' : '创造模式'}。输入 help 获取命令。`);
}

function updateModeUI() {
  const hint = $('#hint');
  const exercisePanel = $('#exercise-panel');
  const showAnswerBtn = $('#show-answer');
  if (currentMode === 'teach') {
    hint.style.display = 'inline-block';
    $('#sidebar').querySelector('h2').textContent = '教学模块';
    if (exercisePanel) exercisePanel.style.display = 'block';
    if (currentExercise) {
      showAnswerBtn.style.display = 'inline-block';
    } else {
      showAnswerBtn.style.display = 'none';
    }
    if (!currentExercise) {
      setEditorReadOnly(true);
      setCode(getPlaceholderText(currentLanguage));
    } else if (!answerVisible) {
      setEditorReadOnly(false);
    }
  } else {
    hint.style.display = 'none';
    $('#sidebar').querySelector('h2').textContent = '创造模块';
    if (exercisePanel) exercisePanel.style.display = 'none';
    showAnswerBtn.style.display = 'none';
    currentExercise = null;
    answerVisible = false;
    setEditorReadOnly(false);
    setCode(getPlaceholderText(currentLanguage, true));
    $('#title').textContent = '创造模式';
    $('#desc').textContent = '在创造模式下，右侧即可直接编程，语言可切换。';
    $('#sample-in').textContent = '-';
    $('#sample-out').textContent = '-';
  }
}

function setLanguage(lang) {
  currentLanguage = lang;
  const buttons = document.querySelectorAll('.lang-btn');
  buttons.forEach(b => b.classList.toggle('active', b.textContent === lang));
  updateEditorMode();
  if (!currentExercise) {
    setCode(getPlaceholderText(currentLanguage, currentMode === 'create'));
  } else if (answerVisible) {
    setCode(getExerciseTemplate(currentExercise, currentLanguage));
  }
  appendConsole(`已切换语言：${lang}。`);
}

function select(id) {
  const ex = exercises.find(e => e.id === id);
  if (!ex) return;
  currentExercise = ex;
  answerVisible = false;
  $('#title').textContent = ex.title;
  $('#desc').textContent = ex.desc;
  $('#sample-in').textContent = ex.sampleIn;
  $('#sample-out').textContent = ex.sampleOut;
  setCode(getPlaceholderText(currentLanguage));
  setEditorReadOnly(false);
  updateShowAnswerButton();
  appendConsole(`已选择练习：${ex.title}。请先思考，再点击“查看参考答案”。`);
}

function downloadCode() {
  const code = getCode();
  const ext = getFileExtension(currentLanguage);
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
  if (!currentExercise) {
    appendConsole('请先选择一个练习，然后点击提示按钮。');
    return;
  }
  appendConsole(`提示：${hints[currentExercise.title] || '本次练习重点是阅读题目，分步完成输入、处理和输出。'}`);
}

function toggleAnswerMode() {
  if (!currentExercise) {
    appendConsole('请先选择一个练习，才能查看参考答案。');
    return;
  }
  answerVisible = !answerVisible;
  const btn = $('#show-answer');
  if (answerVisible) {
    setCode(getExerciseTemplate(currentExercise, currentLanguage));
    setEditorReadOnly(true);
    appendConsole('已显示参考答案，当前只读。点击“退出答案模式”继续编程。');
  } else {
    setCode(getPlaceholderText(currentLanguage));
    setEditorReadOnly(false);
    appendConsole('已退出答案模式，可开始编程。');
  }
  updateShowAnswerButton();
}

function updateShowAnswerButton() {
  const btn = $('#show-answer');
  if (!btn) return;
  if (currentMode !== 'teach' || !currentExercise) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = 'inline-block';
  btn.textContent = answerVisible ? '退出答案模式' : '查看参考答案';
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
      if (currentMode === 'teach') showHint();
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
    const res = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, language: currentLanguage }),
    });
    const data = await res.json();
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
  if (currentMode === 'teach' && !currentExercise) {
    appendConsole('请先选择一个练习，然后再运行。');
    return;
  }
  const code = getCode();
  appendConsole('正在编译并运行，请稍候...');
  try {
    const stdin = inputText || (currentExercise ? currentExercise.sampleIn : '');
    const res = await fetch('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, stdin, language: currentLanguage }),
    });
    const data = await res.json();
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

function lintCode(code) {
  const issues = [];
  const stack = [];
  const lines = code.split('\n');
  let inString = false;
  let stringChar = '';
  let inComment = false;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    let i = 0;
    while (i < line.length) {
      const char = line[i];
      const nextChar = line[i + 1];
      if (inComment) {
        if (char === '*' && nextChar === '/') {
          inComment = false;
          i += 2;
          continue;
        }
        i++;
        continue;
      }
      if (inString) {
        if (char === '\\') {
          i += 2;
          continue;
        }
        if (char === stringChar) {
          inString = false;
          stringChar = '';
        }
        i++;
        continue;
      }
      if (char === '/' && nextChar === '*') {
        inComment = true;
        i += 2;
        continue;
      }
      if (char === '/' && nextChar === '/') break;
      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
        i++;
        continue;
      }
      if (['(', '[', '{'].includes(char)) {
        stack.push({ char, line: index + 1 });
      }
      if ([')', ']', '}'].includes(char)) {
        const match = { ')': '(', ']': '[', '}': '{' }[char];
        const last = stack[stack.length - 1];
        if (!last || last.char !== match) {
          issues.push({ line: index + 1, msg: `未匹配的 '${char}'` });
        } else {
          stack.pop();
        }
      }
      i += 1;
    }

    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
      const ends = [';', '{', '}', ')'];
      const blackList = ['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'struct', 'typedef', 'enum'];
      const isControl = blackList.some(word => trimmed.startsWith(word + ' ') || trimmed.startsWith(word + '(') || trimmed === word);
      if (!ends.some(end => trimmed.endsWith(end)) && !isControl) {
        issues.push({ line: index + 1, msg: '可能缺少分号或语句未闭合。' });
      }
    }

    if (/scanf\s*\(.*\)/.test(line) && !/&\w+/.test(line)) {
      issues.push({ line: index + 1, msg: 'scanf 可能缺少 & 符号，请检查输入参数。' });
    }
  });

  if (inComment) {
    issues.push({ line: lines.length, msg: '注释块未闭合。' });
  }
  if (inString) {
    issues.push({ line: lines.length, msg: '字符串或字符常量未闭合。' });
  }
  while (stack.length) {
    const item = stack.pop();
    issues.push({ line: item.line, msg: `未匹配的 '${item.char}'` });
  }
  return issues;
}

function appendConsole(text) {
  const output = $('#console-output');
  const line = document.createElement('div');
  line.textContent = text;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

async function saveCurrentCode() {
  if (!currentExercise && currentMode === 'teach') {
    appendConsole('请先选择一个练习，然后再保存代码。');
    return;
  }
  const code = getCode();
  appendConsole('正在保存代码，请稍候...');
  try {
    const title = currentExercise ? currentExercise.title : '创造模式代码';
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        language: currentLanguage,
        code,
      }),
    });
    const data = await res.json();
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
    const res = await fetch('/api/list');
    const data = await res.json();
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
    const res = await fetch(`/api/snippet?id=${encodeURIComponent(id)}`);
    const data = await res.json();
    if (!data.success) {
      appendConsole(`加载失败：${data.error || '未知错误'}`);
      return;
    }
    const snippet = data.snippet;
    currentLanguage = snippet.language || currentLanguage;
    setLanguage(currentLanguage);
    setCode(snippet.code);
    $('#title').textContent = snippet.title;
    $('#desc').textContent = `已保存代码：${snippet.title}`;
    appendConsole(`已加载保存代码 ID=${snippet.id}。`);
  } catch (error) {
    appendConsole(`加载失败：${error.message}`);
  }
}

window.addEventListener('DOMContentLoaded', init);
