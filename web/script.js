const exercises = [
  {
    id: 'primes-range',
    title: '区间质数',
    desc: '提示输入两个整数，并打印它们之间（含端点）的所有质数。',
    template: `/*
   * 区间质数程序
   * 说明：提示用户输入两个整数，输出区间内（包含端点）的所有质数。
   */
  #include <stdio.h>
  #include <stdbool.h>

  bool is_prime(int n){
    if(n<=1) return false;
    if(n==2) return true;
    if(n%2==0) return false;
    for(int i=3;i*i<=n;i+=2) if(n%i==0) return false;
    return true;
  }

  int main(void){
    int a,b;
    if(scanf("%d %d", &a, &b)!=2) return 1;
    if(a>b){int t=a;a=b;b=t;}
    for(int n=a;n<=b;n++) if(is_prime(n)) printf("%d\n", n);
    return 0;
  }
  `,
    sampleIn: '10 30',
    sampleOut: '11\n13\n17\n19\n23\n29\n'
  },
    {
    id: 'big-multiply',
    title: '大整数乘法',
    desc: '读取两行大整数（字符串形式），使用字符数组模拟竖式乘法，输出精确乘积的十进制字符串（无前导零）。',
    template: `/*
 * 大整数乘法
 * 说明：从标准输入读取两行大整数（字符串形式），使用字符数组模拟竖式乘法，输出乘积的十进制表示（无前导零）。
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

char* multiply(char* num1, char* num2) {
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
    for (int k = 0; k <= end; k++) {
      result[k] = res[end - k] + '0';
    }
    result[result_len] = '\0';
    free(res);
    return result;
  }

  int main() {
    char num1[1001];
    char num2[1001];
    if (fgets(num1, sizeof(num1), stdin) == NULL) return 1;
    if (fgets(num2, sizeof(num2), stdin) == NULL) return 1;
    num1[strcspn(num1, "\n")] = '\0';
    num2[strcspn(num2, "\n")] = '\0';
    for (int i = 0; num1[i]; i++) if (num1[i] < '0' || num1[i] > '9') { printf("输入错误：只允许数字\n"); return 1; }
    for (int i = 0; num2[i]; i++) if (num2[i] < '0' || num2[i] > '9') { printf("输入错误：只允许数字\n"); return 1; }
    char* result = multiply(num1, num2);
    printf("%s\n", result);
    free(result);
    return 0;
  }
  `,
    sampleIn: '123\n456',
    sampleOut: '56088\n'
    },
  {
    id: 'sum-array',
    title: '数组求和',
    desc: '读取 n，接着读取 n 个整数，输出它们的和。',
    template: `/*
 * 数组求和
 * 说明：读取整数 n，然后读取 n 个整数，输出它们的和。
 */
#include <stdio.h>
int main(){
  int n; if(scanf("%d", &n)!=1) return 1;
  long long s=0; for(int i=0;i<n;i++){int x; scanf("%d", &x); s+=x;} 
  printf("%lld\n", s); return 0; }
`,
    sampleIn: '5\n1 2 3 4 5',
    sampleOut: '15\n'
  }
];

function $(sel){return document.querySelector(sel)}
function init(){
  const ul = $('#exercises');
  exercises.forEach(ex=>{
    const li = document.createElement('li'); li.textContent=ex.title; li.dataset.id=ex.id;
    li.onclick=()=>select(ex.id); ul.appendChild(li);
  });

  $('#download').onclick = downloadCode;
  $('#copy').onclick = copyCode;
  $('#code').value = '/* 从左侧选择练习以加载模板 */';
}

function select(id){
  const ex = exercises.find(e=>e.id===id); if(!ex) return;
  $('#title').textContent = ex.title;
  $('#desc').textContent = ex.desc;
  $('#sample-in').textContent = ex.sampleIn;
  $('#sample-out').textContent = ex.sampleOut;
  $('#code').value = ex.template;
}

function downloadCode(){
  const code = $('#code').value; const blob = new Blob([code], {type:'text/plain'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'exercise.c'; document.body.appendChild(a); a.click(); a.remove();
}

function copyCode(){
  navigator.clipboard.writeText($('#code').value).then(()=>alert('已复制到剪贴板'))
}

window.addEventListener('DOMContentLoaded', init);
