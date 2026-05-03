#include <stdbool.h>
#include <stdio.h>

/*
 * is_prime - 判断 n 是否为质数
 * @n: 要测试的整数
 *
 * 返回 true 表示是质数，false 表示不是质数。
 */
bool is_prime(int n)
{
    if (n <= 1)
        return false;

    if (n == 2)
        return true;

    if (n % 2 == 0)
        return false;

    /* 只需要检查到 sqrt(n)，因此用 i * i <= n */
    for (int i = 3; i * i <= n; i += 2) {
        if (n % i == 0)
            return false;
    }

    return true;
}

int main(void)
{
    int a, b;
    int found = 0;

    printf("Enter two integers: ");

    /* 输入验证，确保用户输入了两个整数 */
    if (scanf("%d %d", &a, &b) != 2) {
        printf("输入错误\n");
        return 1;
    }

    /* 如果 a 大于 b，则交换，保证区间 [a, b] 是升序 */
    if (a > b) {
        int tmp = a;

        a = b;
        b = tmp;
    }

    printf("Primes between %d and %d:\n", a, b);

    for (int n = a; n <= b; n++) {
        if (is_prime(n)) {
            printf("%d ", n);
            found = 1;
        }
    }

    if (!found)
        printf("(none)");

    printf("\n");
    return 0;
}
