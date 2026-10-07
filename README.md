# 师宝宝 · 一本只认识你的魔法书

中文互动生日礼物：古书、双人沙画旅程、照片与信、原版动画角色重编排、星空蛋糕。手机优先，无后端。

## 运行与打包

使用 Node.js 22.12+：

```sh
npm ci
npm run dev
npm run build
```

开发地址为 `/birthday-card/`；`npm run build` 生成可部署的 `dist`，包含类型检查与一次资源检查。`npm run lint` 检查源码。

源码包保留 `src`、`public`、`scripts`、`assets`、`.github`、项目配置、`package.json`、`package-lock.json` 和本说明。排除 `node_modules`、`.git`、`dist`、缓存、诊断目录与私密恢复材料。仅部署网站时使用重新构建的 `dist`。基础路径默认 `/birthday-card/`，自有域名根路径可设置 `VITE_APP_BASE=/` 后构建。

换电脑继续修改美术时，额外带走 `.asset-build/memory-book` 的 `masters`、`film-source`、`masks`、`preview` 和 `wind-and-stars-master.png`。这些本机制作资料被 Git 忽略，重新克隆无法找回。恢复包和 `private-restored` 单独备份。

## 修改入口

- 内容、书信和许愿：[MemoryGift.tsx](src/memory-book/MemoryGift.tsx)
- 照片与电影来源：[media.ts](src/memory-book/media.ts)
- 书和蛋糕：[MagicObject.tsx](src/memory-book/MagicObject.tsx)、[建模脚本](scripts/models/build_magic_objects.py)
- 沙画：[Journey.tsx](src/memory-book/Journey.tsx)
- 电影场景：[Cinema.tsx](src/memory-book/Cinema.tsx)
- 多角度泰迪：[Pets.tsx](src/memory-book/Pets.tsx)
- 母版来源与生成提示词：[素材记录](assets/memory-book-artwork.json)
- 素材来源和许可：[ASSET_SOURCES.md](public/ASSET_SOURCES.md)

照片目前为示意网图，书信为暂拟内容；原书信另存于本机 `masters/letter-original.txt`。她的路线为河南周口、天津、北京中国政法大学、香港科技大学、深圳；他的路线为湖北武汉、南京东南大学、上海交通大学、深圳。不要补造年份、校区或个人经历。

## 发布

[GitHub Pages](https://daidaidebest.github.io/birthday-card/) 由 `main` 的 `.github/workflows/pages.yml` 构建和部署。电影素材的来源与权利信息保留在素材说明中。

当前本机仍是历史分支 `experience/finish-duet`，工作区含新版未提交文件。下一次提交基于最新 `origin/main` 核对当前文件，不直接推旧分支或清空工作区。本机 `.asset-build/memory-book/prepare-release.mjs` 可生成新的发布清单；交接计划、旧发布清单与清理日志已删除。
