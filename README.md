# Kaodiantong 考点通 V1.0（独立 PWA）

一款**纯前端、零后端**的刷题小程序：导入考研 / 考公 / 高考 / 医学等任意科目的题库文档（TXT / CSV / PDF），
即可刷题、统计进度、乱序重刷、错题本，并接入**你自带的**大模型（豆包 / DeepSeek / 通义千问 / Kimi / 智谱 等兼容接口）
做考频分析与押题讲解。

- 数据**全部存在本机**（IndexedDB），不上传任何服务器，隐私安全。
- 可「添加到主屏幕」当 App 用，离线也能刷。
- 本目录即为**完整可部署站点**，无需构建、无需 npm。

---

## 一、本地预览（不部署也能用）

```bash
cd exam-drill
python -m http.server 8137
# 浏览器打开 http://127.0.0.1:8137
```

> 手机同 WiFi 可访问 `http://<你电脑IP>:8137`，体验后「添加到主屏幕」即可当 App。

---

## 二、部署到静态托管（任选其一）

本应用是纯静态文件，只要有静态托管即可，AI 走你自己的 Key，无需服务器。

### 方案 A：GitHub Pages（免费）
1. 新建一个仓库（如 `kaodiantong`）。
2. 把本目录 `exam-drill/` 下的**全部文件**推到仓库根目录（`index.html` 必须在根）。
3. 仓库 **Settings → Pages → Source** 选 `main` 分支、`/ (root)` 目录，保存。
4. 几分钟後访问 `https://<用户名>.github.io/kaodiantong/`。
   - 因采用 `#` 哈希路由 + 相对路径资源，**子目录部署无需任何额外配置**。
   - 如需避免 GitHub 的特殊处理，可在根目录放一个空文件 `.nojekyll`。

### 方案 B：Vercel / Netlify（免费、最快）
- **Vercel**：导入仓库 → Framework 选 `Other` → Build Command 留空 → Output Directory 填 `.`（根）→ Deploy。
- **Netlify**：拖拽本目录到 Netlify Drop，或连接仓库 → Build command 留空 → Publish directory 填 `.`。

### 方案 C：Cloudflare Pages（免费）
- 连接仓库 → Build command / Build output directory 均留空（纯静态）→ 部署。
- 之后在域名设置里绑定自己的域名（可选）。

> 部署後建议用手机打开一次，点浏览器菜单「添加到主屏幕」，即可获得近似原生 App 的体验（含离线缓存）。

---

## 三、配置 AI 考点分析（关键一步）

AI 功能**直连你自填的大模型接口**，平台不存你的 Key、不上传题库内容（仅把「题目+答案」文本发给你配置的接口）。

1. 打开 App → 底部「我的」→「AI 设置」。
2. 点任一**一键预设**快速填入，或手动填写：
   - **接口地址**（兼容 `/chat/completions` 协议）：
     - 豆包（火山方舟）：`https://ark.cn-beijing.volces.com/api/v3/chat/completions`（模型填你在方舟开通的模型 ID，或推理接入点 `ep-...`）
     - DeepSeek：`https://api.deepseek.com/chat/completions`（模型 `deepseek-chat`）
     - 通义千问：`https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`（模型 `qwen-plus`）
     - Kimi：`https://api.moonshot.cn/v1/chat/completions`（模型 `moonshot-v1-8k`）
     - 智谱 GLM：`https://open.bigmodel.cn/api/paas/v4/chat/completions`（模型 `glm-4-flash`）
   - **API Key**：对应平台申请的密钥（仅存本机 `meta` 库，不上传）。
   - **模型名**：见上方各平台默认值。
3. 保存後，在任意题目详情页点「AI 考点分析」即可使用。

> 提示：若你单位/学校有自建的兼容网关，直接填其地址与模型即可，完全可控。

---

## 四、导入题库格式

- **TXT（编号式）**：
  ```
  1. 题目内容……？
  答案：要点一；要点二。
  2. 另一题？
  答案：……
  ```
  也支持 `问：…… 答：……` 成对写法。
- **CSV**：至少含 `题目`、`答案` 两列（可加 `分类`、`选项` 列）。
- **PDF**：自动抽取正文文本后按上述规则解析（首次使用需联网加载 pdf.js，之后可缓存）。

导入入口：底部「题库」→ 右上「导入」。

---

## 五、数据备份与恢复

「我的 → 数据备份与恢复」可把全部题库 + 刷题进度导出一个 JSON 文件，
换手机或清缓存前建议先备份；恢复时选中该文件即可。

---

## 六、目录结构

```
exam-drill/
├── index.html              # 入口（已移除外部 CDN 依赖，完全自包含）
├── app.js                  # 路由与全部页面逻辑（题库/导入/刷题/AI/设置）
├── db.js                   # IndexedDB 本地存储封装
├── seed.js                 # 示例题库（药理学/有机化学/考研政治，证明任意科目可用，可删除）
├── cloud.js                # 纯离线占位层（云端同步为后续付费功能，当前全部本机完成）
├── cloud-config.js         # 云配置（当前为 null）
├── sw.js                   # Service Worker（联网优先 + 离线回退缓存）
├── manifest.webmanifest    # PWA 清单
├── styles.css              # 样式（移动优先）
└── assets/                 # 应用图标（192/512/maskable）
```

---

## 七、已知说明与后续

- **PDF 导入**：依赖公共 CDN 上的 pdf.js，首次解析需联网；如需完全离线，可把 pdf.js 下载到 `assets/` 并改 `app.js` 中 `loadPdfJs()` 的引用路径。
- **云端同步（多设备）**：当前为纯离线版，列为后续付费功能；启用时只需用官方云 SDK 覆盖 `window.Cloud` 并在 `cloud-config.js` 填入配置。
- **版权与署名**：软件开发 苏裕盛 教授/医学博士；创意发想 叶桢 同学；支持单位 宁德师范学院医学院。如需改动署名请先沟通。
