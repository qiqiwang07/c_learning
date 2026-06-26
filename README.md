# c_learning

一个用于 C 语言练习的本地 Web 应用，结合前端代码编辑、后端编译运行、用户登录和代码片段存储。

## 主要功能

- 用户注册 / 登录
- 在线编辑 C 代码（支持 C、C++、Python、JavaScript）
- 本地编译语法检查
- 本地实际运行代码并返回输出
- 保存代码片段到 `SQLite` 数据库
- 简易 AI 问答面板（当前为占位实现）

## 目录结构

- `server.py` - 后端 HTTP 服务器，处理静态资源、API、编译、运行、登录、保存
- `web/index.html` - 前端入口页面
- `web/style.css` - 页面样式
- `web/main.js` - 前端应用启动、认证流程
- `web/api.js` - 浏览器端 API 调用封装
- `web/editor.js` - 编辑器初始化和交互逻辑
- `web/ai.js` - AI 问答界面逻辑
- `web/state.js` - 应用状态管理
- `web/ui.js` - 前端 UI 支持代码
- `code_store.db` - 运行时生成的 SQLite 数据库（存储用户和代码片段）

## 运行环境

- Python 3
- `gcc` / `g++`（C/C++ 编译支持）
- 浏览器

## 启动项目

在项目根目录运行：

```bash
python3 server.py
```

然后在浏览器中打开：

```text
http://localhost:7000/
```

页面会加载练习编辑器和登录界面。

## 使用说明

1. 打开页面后先注册或登录。
2. 登录成功后进入练习页面，开始编写代码。
3. 点击“运行”按钮可编译并执行当前代码。
4. 保存后端会将代码片段保存在 `code_store.db` 中。
5. AI 面板当前显示占位内容，可根据需要后续接入真实模型。

## API 说明

后端提供以下主要接口：

- `POST /c_learning/api/register` - 注册用户
- `POST /c_learning/api/login` - 登录用户
- `POST /c_learning/api/logout` - 注销登录
- `GET  /c_learning/api/me` - 查询当前登录状态
- `POST /c_learning/api/check` - 语法检查
- `POST /c_learning/api/compile` - 编译并运行代码
- `POST /c_learning/api/save` - 保存代码片段
- `GET  /c_learning/api/list` - 列出保存的代码片段
- `GET  /c_learning/api/snippet?id=<id>` - 获取指定代码片段
- `POST /c_learning/api/ai` - AI 问答接口（当前为占位实现）

## 备注

- 默认服务器端口为 `7000`。
- 代码片段存储在 `code_store.db`，与应用同级目录。
- 若要接入真实 AI 服务，可参考 `server.py` 中的 `call_deepseek` 函数并替换 `DEEPSEEK_API_KEY`。
