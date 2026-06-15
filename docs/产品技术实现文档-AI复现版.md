# 校服生产管理小程序 — 产品技术实现文档（AI 复现版）

> 本文档是给"另一个 AI"看的完整复现说明，目标是让 AI 阅读本文档后能：
> 1. 完整理解产品业务、用户角色、权限模型；
> 2. 知道所有云函数接口（入参/返回/权限/事务/状态机）；
> 3. 知道所有页面（路径/UI 元素/绑定的云函数/关键字段）；
> 4. 知道数据库 15 个集合的字段结构、订单编号规则、库存迁移模型；
> 5. 知道状态机流转、库存三库模型（原材料库/车间辅料库/成品库存）、通知触发规则。
>
> 配套源码仓库：当前目录
> 技术栈：微信小程序原生 + 微信云开发（云函数 + 云数据库 + 云存储）
> 微信 AppID：`wx2fa998031f16f532`
> 云开发环境 ID：`cloud1-d1gyhaxtu1321e4be`
> 基础库：`2.25.0`

---

## 0. 目录

- 第 1 章：产品定位
- 第 2 章：用户角色与权限矩阵
- 第 3 章：技术架构
- 第 4 章：数据库设计（15 个集合）
- 第 5 章：订单编号规则
- 第 6 章：库存三库模型与流转
- 第 7 章：状态机汇总
- 第 8 章：通知机制
- 第 9 章：云函数清单（74 个，按模块分组）
- 第 10 章：前端页面清单（38 个）
- 第 11 章：业务流程（按角色 8 条主流程）
- 第 12 章：UI 设计规范
- 第 13 章：老板端数据总览与统计
- 第 14 章：关键不变量与踩坑点
- 第 15 章：默认账号与初始化

---

## 1. 产品定位

### 1.1 一句话定义

校服生产企业的"原材料采购 → 裁剪 → 车间加工 → 成品入库/出库"全流程业务管理系统，面向多人多角色协同场景。

### 1.2 用户群体

| 角色 | 人数 | 关键诉求 |
|---|---|---|
| 老板 | 多人 | 看全局数据、审订单、查统计、管员工、做系统配置 |
| 原材料管理员 | 多人 | 入库/出库原材料、维护供应商、维护物料分类 |
| 裁剪管理员 | 多人 | 收料确认、做裁剪单、维护辅料到车间 |
| 车间管理员 | 多人 | 收辅料、做加工单（实际件数/损耗/辅料用量） |
| 成品管理员 | 多人 | 收加工单、确认入库、看库存、出库 |

UI 原则：员工多 40 岁以上，**大字体、高对比度、扁平、操作步骤少**，按钮高 ≥ 80rpx。

---

## 2. 角色与权限矩阵

### 2.1 角色定义

| Role 字段值（数据库严格一致） | 简称 | 颜色 token |
|---|---|---|
| `老板` | 老板 | gold/boss |
| `原材料管理员` | 原材料 | raw |
| `裁剪管理员` | 裁剪 | cutting |
| `车间管理员` | 车间 | workshop |
| `成品管理员` | 成品 | finished |

> 关键约束：业务管理员"原材料/裁剪/车间/成品"只看到自己模块 + 扩展模块；老板 = 超级管理员，**看所有**。

### 2.2 页面模块可见性

```
老板：      raw / cutting / cutting_add / cutting_record / workshop / workshop_pending /
            workshop_processing / workshop_record / finished_inbound / finished_stock /
            finished_outbound / finished_record / boss
原材料管理员：raw（仅原材料模块）
裁剪管理员： cutting / cutting_add / cutting_record（主）+ raw（扩展，可去领料）
车间管理员： workshop / workshop_pending / workshop_processing / workshop_record（主）+ raw（扩展）
成品管理员： finished_inbound / finished_stock / finished_outbound / finished_record
```

### 2.3 云函数调用白名单

完整映射在 `utils/auth-guard.js`，云函数调用时前端做**第一道校验**（云函数 server 端再校验一次）。

**公开函数**（任何角色都能调，无需登录除外）：
- `auth-login`、`auth-getUserInfo`
- `notification-list`、`notification-markRead`、`notification-unreadCount`
- `option-list`、`option-detail`、`supplier-list`、`employee-list`、`role-list`、`workshop-list`

**老板专属**：
- `employee-add / update / delete / detail`
- `boss-overview / orderList / orderTimeline / finishedStats / warning`
- `order-detail`、`raw-stockInit`
- `init-default-accounts`、`quickstartFunctions`
- `finished-stockRebuildFromHistory`
- `debug-check-*`

**业务管理员按角色**（白名单）：

- 原材料管理员：`supplier-add/update/delete`、`option-update/delete`、`raw-inboundAdd/Cancel/List`、`raw-outboundAdd/Cancel/List`、`raw-stockList/Total`
- 裁剪管理员：裁剪全流程 + `raw-outboundAdd/List`、`raw-inboundAdd/List`、`raw-stockList`、`workshop-list`
- 车间管理员：车间全流程 + 车间辅料 `workshop-stockList` + `raw-outboundAdd/List`、`raw-inboundAdd/List`、`raw-stockList`
- 成品管理员：`finished-confirmList/In/Problem/availableOrderList`、`finished-stockList/Export`、`finished-outboundAdd/List/Detail`、`finished-emergencyRebuildStock`

---

## 3. 技术架构

### 3.1 整体架构

```
┌─────────────────────────┐
│  微信小程序（前端）      │
│  原生 wxml/wxss/js     │
│  - app.js / app.json   │
│  - utils/（封装）      │
│  - pages/（38 个）     │
│  - components/         │
└──────────┬──────────────┘
           │ wx.cloud.callFunction
           ▼
┌─────────────────────────┐
│  微信云开发（后端）       │
│  - 云函数（74 个）       │
│  - 云数据库（15 集合）   │
│  - 云存储（出库/成品照片）│
└─────────────────────────┘
```

### 3.2 关键技术点

1. **统一云函数调用**：`utils/request.js` 的 `callCloud(name, data, showLoading)` 封装
   - `showLoading=true` 自动弹 loading；`showLoading={ silent: true }` 不弹错误 toast
   - 成功时 `res.result.data` 解包后返回（注意：老云函数有时直接返回 `{success:true, data:...}`，新的是 `{success:true, data:xxx}`）
   - 失败 reject 出去

2. **权限两道防线**：
   - 前端：`utils/auth-guard.js` 的 `checkPermission(name)`
   - 前端页面：`utils/page-guard.js` 的 `guard({moduleKey, ...})` mixin，onLoad 时检查角色

3. **字段映射**：`utils/field-map.js` 把云端下划线字段（`order_no`）映射成前端驼峰（`orderNo`），同时计算 `planCount`/`sizeText` 等展示字段

4. **时间统一**：所有云函数用 `Date.now() + 8*3600*1000` 偏移得到北京时间生成订单号；数据库 `created_at` 用 `db.serverDate()`

5. **集合自动创建**：多个云函数带 `ensureCollections()`，用 `db.createCollection(name)` 幂等创建（首次部署 -502005 兜底）

6. **事务模式**：
   - 简单：用 `db.runTransaction`（如原料入库+库存、原料出库+库存+待确认+通知）
   - 复杂：分阶段，失败手工回滚（如成品出库：先扣订单件数 → 扣成品库存 → 写出库单，每阶段失败回滚已扣的）

7. **顺序号**：所有单号格式 `前缀-YYYYMMDD-HHMMSS + 3位随机`，前缀 RK/CK/IN/CJ/JG/CC

---

## 4. 数据库设计（15 个集合）

> 所有时间字段用 `db.serverDate()`；所有 `status` 是字符串。

### 4.1 集合清单

| 集合名 | 用途 | 关键字段 |
|---|---|---|
| `employee` | 员工账号 | `account, password(sha256), name, role, status(1/-1), created_at` |
| `supplier` | 供应商 | `name, contact_name, contact_phone, created_at` |
| `system_option` | 字典（学校/款式/季节/尺码/性别/物料二级分类/目标车间/出库目的地） | `type, name, value, sort, category_one(仅物料二级分类用), creator_id, created_at` |
| `raw_material_stock` | 原材料总库存（一级分类+二级分类聚合） | `category_one(布料/辅料), category_two, total_quantity, unit(米/个), warning_threshold, updated_at` |
| `raw_inbound_order` | 原材料入库单 | `order_no(RK...), supplier_id, supplier_name, creator_id, material_details[], photos[], remark, status(已入库/已取消), created_at` |
| `raw_outbound_order` | 原材料出库单 | `order_no(CK...), creator_id, creator_name, target_type(cutting/workshop), target_admin_id, material_details[], photos[], remark, status(待确认/已确认/有问题/已取消/已出库), created_at` |
| `cutting_incoming_confirm` | 裁剪来料待确认单（裁剪管理员看到的待确认入库） | `order_no(IN...), source_type(raw_outbound), source_order_id, creator_id, creator_name, target_admin_id, material_details[ {category_one, category_two, spec, quantity, unit, remaining} ], photos[], remark, status(待确认/已确认/有问题), confirm_time, problem_desc, created_at` |
| `workshop_incoming_confirm` | 车间辅料待确认单（车间管理员看到的待确认入库） | 同上 |
| `cutting_order` | 裁剪单（裁剪管理员提交的） | `order_no(CJ...), incoming_confirm_id, outbound_order_id, cutting_admin_id, material_actual_usage[], plan_clothes_detail[ {size, count, gender, style, season, school} ], target_workshop(_id), target_workshop_name, remark, status(已确认/已裁剪/已加工/已退回), workshop_confirm_time, workshop_return_time, return_reason, created_at` |
| `processing_order` | 加工单（车间管理员提交的） | `order_no(JG...), source_type(cutting/workshop), workshop_confirm_id, workshop_incoming_confirm_id, workshop_admin_id(_id), workshop_admin_name, plan_quantity[], actual_quantity[], loss_rate[], accessory_usage[], gender, style, school, status(已完成), confirm_time, created_at` |
| `finished_product_confirm` | 成品入库确认单（成品管理员看到的待确认） | `processing_order_id, order_no(JG...), source_type, gender, style, season, school, plan_quantity[], actual_quantity[], loss_rate[], accessory_usage[], workshop_admin_id, workshop_admin_name, status(待确认/已入库/有问题), problem_desc, confirm_time, stock_rebuilt(bool), stock_rebuilt_at, created_at` |
| `finished_product_stock` | 成品库存（5 维 SKU：gender+style+season+school+size） | `gender, style, season, school, size, quantity, workshop_admin_id, created_at, updated_at` |
| `finished_outbound_order` | 成品出库单 | `order_no(CC...), processing_order_id, outbound_details[ {gender, style, season, school, size, quantity} ], destination, photos[], creator_id, status(已出库/已取消), created_at` |
| `workshop_stock` | 车间辅料库（每车间每辅料一条） | `workshop_admin_id, category_one(辅料), category_two, total_quantity, unit, warning_threshold, updated_at` |
| `notification` | 站内消息 | `receiver_id(_id 或 null=发给同角色), role, type, title, content, related_order_id, is_read(0/1), created_at` |

### 4.2 字典（system_option）的 type 枚举

`school` / `category_two` / `size` / `style` / `workshop` / `destination` / `gender` / `season`

> 物料二级分类的二级层级用 `category_one` 字段（值为「布料」或「辅料」）。

### 4.3 订单号生成规则

```js
// 所有云函数都遵循这个模式
function generateOrderNo(prefix) {
  const now = new Date(Date.now() + 8 * 3600 * 1000); // UTC+8 偏移
  const pad = n => String(n).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `${prefix}-${now.getUTCFullYear()}${pad(now.getUTCMonth()+1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}${rand}`;
}
```

| 前缀 | 含义 | 集合 |
|---|---|---|
| `RK` | 原材料入库 | raw_inbound_order |
| `CK` | 原材料出库 | raw_outbound_order |
| `IN` | 来料待确认（裁剪/车间共用） | cutting_incoming_confirm / workshop_incoming_confirm |
| `CJ` | 裁剪单 | cutting_order |
| `JG` | 加工单 | processing_order（注意：成品确认单也用 JG） |
| `CC` | 成品出库 | finished_outbound_order |

---

## 5. 库存三库模型

### 5.1 三库

| 库 | 集合 | 维度 | 谁有权限写 |
|---|---|---|---|
| **原材料库（总仓）** | `raw_material_stock` | `category_one + category_two` 聚合 | 原材料入库 + / 原材料出库 - |
| **车间辅料库** | `workshop_stock` | `workshop_admin_id + category_one(辅料) + category_two` 聚合 | 车间入库确认 +（来源是原材料出库的辅料）/ 加工单提交 - |
| **成品库存** | `finished_product_stock` | `gender + style + season + school + size`（5 维 SKU） | 成品入库确认 + / 成品出库 - |

### 5.2 完整流转路径

```
【路径 A：经裁剪】
原材料库 ──入──> 原材料库（多）
         ──出(CK)──> 写入 cutting_incoming_confirm（target=裁剪）
                                     裁剪确认 ──> 不动库
                                     裁剪出裁剪单(CJ) ──> 扣 cutting_incoming_confirm.material_details[].remaining
                                     ──> 写入 cutting_order(status=已确认)
车间确认(CJ → 已裁剪)
车间做加工单(JG, source_type=cutting)
  ──> 扣 workshop_stock 辅料 ──> 写入 processing_order(status=已完成)
  ──> 写入 finished_product_confirm(status=待确认)
成品确认入库 ──> + finished_product_stock ──> confirm.status=已入库
成品出库(CC) ──> - finished_product_stock ──> - processing_order.actual_quantity[].count

【路径 B：不经裁剪，直接发车间】
原材料库 ──出(CK, target_type=workshop)──> 写入 workshop_incoming_confirm
车间确认 ──> + workshop_stock（按 workshop_admin_id 聚合）
车间做加工单(JG, source_type=workshop)
  ──> 扣 workshop_stock 辅料 ──> 写入 processing_order ──> 写入 finished_product_confirm
...（后续同路径 A）
```

### 5.3 关键库存三库去重（车间辅料库的去重合并）

车间做加工单时，辅料使用量 `accessory_usage` 数组会做合并（同名辅料合并）：

```js
const mergedMap = new Map();
for (const a of accessory_usage) {
  const name = a.name || a.category_two;
  const qty = Number(a.value) || 0;
  if (!name || qty <= 0) continue;
  mergedMap.set(name, (mergedMap.get(name) || 0) + qty);
}
```

---

## 6. 状态机汇总

### 6.1 cutting_incoming_confirm / workshop_incoming_confirm

```
待确认 ──确认──> 已确认（confirm_time 写入）
        └─有问题──> 有问题（problem_desc 写入 + 通知）
```

### 6.2 cutting_order

```
已确认（裁剪管理员提交后）
   ├─ 车间确认接单 ──> 已裁剪（workshop_confirm_time 写入）
   └─ 车间退回 ──> 已确认（仍为已确认，return_reason + workshop_return_time 写入，发通知给裁剪）
                       └─ 车间做加工单后 ──> 已加工
```

### 6.3 processing_order

创建后直接 `status=已完成`（同时写 confirm），没有中间态。

### 6.4 finished_product_confirm

```
待确认 ──入库确认──> 已入库（confirm_time + stock_rebuilt=true 写入）
        ├─有问题──> 有问题（problem_desc 写入 + 通知车间）
```

### 6.5 raw_inbound_order / raw_outbound_order

```
raw_inbound_order:  已入库（默认）──取消──> 已取消
raw_outbound_order: 待确认（默认）──收料方确认──> 已确认
                                 ──收料方有问题──> 有问题
                                 ──创建者取消──> 已取消
```

### 6.6 finished_outbound_order

`status: 已出库`（创建即完成，状态简单）

---

## 7. 通知机制

`notification` 集合字段：
```
{
  _id,
  receiver_id: <员工 _id 或 null>,  // null 时发给对应 role 全部
  role: '原材料管理员' | '裁剪管理员' | '车间管理员' | '成品管理员' | '老板',
  type: 消息类型字符串,
  title, content,
  related_order_id: 关联单据 _id,
  is_read: 0 | 1,
  created_at
}
```

通知触发场景：

| 触发位置 | type | 接收 | 内容 |
|---|---|---|---|
| 原材料出库给裁剪/车间 | `cutting_incoming` / `workshop_incoming` | 收料方 | "您有新的裁剪/车间待确认入库" |
| 裁剪/车间确认有问题 | `cutting_problem` / `workshop_problem` | 老板/同角色 | "原料入库有问题" |
| 车间确认辅料入库 | `workshop_incoming_confirmed` | 收料方 | "入库确认成功" |
| 裁剪管理员提交裁剪单 | `workshop_pending` | 目标车间管理员 | "您有新的待加工裁剪单" |
| 车间确认接单 | `workshop_confirmed` | 裁剪管理员 | "车间已确认裁剪单" |
| 车间退回裁剪单 | `cutting_return` | 裁剪管理员 | "车间退回裁剪单，原因：xxx" |
| 车间提交加工单 | `processing_submit` | 成品管理员 | "车间已提交加工完成" |
| 成品有问题反馈 | `product_problem` | 车间管理员 | "成品管理员反馈：加工单有问题" |

---

## 8. 云函数清单（74 个，按模块分组）

> 每个云函数都遵循 `exports.main = async (event, context) => { return { success, data?, error? } }` 模式
> 调用方式：`wx.cloud.callFunction({ name, data })`，前端用 `callCloud` 封装

### 8.1 认证（3 个）

| 名称 | 入参 | 返回 | 行为 |
|---|---|---|---|
| `auth-login` | `{account, password}` | `{success, data: {userInfo 不含密码}}` | SHA256 哈希密码，校验 `employee.status=1` |
| `auth-getUserInfo` | `{userId}` | `{success, data: employee}` | 不返回 password 字段 |
| `init-default-accounts` | `{action: 'all'\|'collections'\|'accounts'\|'options'\|'reset'\|'force-reset'\|'inspect'}` | 汇总 | 一键建集合+插默认账号+插默认选项，幂等可重跑 |

### 8.2 员工（4 个，老板专属）

- `employee-add`：必填 `name, account, password, role`；role 在 `['原材料管理员','裁剪管理员','车间管理员','成品管理员','老板']`；account 查重
- `employee-update`：根据 `_id` 更新 `name/account/password(role)/status`
- `employee-delete`：软删 `status=-1`
- `employee-detail`：根据 `_id` 查详情

### 8.3 字典 / 供应商 / 角色（10 个）

- `option-list`：参数 `{type?, keyword?}`；按 `type` 过滤 + 按 `sort`/`created_at` 排序；`type` 必须 ∈ 合法枚举
- `option-detail`：单条查询
- `option-add`：新增；同 `type+name` 不能重
- `option-update`：(有 `_id` 更新 / 无 `_id` 新增)，upsert 模式
- `option-delete`：根据 `_id` 删除
- `supplier-list`：`{page, pageSize, keyword?}`；`name` 模糊匹配
- `supplier-add`：`{name, contact_name?, contact_phone?}`；`contact_phone` 服务端校验手机/座机/400/800
- `supplier-update`：根据 `_id` 更新
- `supplier-delete`：根据 `_id` 删除
- `role-list`：从 employee 集合去重 role

### 8.4 原材料（8 个）

- `raw-inboundAdd`：`{supplier_id, supplier_name, material_details[], photos, remark, creator_id}`；事务内：写 `raw_inbound_order`(status=已入库) + 累加 `raw_material_stock.total_quantity`（按 `category_one+category_two` upsert）
- `raw-inboundCancel`：`{_id}`；事务内：回滚 `raw_material_stock` + 改 `status=已取消`
- `raw-inboundList`：`{page, pageSize, status?, keyword?, date_from?, date_to?, exclude_status?}`；按 order_no 模糊 + 时间区间
- `raw-outboundAdd`：`{material_details[], target_type(cutting/workshop), target_admin_id, photos, remark, creator_id, creator_name}`；**四阶段事务**：
  1. 扣 `raw_material_stock`（分 5 条一批事务）
  2. 写 `raw_outbound_order`(status=待确认)
  3. 写 `cutting_incoming_confirm` 或 `workshop_incoming_confirm`(status=待确认)
  4. 写 `notification`（best-effort）
  - 任一阶段失败：回滚已扣库存 + 删已写单据
- `raw-outboundCancel`：`{_id}`；事务内：回滚 `raw_material_stock` + 改 `status=已取消`（前置：status 必须是"待确认"）
- `raw-outboundList`：同 inboundList 参数
- `raw-stockList`：`{page, pageSize, category_one?}`；分页
- `raw-stockTotal`：聚合返回 `{total, byCategory:{布料:n, 辅料:n}}`
- `raw-stockInit`（老板）：`{items[]}` 或 `{clear: true}`；事务内：清空或 upsert 库存

### 8.5 裁剪（8 个）

- `cutting-incomingList`：`{page, pageSize, status?, keyword?}`；status 按 order_no 模糊
- `cutting-incomingDetail`：`{id}` → 查 `cutting_incoming_confirm`
- `cutting-incomingConfirm`：`{_id}` → 改 status=已确认 + 写 confirm_time
- `cutting-incomingProblem`：`{_id, problem_desc}` → 改 status=有问题 + 发通知（同角色）
- `cutting-orderAdd`：`{incoming_confirm_id, outbound_order_id?, cutting_admin_id, material_actual_usage[], plan_clothes_detail[], target_workshop, remark?}`；事务：扣 `cutting_incoming_confirm.material_details[].remaining`（按 4 字段精匹配，>remaining 报错） + 写 `cutting_order`(status=已确认) + 发通知
- `cutting-orderList`：`{page, pageSize, status?, excludeStatus?}`；批量映射 `target_workshop(_id)→name`
- `cutting-confirmedIncomingList`：返回 status=已确认 的 `cutting_incoming_confirm`（带 `stock`=remaining 字段给前端）
- `order-detail`：`{id}` → 查 `cutting_order`

### 8.6 车间（10 个）

- `workshop-incomingList`：`{page, pageSize, status?}`
- `workshop-incomingConfirm`：`{_id}`；事务改 status=已确认，best-effort 累加 `workshop_stock`（按 `workshop_admin_id+category_one+category_two` upsert）+ 通知
- `workshop-incomingProblem`：`{_id, problem_desc}` → 改 status=有问题 + 通知
- `workshop-confirmedList`：返回 `cutting_order`(status=已裁剪) 给车间做加工单时下拉
- `workshop-confirmedIncomingList`：返回 `workshop_incoming_confirm`(status=已确认) 备用
- `workshop-pendingList`：返回 `cutting_order`(status=已确认) 待车间确认接单
- `workshop-pendingConfirm`：`{_id}` → 改 `cutting_order.status=已裁剪` + 通知裁剪管理员
- `workshop-pendingReturn`：`{_id, return_reason}` → 改 `cutting_order.status=已确认`（带退回原因和时间）+ 通知裁剪
- `workshop-processingAdd`：`{source_type(cutting/workshop), workshop_confirm_id?, workshop_incoming_confirm_id?, workshop_admin_id, plan_quantity[], actual_quantity[], loss_rate[], accessory_usage[], gender, style, school}`；**核心事务**：
  1. ensureCollections 幂等创建
  2. 事务内：校验+扣 `workshop_stock` 辅料（同名合并） + 写 `processing_order`(status=已完成)
  3. 事务外：改 `cutting_order.status=已加工`（cutting 源时）
  4. 写 `finished_product_confirm`(status=待确认)，带完整快照
  5. 通知成品管理员
  - 失败：回滚辅料库存
- `workshop-processingList`：`{page, pageSize, status?}`；JOIN cutting_order 取 source_order_no + target_workshop_name
- `workshop-processingDetail`：`{id}`；同 JOIN 逻辑
- `workshop-stockList`：`{workshop_admin_id, page, pageSize}`；只查 `category_one=辅料`；按车间隔离

### 8.7 成品（9 个）

- `finished-confirmList`：`{page, pageSize, status?, statuses?, tab: 'todo'|'done'|'all'}`；tab 模式自动映射 statuses
- `finished-confirmIn`：`{_id, finished_admin_id?, actual_quantity?, force?}`；**幂等确认入库**：
  - status=已入库 且 !force → 跳过
  - 否则：按 `gender+style+season+school+size` 5 维 SKU 累加 `finished_product_stock.quantity`（upsert）
  - 改 confirm.status=已入库 + 写 stock_rebuilt=true
  - force=true：先重置 stock_rebuilt 标记
- `finished-confirmProblem`：`{_id, problem_desc}` → 改 status=有问题 + 通知该车间管理员
- `finished-availableOrderList`：返回 `processing_order`(status=已完成) 且至少有一个尺码 count>0
- `finished-stockList`：`{page, pageSize, gender?, style?, season?, school?, size?, workshop_admin_id?}`；5 维筛选 + orderBy 失败兜底
- `finished-stockExport`：`{...同筛选}`；用 `xlsx` 库生成 Excel，上传云存储，返回 `fileID`
- `finished-outboundAdd`：`{processing_order_id, outbound_details[ {gender, style, season, school, size, quantity} ], destination, photos?, creator_id, remark?}`；**三阶段事务**：
  1. 扣 `processing_order.actual_quantity[].count`（按 size 找下标）
  2. 扣 `finished_product_stock.quantity`（按 5 维 SKU，分批 5 个/批）
  3. 写 `finished_outbound_order`(status=已出库)
  - 任一阶段失败：回滚 + 返回 `{stockFailInfo: {size, orderQty, stockQty, needQty}}`
- `finished-outboundList`：`{page, pageSize, status?, keyword?, destination?, startDate?, endDate?}`；时间支持 YYYY-MM-DD 字符串
- `finished-outboundDetail`：`{_id}` → 查 `finished_outbound_order` + 补 `sourceOrderNo/sourceWorkshopName`
- `finished-emergencyRebuildStock`：`{force?, dryRun?, onlyId?, reset?}`；**应急工具**，扫描所有 `finished_product_confirm`（status=已入库 或 待确认）重算 `finished_product_stock`；用 `stock_rebuilt` 标记做幂等
- `finished-stockRebuildFromHistory`（老板）：从历史 confirm 重算库存（应急用，逻辑同上）

### 8.8 老板数据（6 个，老板专属）

- `boss-overview`：聚合 `raw_inbound_order`(今日已入库) + `raw_outbound_order`(今日, status≠已取消) + 3 个待确认 count + 2 个库存 + 本月成品出库
- `boss-orderList`：`{page, pageSize, module?, status?, keyword?, timeFrom?, timeTo?}`；支持 5 个模块的 `raw_inbound/raw_outbound/cutting/processing/finished_outbound`；批量查 employee 映射操作人
- `boss-orderTimeline`：`{order_id, module}`；聚合渲染单据流转时间轴（按模块不同拼接不同节点），含 fields/photos
- `boss-finishedStats`：`{type: 'stock'|'outbound', groupBy: 'school'|'style'|'season'|'destination'}`；聚合行+明细+可下钻维度
- `boss-warning`：`{warning_threshold > 0 && total_quantity <= warning_threshold}` 的原材料预警列表
- `workshop-list`：（公开）返回 role=车间管理员 的员工列表（含 name, account, _id）

### 8.9 通知（3 个）

- `notification-list`：`{page, pageSize, user_id, role}`；`where = (receiver_id == user_id) OR (role == role)`
- `notification-unreadCount`：`{user_id, role}`；`is_read=0` 计数
- `notification-markRead`：`{_id}` → `is_read=1`

### 8.10 系统 / 工具（5 个）

- `quickstartFunctions`：示例函数（销售/集合/二维码）
- `debug-check-cuttingStatus` / `debug-check-orders` / `debug-confirmList`：调试用
- `auth-getUserInfo`：根据 userId 返回员工信息（无密码）

---

## 9. 前端页面（38 个 + 1 个 tabbar）

### 9.1 全局配置

```json
// app.json
{
  "pages": [ 38 个路径 ],
  "window": {
    "navigationBarBackgroundColor": "#1A73E8",
    "navigationBarTitleText": "校服生产管理",
    "navigationBarTextStyle": "white",
    "backgroundColor": "#F5F5F5"
  },
  "tabBar": {
    "list": [
      { "pagePath": "pages/index/index", "text": "首页" },
      { "pagePath": "pages/notification/list/index", "text": "消息" }
    ]
  }
}
```

### 9.2 公共工具

- `utils/request.js`：导出 `callCloud(name, data, showLoading)` 包装
- `utils/auth-guard.js`：`checkPermission(fnName)`，分 PUBLIC/BOSS_ONLY/ROLE_PERMS
- `utils/page-guard.js`：`guard({moduleKey, ...config})` mixin，onLoad 时检查角色
- `utils/permissions.js`：定义 `ROLE/ALL_MODULES/ROLE_MODULES`，`getModulesByRole/canAccessModule/isBoss`
- `utils/util.js`：`formatDate/timeAgo/isValidPhone/debounce/getStatusStyle/getRoleShort`
- `utils/field-map.js`：所有列表字段映射函数（mapCuttingIncoming/mapWorkshopPending/mapProcessingOrder/mapFinishedConfirm/mapFinishedOutbound/mapFinishedStock/mapRawInbound/...）

### 9.3 页面清单

#### 登录 / 首页 / 消息（3）
1. `pages/login/login` — 账号密码登录；支持"用已缓存账号继续/切换账号"
2. `pages/index/index` — 通用首页：根据角色渲染 `moduleList`（我的工作台）+ `extraModuleList`（相关操作）；老板额外显示"管理后台"快捷入口；展示未读通知 + 今日待办
3. `pages/notification/list/index` — 消息列表（tabbar 页面）

#### 原材料（5 + 子页）
4. `pages/raw/list/index` — 原材料 Tab：入库/出库/库存 三个 Tab
5. `pages/raw/inbound/add/index` — 新增入库（选供应商 + 多物料明细 + 照片 + 备注）
6. `pages/raw/outbound/add/index` — 新增出库（多物料 + 目标角色 + 校验库存）
7. `pages/raw/settings/index` — 原材料设置（供应商管理 / 物料二级分类）
8. `pages/raw/settings/supplier/index` + `supplier-edit/index` — 供应商列表/编辑
9. `pages/raw/settings/option/index` + `option-edit/index` — 物料二级分类（按"布料/辅料"分组）

#### 裁剪（4 + 子页）
10. `pages/cutting/incoming/list/index` — 待裁剪确认列表（Tab：待确认/已确认）
11. `pages/cutting/incoming/detail/index` — 来料详情
12. `pages/cutting/cutting/add/index` — 新建裁剪单（选来料 + 填使用量 + 多尺码件数 + 学校/款式/季节/性别 + 目标车间）
13. `pages/cutting/record/index` — 裁剪记录列表

#### 车间（4 + 子页）
14. `pages/workshop/incoming/list/index` — 待辅料确认列表（Tab：待确认/已确认）
15. `pages/workshop/pending/list/index` — 待加工裁剪单列表（"确认接单" / "退回" 必填原因）
16. `pages/workshop/processing/add/index` + `add-b/index` — 新建加工单（选裁剪单 + 多尺码实际件数 + 自动算损耗率 + 辅料使用量）
17. `pages/workshop/record/index` — 加工记录列表

#### 成品（4 + 子页）
18. `pages/finished/confirm/list/index` — 成品入库确认（Tab：待确认/已完成 + 应急工具）
19. `pages/finished/confirm/repair/index` — 应急工具页（执行 finished-emergencyRebuildStock）
20. `pages/finished/stock/index` — 成品库存（5 维筛选）
21. `pages/finished/outbound/add/index` — 成品出库（选加工单 + 各尺码出库数 + 目的地）
22. `pages/finished/outbound/record/index` — 出库记录

#### 老板（6 + 子页）
23. `pages/boss/overview/index` — 老板首页数据总览（今日入库/出库/待确认/库存/本月出库 + 4 快捷入口）
24. `pages/boss/employee/list/index` + `add/index` + `edit/index` — 员工管理
25. `pages/boss/orders/index` — 订单记录（5 模块筛选 + 时间轴弹窗）
26. `pages/boss/orders/detail/index` — 订单详情
27. `pages/boss/finished-stats/index` — 成品统计
28. `pages/boss/inbound-list/index` — 老板今日入库
29. `pages/boss/outbound-list/index` — 老板今日出库
30. `pages/boss/raw-stock/index` — 老板原材料库存
31. `pages/boss/settings/index` — 系统设置（员工/选项/供应商/库存初始化/数据导出）
32. `pages/boss/settings/data-export/index` — 数据导出
33. `pages/boss/settings/option-edit/index` — 选项管理
34. `pages/boss/settings/supplier/index` + `edit/index` — 老板的供应商管理
35. `pages/boss/settings/stock-init/index` — 库存初始化

### 9.4 关键页面 UI 元素

**pages/index/index**：
- 顶部 user-card（头像首字 + 姓名 + 角色标签 + 铃铛+未读数 + 退出）
- "我的工作台" section（主模块卡片，单/多列自适应）
- "相关操作" section（扩展模块）
- 老板专属"管理后台"section（员工/订单/统计/设置）

**pages/cutting/cutting/add/index**（最复杂表单）：
- 选来料单（下拉，显示"单号 | 剩 12.5米"）
- 物料使用量（每行显示库存+超库存红框）
- 学校/款式/季节/性别（必填，picker 联动）
- 尺码（多选 chip）+ 各尺码件数
- 目标车间（下拉）
- 备注（≤200 字）

**pages/workshop/processing/add/index**（最复杂表单之二）：
- 选裁剪单（仅 status=已裁剪 且 未登记）
- 显示计划件数 + 尺码明细（不可编辑）
- 实际件数（按各尺码分别填，实时算损耗率，>5% 标黄，<0% 标红）
- 辅料使用量（按辅料二级分类分列，显示库存+超额标红）
- 提交后乐观扣减本地库存

**pages/finished/confirm/list/index**：
- Tab：待确认 / 已完成（显示计数 badge）+ 应急工具 Tab
- 卡片：左右分栏（信息区 + 底部横排双按钮"有问题" / "确认入库"）
- 已完成 Tab 长按可"重新入库"（force=true）

**pages/finished/outbound/add/index**：
- 选加工单
- 自动算各尺码明细（订单件数=可出库库存）
- 三键："全填" / "清空" / "数据对比"（调试用）
- 选目的地（可新增）
- 弹窗确认出库详情

**pages/boss/orders/index**：
- 3 个 picker 筛选：模块/状态/时间范围
- 搜索订单号
- 订单卡片：单号 + 模块标签 + 状态徽章 + 概要
- 点击 → 时间轴弹窗（按时间升序，每个节点有"操作人/状态/详情"）
- 节点详情二级弹窗：显示 fields + photos

---

## 10. 业务流程（按角色）

### 10.1 原材料入库

```
角色：原材料/裁剪/车间管理员
入口：pages/raw/list → "新增入库" → pages/raw/inbound/add
流程：
  1. 选供应商（无则先添加）
  2. 添加物料行：一级分类(布料/辅料) → 二级分类(联动) → 数量
  3. 选填照片（最多 9 张，压缩）
  4. 选填备注
  5. 提交
云函数：raw-inboundAdd
事务：
  - 写 raw_inbound_order(status=已入库)
  - 按 (category_one+category_two) upsert raw_material_stock.total_quantity（+quantity）
幂等：order_no 自带时间戳，重提交会生成新单号
```

### 10.2 原材料出库

```
角色：原材料/裁剪/车间管理员
入口：pages/raw/list → "新增出库" → pages/raw/outbound/add
流程：
  1. 添加物料行
  2. 选目标角色（原材料管理员可见裁剪+车间；裁剪/车间自动为自己）
  3. 校验：每项 quantity ≤ 当前库存
  4. 提交
云函数：raw-outboundAdd
四阶段：
  1. 事务扣 raw_material_stock（5 条/批）
  2. 写 raw_outbound_order(status=待确认)
  3. 写 cutting_incoming_confirm 或 workshop_incoming_confirm(status=待确认)
  4. 写通知（best-effort）
失败回滚：阶段 1 失败 → 回滚已扣库存；阶段 2 失败 → 回滚库存；阶段 3 失败 → 删出库单 + 回滚库存
```

### 10.3 裁剪来料确认

```
角色：裁剪管理员
入口：pages/cutting/incoming/list → "待确认" Tab
操作：
  - 确认：→ cutting-incomingConfirm → status=已确认
  - 有问题：弹窗填问题描述（必填）→ cutting-incomingProblem → status=有问题 + 通知
```

### 10.4 创建裁剪单

```
角色：裁剪管理员
入口：pages/cutting/cutting/add（也支持 ?id=xxx 查看详情）
流程：
  1. 选来料单（cutting-confirmedIncomingList，库存=remaining）
  2. 自动填物料使用量行
  3. 用户改每行 usage（校验：usage ≤ 库存）
  4. 填学校/款式/季节/性别（picker）+ 多选尺码 + 各尺码件数
  5. 选目标车间
  6. 提交 → cutting-orderAdd
事务：
  - 扣 cutting_incoming_confirm.material_details[].remaining
  - 写 cutting_order(status=已确认)
  - 通知目标车间管理员
```

### 10.5 车间裁剪单接单

```
角色：车间管理员
入口：pages/workshop/pending/list
操作：
  - 确认接单：→ workshop-pendingConfirm → cutting_order.status=已裁剪 + 通知裁剪
  - 退回：弹层必填原因 → workshop-pendingReturn → cutting_order.return_reason + status=已确认 + 通知裁剪
```

### 10.6 车间新建加工单

```
角色：车间管理员
入口：pages/workshop/processing/add（也支持 ?id=xxx 详情）
流程：
  1. 选裁剪单（workshop-confirmedList，cutting_order status=已裁剪）
  2. 显示计划件数+尺码明细（只读）
  3. 填各尺码实际件数（必填；自动算损耗率）
  4. 填辅料使用量（按辅料二级分类；显示车间辅料库存；超额标红）
  5. 提交 → workshop-processingAdd
事务：
  - 校验+扣 workshop_stock 辅料（按 workshop_admin_id+辅料聚合；同名合并）
  - 写 processing_order(status=已完成)
  - 改 cutting_order.status=已加工（事务外）
  - 写 finished_product_confirm(status=待确认)
  - 通知成品管理员
失败：事务自动回滚；写 confirm 失败 → 显式回滚辅料库存
```

### 10.7 成品入库确认

```
角色：成品管理员
入口：pages/finished/confirm/list → "待确认" Tab
操作：
  - 确认入库：→ finished-confirmIn
  - 有问题：弹窗填描述 → finished-confirmProblem → 通知车间
确认逻辑：
  - 幂等：status=已入库 且 !force → 跳过
  - 按 gender+style+season+school+size 5 维累加 finished_product_stock
  - 改 confirm.status=已入库 + stock_rebuilt=true
```

### 10.8 成品出库

```
角色：成品管理员
入口：pages/finished/outbound/add
流程：
  1. 选加工单（finished-availableOrderList，至少有一个尺码 count>0）
  2. 自动算 sizeBreakdown（每个尺码一行，订单件数=可出库）
  3. 填各尺码出库数（≤ 订单件数）
  4. 选目的地（可新增）
  5. 提交 → finished-outboundAdd
三阶段事务：
  1. 扣 processing_order.actual_quantity[].count
  2. 扣 finished_product_stock.quantity（5 维 SKU）
  3. 写 finished_outbound_order(status=已出库)
失败：回滚已扣的两处库存
特殊：返回 stockFailInfo 给前端，便于详细错误提示
```

---

## 11. UI 设计规范

### 11.1 设计 token（app.wxss 的 :root）

```css
--primary-color: #1A73E8;        /* 主蓝 */
--primary-light: #E8F0FE;
--primary-dark: #1557B0;
--success-color: #34A853;        /* 成功绿 */
--warning-color: #FB8C00;        /* 警告橙 */
--danger-color: #EA4335;         /* 危险红 */
--gold-color: #F9AB00;           /* 老板金色点缀 */
--bg-color: #F4F5F7;
--text-primary: #1F2937;
--text-secondary: #6B7280;
--border-color: #E5E7EB;
--shadow-sm: 0 1rpx 4rpx rgba(15, 23, 42, 0.04);
--shadow-md: 0 4rpx 16rpx rgba(15, 23, 42, 0.06);
```

### 11.2 排版规则

- 基础 font-size: 28rpx
- 按钮高 ≥ 80rpx，圆角 44rpx
- 卡片 16rpx 圆角，shadow-md
- 表单 input 高 80rpx，圆角 12rpx
- Tab 切换 80rpx 高，激活色 #1A73E8
- 主操作按钮（底部）固定栏 safe-bottom

### 11.3 状态徽章

- 已完成/已确认/已裁剪/已加工/已入库 → success 绿
- 待确认/待出库 → warning 橙
- 有问题/已退回/已取消 → danger 红
- 默认 → grey

---

## 12. 老板端数据总览

`boss-overview` 返回字段：
```
{
  todayInboundCount:    今日原材料入库件数（按 material_details[].quantity 求和）
  todayOutboundCount:   今日原材料出库件数（status≠已取消）
  cuttingPendingCount:  cutting_incoming_confirm 中 status=待确认 的 count
  workshopPendingCount: workshop_incoming_confirm 中 status=待确认 的 count
  finishedPendingCount: finished_product_confirm 中 status=待确认 的 count
  rawTotal:             raw_material_stock.total_quantity 求和
  finishedTotal:        finished_product_stock.quantity 求和
  monthOutboundTotal:   本月成品出库（status≠已取消，outbound_details[].quantity 求和）
}
```

`boss-finishedStats` 支持：
- type=stock：按 school/style/season 聚合 finished_product_stock
- type=outbound：按 school/style/season/destination 聚合 finished_outbound_order.outbound_details[]

`boss-warning`：原材料库存 `total_quantity <= warning_threshold` 且 threshold>0 的列表

---

## 13. 关键不变量与踩坑点

### 13.1 强一致的不变量

1. **订单件数 vs 库存件数 必须同步**：`finished-outboundAdd` 必须同时扣 `processing_order.actual_quantity[].count` 和 `finished_product_stock.quantity`，否则后续选单时件数对不上
2. **车间辅料库按 `workshop_admin_id` 隔离**：不同车间辅料不能互窜
3. **裁剪来料扣减按 (cat1+cat2+spec+unit) 4 字段精匹配**：不是单 cat2，否则同二级分类多规格会错
4. **辅料同名合并**：加工单提交时按 name 合并数量，避免前端重复提交
5. **通知有 receiver_id 时发给指定人，否则发给同 role 全部**

### 13.2 容易踩的坑

- 云函数运行在云端是 UTC 时间，订单号生成必须 `+8h` 偏移
- `db.serverDate()` 是云端时间，不用偏移
- 多个云函数首次部署 -502005：必须用 `ensureCollections()` 幂等创建
- `orderBy` 没建索引会失败：raw-stockList 故意去掉 orderBy
- `runTransaction` 一次性扣超过 20 个文档会失败：分批 5 个/批
- 单次 `_.in()` 不能超过 1000：employee 映射要分 chunk
- `wx.cloud.callFunction` 的 result 在 res.result 里，request.js 已经 unwrap 成 res.result.data
- 老云函数返回 `{success: true, ...data}` 没 data 字段：finished-confirmList 返回 `{list, total}` 需用 `data.list` 取
- finished-outboundAdd 库存不足时，err.result 里带 `stockFailInfo`，前端可以从 err.result 取

### 13.3 应急工具

- `finished-emergencyRebuildStock`：成品入库确认按钮点了但库存没写进去时，一键重算
- `init-default-accounts` action=force-reset：按 role 删除再重建默认账号
- `boss-warning`：原材料低库存预警

---

## 14. 默认账号与初始化

`init-default-accounts` 云函数（action=all）创建：

| 账号 | 密码 | 角色 | 姓名 |
|---|---|---|---|
| boss | boss123 | 老板 | 系统管理员 |
| raw_admin | raw123 | 原材料管理员 | 原材料管理员 |
| cutting_admin | cutting123 | 裁剪管理员 | 裁剪管理员 |
| workshop_admin | workshop123 | 车间管理员 | 车间管理员 |
| finished_admin | finished123 | 成品管理员 | 成品管理员 |

并创建 15 个集合 + 14 个默认系统选项：
- size: S/M/L/XL/XXL
- gender: 男/女/男女同款
- style: 夏装/冬装/春秋装
- destination: 本校仓库/客户自提
- school: 示例学校

---

## 15. 部署要点

### 15.1 部署步骤

1. 微信开发者工具导入项目，AppID `wx2fa998031f16f532`
2. `cloudfunctions/` 目录下 74 个云函数全部上传（右键 → 上传并部署：云端安装依赖）
3. 调一次 `init-default-accounts`（action=all）初始化
4. 老板登录（boss/boss123）→ 即可在「系统设置」里继续添加员工/字典

### 15.2 依赖

每个云函数 package.json 都依赖 `wx-server-sdk: ~2.6.3`
`finished-stockExport` 额外依赖 `xlsx`

### 15.3 权限配置

云开发控制台需要：
- 数据库：所有集合读写权限给 "所有用户"（前端已做权限校验）
- 云存储：给 "所有用户" 读写
- 云函数：74 个都要部署

---

## 16. 复现检查清单

让另一个 AI 复现时，**必须**做到以下点（按优先级）：

- [ ] 创建 15 个云数据库集合
- [ ] 部署 74 个云函数
- [ ] `init-default-accounts` action=all 跑一次
- [ ] 实现 `callCloud` 封装 + `checkPermission` + `page-guard`
- [ ] 实现 38 个页面 + 2 个 tabbar（首页/消息）
- [ ] 实现三库模型（原料库/车间辅料库/成品库存）
- [ ] 实现状态机：raw_inbound/raw_outbound/cutting_incoming_confirm/workshop_incoming_confirm/cutting_order/processing_order/finished_product_confirm/finished_outbound_order
- [ ] 实现通知 8 种触发
- [ ] 实现成品出库三阶段事务 + 库存不足回滚 + 返回 stockFailInfo
- [ ] 实现车间加工单的事务（校验辅料库存+扣辅料+写加工单+写 confirm）
- [ ] 实现老板数据总览 + 订单时间轴 + 成品统计
- [ ] 实现裁剪来料扣减按 4 字段精匹配
- [ ] 实现订单号 +8h 偏移
- [ ] 实现每个页面 role 模块可见性

---

## 17. 一句话总结

校服生产管理小程序 = 微信云开发 + 5 角色 + 三库模型 + 8 状态机 + 38 页面 + 74 云函数。核心难点是车间辅料库的"领料→确认入库→加工扣减"三段式，以及成品出库的"订单件数+成品库存"双扣事务。
