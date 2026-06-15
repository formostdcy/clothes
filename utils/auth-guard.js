/**
 * 权限拦截器 - 在 callCloud 最底层统一拦截
 *
 * 设计原则：
 * 1. 登录前（无 userInfo）：除了 auth-* 登录相关，其余都拦截
 * 2. 老板：放行所有
 * 3. 业务管理员：按 ROLE_PERMISSIONS 矩阵精确控制
 *
 * 真正的安全靠云函数 server 端校验，这只是前端第一道防线（避免 UI 乱弹错误）
 */

const { isBoss } = require('./permissions.js');

// 1. 公开函数（所有登录用户都能调）
//    - 基础数据只读：录单时要选供应商/类别/领料人
//    - 登录、通知
const PUBLIC_FUNCS = new Set([
  'auth-login',
  'auth-getUserInfo',
  'notification-list',
  'notification-markRead',
  'notification-unreadCount',
  'notification-overview', // 首页通知概览（合并 unreadCount + todoList，1 次往返）
  'option-list',
  'option-detail',
  'supplier-list',
  'employee-list',
  'role-list',
  'workshop-list',
]);

// 2. 老板专属：只老板能调
const BOSS_ONLY_FUNCS = new Set([
  // 员工管理（增删改查）
  'employee-add',
  'employee-delete',
  'employee-detail',
  'employee-update',
  // 老板数据
  'boss-overview',
  'boss-orderList',
  'boss-orderTimeline',
  'boss-finishedStats',
  'boss-warning',
  'order-detail',
  // 系统初始化 & 修复
  'raw-stockInit',
  'init-default-accounts',
  'quickstartFunctions',
  // 历史数据修复
  'finished-stockRebuildFromHistory',
  // debug
  'debug-check-cuttingStatus',
  'debug-check-orders',
  'debug-confirmList',
]);

// 3. 角色 -> 允许调用的云函数白名单
//    只有在这里面明确列出的函数，业务管理员才能调（增删改供应商/字典等）
const ROLE_PERMISSIONS = {
  '原材料管理员': new Set([
    // 供应商/字典管理（原材料模块专用设置）
    'supplier-add',
    'supplier-update',
    'supplier-delete',
    'option-update',     // option-update 现在是 upsert（add+update）
    'option-delete',
    // 原材料业务
    'raw-inboundAdd',
    'raw-inboundCancel',
    'raw-inboundList',
    'raw-outboundAdd',
    'raw-outboundCancel',
    'raw-outboundList',
    'raw-stockList',
    'raw-stockTotal',
  ]),
  '裁剪管理员': new Set([
    'cutting-incomingList',
    'cutting-incomingDetail',
    'cutting-incomingConfirm',
    'cutting-incomingProblem',
    'cutting-confirmedIncomingList',
    'cutting-orderAdd',
    'cutting-orderList',
    'workshop-list',
    // 录领料/出库单（出原材料库）+ 看库存
    'raw-outboundAdd',
    'raw-outboundList',
    'raw-stockList',
    // 录原材料入库（裁剪收货也录在这里）
    'raw-inboundAdd',
    'raw-inboundList',
  ]),
  '车间管理员': new Set([
    'workshop-incomingList',
    'workshop-pendingList',
    'workshop-pendingConfirm',
    'workshop-pendingReturn',
    'workshop-incomingConfirm',
    'workshop-incomingProblem',
    'workshop-confirmedList',
    'workshop-confirmedIncomingList',
    'workshop-processingList',
    'workshop-processingAdd',
    'workshop-processingDetail',
    // 修：车间辅料库存查询（车间管理员自己看自己的辅料库）
    // - 业务上：新建生产单时要选辅料并校验库存
    // - 云函数内部已按 workshop_admin_id 隔离，多车间不会互串
    'workshop-stockList',
    // 录领料/出库单（出原材料库）+ 看库存
    'raw-outboundAdd',
    'raw-outboundList',
    'raw-stockList',
    // 录原材料入库（车间收货也录在这里）
    'raw-inboundAdd',
    'raw-inboundList',
  ]),
  '成品管理员': new Set([
    'finished-confirmList',
    'finished-confirmIn',
    'finished-confirmProblem',
    'finished-availableOrderList',
    'finished-stockList',
    'finished-stockExport',
    'finished-outboundAdd',
    'finished-outboundList',
    'finished-outboundDetail',
    // 应急工具：成品管理员也可以调用（重建库存是日常运维需要）
    'finished-emergencyRebuildStock',
  ]),
};

/**
 * 检查当前 role 是否有权调用指定云函数
 * @returns {boolean}
 */
function checkPermission(fnName) {
  const app = getApp();
  const userInfo = app.getUserInfo() || {};
  const role = userInfo.role || '';

  // 1. 公开函数永远放行
  if (PUBLIC_FUNCS.has(fnName)) return true;

  // 2. 未登录：除了登录函数都拦截
  if (!role) {
    if (fnName && fnName.indexOf('auth-') === 0) return true;
    return false;
  }

  // 3. 老板永远放行
  if (isBoss(role)) return true;

  // 4. 老板专属函数：非老板拦截
  if (BOSS_ONLY_FUNCS.has(fnName)) {
    console.warn(`[permission] ${role} 试图调用老板专属函数 ${fnName}，被拦截`);
    return false;
  }

  // 5. 业务管理员：查白名单
  const rolePerms = ROLE_PERMISSIONS[role];
  if (!rolePerms) {
    // 未知角色（理论上不应该）：拒绝
    console.warn(`[permission] 未知角色 ${role} 调用 ${fnName}，被拒绝`);
    return false;
  }
  if (!rolePerms.has(fnName)) {
    console.warn(`[permission] ${role} 越权调用 ${fnName}，被拦截`);
    return false;
  }

  return true;
}

module.exports = {
  checkPermission,
  PUBLIC_FUNCS,
  BOSS_ONLY_FUNCS,
  ROLE_PERMISSIONS,
};
