export const exercises = [
  {
    id: 'primes-range',
    title: '区间质数',
    desc: '提示输入两个整数，并打印它们之间（含端点）的所有质数。',
    templates: {
      C: `#include <stdio.h>
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
  scanf("%d %d", &a, &b);
  if (a > b) { int t = a; a = b; b = t; }
  for (int n = a; n <= b; n++) {
    if (is_prime(n)) printf("%d\\n", n);
  }
}
`,

      'C++': `#include <iostream>
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
  cin >> a >> b;
  if (a > b) swap(a, b);
  for (int n = a; n <= b; n++) {
    if (is_prime(n)) cout << n << "\\n";
  }
}
`,

      Python: `def is_prime(n):
    if n <= 1:
        return False
    for i in range(2, int(n**0.5)+1):
        if n % i == 0:
            return False
    return True

a, b = map(int, input().split())
if a > b:
    a, b = b, a

for n in range(a, b+1):
    if is_prime(n):
        print(n)
`,

      JavaScript: `const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });

let nums = [];
rl.on('line', line => {
  nums.push(...line.trim().split(/\\s+/).map(Number));
  if (nums.length >= 2) {
    let [a, b] = nums;
    if (a > b) [a, b] = [b, a];

    for (let n = a; n <= b; n++) {
      if (isPrime(n)) console.log(n);
    }
    rl.close();
  }
});

function isPrime(n) {
  if (n <= 1) return false;
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false;
  }
  return true;
}
`,
    },

    sampleIn: '10 30',
    sampleOut: '11\n13\n17\n19\n23\n29'
  }
];