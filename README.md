# 校服生产管理小程序

基于微信云开发的校服生产管理小程序，包含原材料管理、裁剪管理、车间管理、成品管理四大模块。

## 项目结构

```
.
├── app.js                 # 小程序入口
├── app.json               # 全局配置
├── app.wxss               # 全局样式
├── project.config.json    # 项目配置
├── sitemap.json          # SEO配置
├── cloudfunctions/        # 云函数（后端）
│   ├── auth/             # 认证模块
│   │   ├── login/        # 登录
│   │   └── getUserInfo/  # 获取用户信息
│   ├── employee/          # 员工管理
│   ├── supplier/          # 供应商管理
│   ├── raw/              # 原材料管理
│   ├── option/           # 系统选项管理
│   ├── cutting/          # 裁剪管理
│   ├── workshop/          # 车间管理
│   ├── finished/         # 成品管理
│   ├── notification/      # 消息通知
│   └── boss/             # 老板模块
├── pages/                 # 页面
│   ├── login/            # 登录页
│   ├── index/            # 首页
│   ├── raw/              # 原材料管理
│   ├── cutting/          # 裁剪管理
│   ├── workshop/          # 车间管理
│   ├── finished/         # 成品管理
│   ├── boss/             # 老板模块
│   └── notification/      # 消息通知
├── utils/                 # 工具函数
│   ├── request.js        # 云函数调用封装
│   └── util.js           # 通用工具函数
└── docs/                  # 文档
    └── 数据库初始化说明.md
```

## 快速开始

### 1. 配置云开发环境

在 `app.js` 中已配置：

```javascript
wx.cloud.init({
  env: 'cloud1-d1gyhaxtu1321e4be', // 微信云开发环境ID
  traceUser: true,
});
```

> 腾讯云主账号ID: 100048570129

### 2. 初始化数据库

按照 `docs/数据库初始化说明.md` 中的步骤：
- 创建15个数据库集合
- 创建索引
- 初始化管理员账号

### 3. 部署云函数

在微信开发者工具中：
1. 右键 `cloudfunctions` 文件夹
2. 选择「上传并部署：云端安装依赖」
3. 等待部署完成

### 4. 修改管理员密码

登录后进入「员工管理」，找到老板账号，点击编辑修改密码。

## 功能模块

| 模块 | 说明 | 角色 |
|------|------|------|
| 原材料管理 | 入库、出库、库存查询 | 原材料/裁剪/车间管理员 |
| 裁剪管理 | 来料确认、裁剪加工 | 裁剪管理员 |
| 车间管理 | 辅料确认、加工登记 | 车间管理员 |
| 成品管理 | 确认入库、库存、出库 | 成品管理员 |
| 老板模块 | 数据总览、员工管理、订单查询 | 老板 |

## 技术栈

- **前端**：原生微信小程序（MINA框架）
- **后端**：微信云开发（云函数）
- **数据库**：微信云数据库（NoSQL）
- **存储**：微信云存储

## 开发说明

### 云函数开发规范

每个云函数包含：
- `index.js` - 主入口文件
- `package.json` - 依赖配置

### 通用响应格式

```javascript
return {
  success: true,
  data: {},
  error: null
};
```

### 调用云函数

```javascript
const { callCloud } = require('../utils/request.js');

callCloud('module-function', { key: value })
  .then(data => {
    // 处理返回数据
  })
  .catch(err => {
    // 处理错误
  });
```

### 注意事项

1. **appid 配置**：`project.config.json` 中已配置为 `wx100048570129`
2. **云开发环境ID**：`app.js` 中已配置为 `cloud1-d1gyhaxtu1321e4be`

- 第1~3周：基础支撑层（登录、员工管理、原材料管理）
- 第4~6周：核心业务层（裁剪管理、车间管理）
- 第7~9周：核心业务层（成品管理、通知推送）
- 第10~12周：管理决策层（老板模块、数据看板）

## 注意事项

1. **appid 配置**：请在 `project.config.json` 中替换为实际的 appid
2. **密码安全**：生产环境请使用强密码，并定期更换
3. **配额监控**：免费版每日1000次云函数调用，超出需升级
4. **数据备份**：重要数据建议定期导出备份
