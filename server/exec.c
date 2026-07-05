#define _POSIX_C_SOURCE 200809L
#include "exec.h"
#include "utils.h"
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/wait.h>
#include <sys/types.h>
#include <signal.h>
#include <stdio.h>
#include <errno.h>
#include <time.h>

int run_process(const char *cwd, char *const argv[], const char *stdin_text, Str *stdout_out, Str *stderr_out, int timeout_sec, int *exit_code) {
  // 在受限目录 cwd 中运行命令 argv（以 execvp 调用），可向子进程写入 stdin_text。
  // stdout_out / stderr_out 返回子进程输出（由 read_pipe_all 分配），调用者负责 free。
  // timeout_sec 为超时时间（秒），超时会发送 SIGKILL。exit_code 返回子进程退出码。
  // 返回 0 表示成功（即已收集输出），非 0 表示内部错误（如 fork/pipe 失败）。
  int out_pipe[2], err_pipe[2], in_pipe[2];
  if (pipe(out_pipe)!=0||pipe(err_pipe)!=0||pipe(in_pipe)!=0) return -1;
  pid_t pid = fork();
  if (pid<0) return -1;
  if (pid==0) {
    if (chdir(cwd)!=0) _exit(127);
    dup2(in_pipe[0], STDIN_FILENO);
    dup2(out_pipe[1], STDOUT_FILENO);
    dup2(err_pipe[1], STDERR_FILENO);
    close(in_pipe[1]); close(out_pipe[0]); close(err_pipe[0]);
    execvp(argv[0], argv);
    _exit(127);
  }
  close(in_pipe[0]);
  close(out_pipe[1]);
  close(err_pipe[1]);

  if (stdin_text && *stdin_text) {
    write(in_pipe[1], stdin_text, strlen(stdin_text));
  }
  close(in_pipe[1]);

  time_t start = time(NULL);
  int status = 0;
  while (waitpid(pid, &status, WNOHANG) == 0) {
    if (time(NULL) - start > timeout_sec) {
      kill(pid, SIGKILL);
      waitpid(pid, &status, 0);
      break;
    }
    struct timespec ts = {0, 20 * 1000 * 1000};
    nanosleep(&ts, NULL);
  }

  *stdout_out = read_pipe_all(out_pipe[0]);
  *stderr_out = read_pipe_all(err_pipe[0]);
  close(out_pipe[0]);
  close(err_pipe[0]);

  if (WIFEXITED(status))
    *exit_code = WEXITSTATUS(status);
  else
    *exit_code = 1;
  return 0;
}

Str read_pipe_all(int fd) {
  // 从文件描述符读取直到 EOF 或超出限制，返回包含数据的 Str（malloc 分配）。
  // 注意：读取到的数据长度受 MAX_CMD_OUTPUT 限制。
  Str out = {NULL, 0};
  size_t cap = 4096;
  out.ptr = malloc(cap);
  if (!out.ptr)
    return out;

  for (;;) {
    if (out.len + 2048 + 1 > cap) {
      size_t ncap = cap * 2;
      char *np = realloc(out.ptr, ncap);
      if (!np) {
        free(out.ptr);
        out.ptr = NULL;
        out.len = 0;
        return out;
      }
      out.ptr = np;
      cap = ncap;
    }

    ssize_t n = read(fd, out.ptr + out.len, cap - out.len - 1);
    if (n > 0) {
      out.len += (size_t)n;
      if (out.len > MAX_CMD_OUTPUT)
        break;
      continue;
    }
    if (n == 0) {
      break;
    }
    if (errno == EINTR) {
      continue;
    }
    break;
  }

  out.ptr[out.len] = '\0';
  return out;
}
