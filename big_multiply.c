/*
 * 大整数乘法程序
 * 使用字符数组模拟竖式乘法，实现两个大整数的乘法运算。
 * 输入：两行字符串，每行只包含数字字符，长度不超过1000。
 * 输出：乘积的十进制字符串，无前导零（除非结果为0）。
 * 时间复杂度：O(n*m)，其中n和m为输入字符串长度。
 * 优化建议：可使用Karatsuba算法将复杂度降至O(n^{1.585})。
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * multiply - 计算两个大整数的乘积
 * @num1: 第一个大整数的字符串表示
 * @num2: 第二个大整数的字符串表示
 * 返回值：乘积的字符串表示，调用者负责释放内存
 */
char* multiply(char* num1, char* num2) {
    int len1 = strlen(num1);
    int len2 = strlen(num2);

    // 特殊情况：如果任一数为0，直接返回"0"
    if ((len1 == 1 && num1[0] == '0') || (len2 == 1 && num2[0] == '0')) {
        char* result = malloc(2);
        strcpy(result, "0");
        return result;
    }

    int max_len = len1 + len2;
    int* res = calloc(max_len, sizeof(int));

    // 模拟乘法，从高位到低位
    for (int i = 0; i < len1; i++) {
        for (int j = 0; j < len2; j++) {
            int mul = (num1[i] - '0') * (num2[j] - '0');
            int pos = (len1 - 1 - i) + (len2 - 1 - j);
            res[pos] += mul;
        }
    }

    // 处理进位，从低位到高位
    int carry = 0;
    for (int k = 0; k < max_len; k++) {
        int sum = res[k] + carry;
        res[k] = sum % 10;
        carry = sum / 10;
    }

    // 找到结果的结束位置（最高位）
    int end = max_len - 1;
    while (end >= 0 && res[end] == 0) end--;

    // 如果全为零，返回"0"
    if (end < 0) {
        free(res);
        char* result = malloc(2);
        strcpy(result, "0");
        return result;
    }

    // 构建结果字符串
    int result_len = end + 1;
    char* result = malloc(result_len + 1);
    for (int k = 0; k <= end; k++) {
        result[k] = res[end - k] + '0';
    }
    result[result_len] = '\0';

    free(res);
    return result;
}

/*
 * main - 程序入口
 * 从标准输入读取两个大整数，计算乘积并输出
 */
int main() {
    char num1[1001];
    char num2[1001];

    // 从标准输入读取第一行
    if (fgets(num1, sizeof(num1), stdin) == NULL) {
        return 1;
    }
    // 从标准输入读取第二行
    if (fgets(num2, sizeof(num2), stdin) == NULL) {
        return 1;
    }

    // 去除字符串末尾的换行符
    num1[strcspn(num1, "\n")] = '\0';
    num2[strcspn(num2, "\n")] = '\0';

    // 输入验证：确保只包含数字字符
    for (int i = 0; num1[i]; i++) {
        if (num1[i] < '0' || num1[i] > '9') {
            printf("输入错误：只允许数字\n");
            return 1;
        }
    }
    for (int i = 0; num2[i]; i++) {
        if (num2[i] < '0' || num2[i] > '9') {
            printf("输入错误：只允许数字\n");
            return 1;
        }
    }

    // 计算乘积
    char* result = multiply(num1, num2);
    // 输出结果
    printf("%s\n", result);
    // 释放内存
    free(result);

    return 0;
}