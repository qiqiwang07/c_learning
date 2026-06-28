#ifndef EXEC_H
#define EXEC_H

#include "utils.h"

char *compile_only_json(const char *code, const char *language);
char *compile_run_json(const char *code, const char *stdin_text, const char *language);

int run_process(const char *cwd, char *const argv[], const char *stdin_text, Str *stdout_out, Str *stderr_out, int timeout_sec, int *exit_code);

// 从文件描述符读取全部数据并返回 Str
Str read_pipe_all(int fd);

#endif // EXEC_H
