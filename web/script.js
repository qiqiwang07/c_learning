const exercises = [
  {
    id: 'primes-range',
    title: '区间质数',
    desc: '提示输入两个整数，并打印它们之间（含端点）的所有质数。',
    template: `#include <stdio.h>
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
    id: 'sum-array',
    title: '数组求和',
    desc: '读取 n，接着读取 n 个整数，输出它们的和。',
    template: `#include <stdio.h>
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
