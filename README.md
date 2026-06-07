## C 练习网页

一个用于练习 C 语言的静态网页已加入 `web/` 目录。网页包含练习题列表、可编辑的代码模板，以及下载和复制按钮。可在本地打开 [web/index.html](web/index.html) 使用。

## 本地可编译运行

新增 `server.py`，可以在本地启动一个简单服务：

```bash
python3 server.py
```

然后在浏览器打开：

```text
http://localhost:8000
```

命令行支持：

- `help`
- `check`
- `run`
- `save`
- `list`
- `mode teach`
- `mode create`
- `hint`

页面上也新增了“保存”按钮和“已保存代码”列表。

`check` 通过 `gcc` 本地编译检测语法错误，`run` 会真实编译并执行当前代码。`save` 会把当前代码保存到本地数据库，`list` 会显示已保存的代码片段。

数据库文件为 `code_store.db`，保存在项目根目录。
