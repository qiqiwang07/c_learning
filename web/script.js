const exercises = [
  {
    id: 'primes-range',
    title: 'Primes in Range',
    desc: 'Prompt user for two integers and print all prime numbers between them (inclusive).',
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
    title: 'Sum of Array',
    desc: 'Read n then n integers, print their sum.',
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
  $('#code').value = '// Select an exercise to load template here.';
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
  navigator.clipboard.writeText($('#code').value).then(()=>alert('Copied to clipboard'))
}

window.addEventListener('DOMContentLoaded', init);
