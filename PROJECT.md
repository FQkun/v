# 稳阳视频播放器项目

## 项目目标
纯前端、本地文件夹导入的沉浸式短视频播放器（PWA），部署于 v.136852.xyz。

## 目录
- `v.136852.xyz/`：站点源码（index.html + css/ + js/）
  - `js/app.js`：VideoPlayer 主类（播放列表、导航、渲染、视频挂载）
  - `js/gestures.js`：触摸/鼠标/键盘/滚轮手势
  - `js/ui.js`：侧边栏、搜索、标签过滤、弹窗、service worker 注册
  - `js/video-source.js`：objectURL 加载/释放、相邻视频预加载
  - `js/preferences.js`：localStorage 偏好
  - `js/toast.js`：轻提示
  - `service-worker.js`：离线缓存

## 核心机制
- 视频来自 `webkitdirectory` 选择或拖拽，文件名格式 `[id][作者][标题][日期].mp4`。
- `videos` 存原始视频数组；`baseOrder` 存随机/顺序播放基线；`playbackOrder` 为当前实际播放序列（标签过滤/搜索结果时会替换）。
- 页面采用绝对定位 + `translate3d` 的虚拟翻页：只挂载当前及相邻 1 个视频，离屏超过 1 页即卸载并释放 objectURL。
- 每页高度 = `videoScrollContainer.clientHeight`（视频页已改为满高，不再扣除安全区）。
- 声音：画面视频始终静音；全局仅一个隐藏 `<audio>` 音频引擎，跨视频复用只换 `src`，以规避移动端连续新建媒体元素被自动禁音，同时避免重复解码拖慢滑动。

## 长期约束
- 不引入构建工具与第三方库，保持单文件脚本按顺序加载。
- 所有改动需同步更新 TASKS.md / DECISIONS.md / TROUBLESHOOTING.md。
