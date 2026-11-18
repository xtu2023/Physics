# v4.3.0 内容与学习证据候选测试结果

本轮执行日期：2026-11-18；工作分支：`fix/v4.3-content-access`。不把 VM/浏览器协议夹具测试写成真机课堂验收。

## 本轮实际执行

| 命令 | 实际结果 |
| --- | --- |
| `node tools/qa_content_access_v430.cjs` | 通过：1,897 道全量备份模式校验；5 道密度题修订；离线草稿学生隔离；教师改分/撤销；4 类理想模型输出与探究引用；766 精确目录匹配、1,131 未核验 |
| `node tools/qa_content_access_browser_v430.cjs` | 通过：390×844、360×800 学生草稿保存后离线重载；真实预测/观察/解释保存；1280×800 教师部分分、改分、撤销和探究反馈；无新增脚本异常 |
| `node tools/qa_activation_ui.cjs` | 通过：无激活桩的学生、教师、Windows 共享入口可启动、离线重载；旧失效码不拦截；教师 PIN 仍未解锁 |
| `node tools/qa_teacher_lock.cjs` | 通过：PBKDF2、冷却/重载/到期恢复、未解锁重设阻断、角色切换门禁 |
| `node tools/qa_encrypted_backup_v401.cjs` | 通过：题目旧修订、草稿、探究和评分历史加密往返；错误密码/篡改/旧明文备份确认路径 |
| `node tools/qa_classroom_ui.cjs` | 通过：三题作业、学生真实答案、教师退回、订正历史；新增回执 HTTP 503 不冒充未交/不新增提交，重试恢复；此测试使用明确的协议夹具，不是真机跨网络验收 |
| `node tools/qa_node.cjs`（构建前） | 内容、权限、迁移、学习证据等已执行项通过；发布门禁因尚无 v4.3.0 源码 ZIP 失败，必须构建后重跑，不降低标准 |
| Android 双包构建 | 通过：学生/教师 versionName 4.3.0、versionCode 40300；32 个共享业务资源逐字节一致 |
| 完整 `npm run qa` | 退出码 0：65 项 Node 脚本及 Android 安全、桌面/手机界面、双角色、内容探究、交互延迟、教师专项、班级作业、免密码加入、桌面一致性全部完成 |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tools/build_release.ps1` | 通过：Windows EXE/ZIP、源码 ZIP；UTF-8 路径与 ZIP 可移植性检查通过；签名状态 NotSigned |
| `server/node_modules/.bin/tsc.cmd -p tsconfig.json --noEmit` | 通过（退出码 0） |
| `server/node_modules/.bin/vitest.cmd run tests/unit` | 17 个文件、74 项通过 |
| `server/node_modules/.bin/tsc.cmd -p tsconfig.build.json` | 通过（退出码 0） |
| `server/node_modules/.bin/vitest.cmd run tests/integration --maxWorkers=1` | 环境阻塞：5 套件在启动 PostgreSQL 容器时失败，`Could not find a working container runtime strategy`；15 项断言未执行，不计通过 |
| `server/node_modules/.bin/vitest.cmd run tests/e2e --maxWorkers=1` | 未验证：仓库没有匹配的 E2E 测试文件，退出码 1；不以单元测试替代 |

服务端本地依赖已存在；`pnpm run` 的供应链检查期间遇到 registry TLS/网络重试，未关闭证书或依赖安全检查。改用同一 `node_modules/.bin` 的现有编译器与测试器执行脚本等价命令。没有修改服务端业务/API 或数据库结构，版本来源同步到 4.3.0。

## 错误与修复区分

- 代码缺陷：切块解法参数、静摩擦条件、缺少独立作答草稿、无评分修订历史、学生回执失败被转换成空提交；均有针对性回归。
- 测试适配：学生简化页隐藏实验室总导航，测试改点实际可见的“用建模画布验证”；探究完成返回模型页后，旧静态断言扩展为同时检查两条合法路径，仍要求先记录、调度复习并保存。班级刷新检查等待请求完成，故障注入只允许预期的单次 503 日志，脚本异常仍失败。
- 发布包问题：构建前缺少新版 ZIP；补丁后曾检出 APK 资源过期。重新构建三端后，完整发布门禁通过，未降低比对标准。
- 环境/未验证：Docker/Podman、Android 真机、物理教师逐题审核、异网服务部署及实际课堂效果。

## 交付状态

本地 v4.3.0 开发候选已生成于 `发布/` 和 `发布/Android/`。旧账号的推送权限问题已由用户重新授权解决，代码已推送 `fix/v4.3-content-access`。发布标签为 `v4.3.0-rc1`，附件上传是否完成以 GitHub Releases 实际文件及 SHA-256 为准。

本机交互测试：学生导航处理最大 57.5ms，教师子页点击返回最大 2.1ms，观察到的教师子页长任务最大 75ms；教师首次内容就绪约 1.43s。这里只反映本次浏览器测试设备，不保证低端真机零卡顿。

## 历史 v4.2.2 基线（不是本版测试结果）

以下记录执行于 2026-11-08，保留作升级前对照，不代替本轮验证。

| 命令/流程 | 实际结果 |
| --- | --- |
| `node tools/qa_content_bank_migration.cjs` | 先用旧安装标记复现跳过课程元数据更新，修复后通过；1,897 道题、1,320 可自动评分、577 待人工评分，原学习笔记保留 |
| `node tools/qa_content_quality_v422.cjs` | 通过；1,416 原创参数题、100 道高二教材册修正、3 个课程单元、5 组补救材料 |
| `node tools/qa_curriculum_mapping.cjs`、`node tools/qa_motion_representation_drafts_v401.cjs` | 通过；错误册别保持 unresolved，四道草稿仍待人工审核 |
| `node tools/content_mapping_report.cjs` | 生成 1,897 道逐题矩阵：内部目录匹配 766，待核验 1,131；可自动评分 1,320，人工评分 577 |
| `powershell -NoProfile -ExecutionPolicy Bypass -File android/tools/build_dual_android.ps1` | 成功生成独立学生、教师 APK；versionName 4.2.2，versionCode 40202 |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tools/build_release.ps1` | 成功生成 Windows 安装程序、ZIP 和标准目录源码 ZIP；安装程序未正式代码签名 |
| `npm run qa` | 退出码 0；64 个 Node 脚本，Android 安全、桌面/手机浏览器、师生界面、数据迁移、交互延迟、班级流程和三端源码一致性检查均完成 |
| `pnpm --dir server run typecheck` | 退出码 0 |
| `pnpm --dir server run test:unit` | 17 个测试文件、74 项通过 |
| `pnpm --dir server run build` | 退出码 0 |
| `git diff --check` | 退出码 0；仅有 Windows 换行符提示 |

## 包与源码边界

- 两个 APK 内 32 个共享业务文件通过 `qa_apk_source_parity_v402.cjs` 与当前源码对比。Windows 构建源与 Android 共用 `index.html` 和业务脚本。
- 构建产物 SHA-256 见 `发布/SHA256SUMS-v4.2.2-rc1.txt`。Windows 安装程序是未签名开发候选；Android 为本机开发签名，不具备正式商店发行保证。
- 本机未安装 Docker，未运行 PostgreSQL/Redis 容器集成测试；服务端仅完成 typecheck、单测和构建。旧版远端 CI 结果不自动视为本次候选通过。
- 未运行真实 Android 设备上的跨设备课堂、升级安装、文件导出取消/中断和长期学习效果验证；教材目录、评分量规与内容科学性仍待教师人工审核。没有学生配平的前后测数据，不计算能力提升。
