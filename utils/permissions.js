/**
 * 角色权限配置 - 全系统统一入口
 *
 * 设计原则：
 * - 老板 = 超级管理员，能看所有模块
 * - 业务管理员（原材料/裁剪/车间/成品）= 只能看自己负责的模块
 * - 任何"是否可见 / 是否可操作"的判断，都必须经过 ROLE_CONFIG，
 *   禁止在页面里硬编码 role 字符串
 */

// 角色 key：和数据库 employee 集合的 role 字段值严格一致
const ROLE = {
  BOSS: '老板',
  RAW: '原材料管理员',
  CUTTING: '裁剪管理员',
  WORKSHOP: '车间管理员',
  FINISHED: '成品管理员',
};

// 全部业务模块定义（key 给前端判断用，name 显示给用户，icon 配样式用）
// 改：把"裁剪加工"、"裁剪记录"、"车间生产"、"车间记录"独立成 module，
// 放在"我的工作台"和"裁剪/车间"平级
const ALL_MODULES = {
  raw:           { key: 'raw',           name: '原材料',     icon: '料', color: 'raw-icon',       desc: '入库/出库/库存' },
  cutting:       { key: 'cutting',       name: '裁剪',       icon: '剪', color: 'cutting-icon',   desc: '收料确认' },
  cutting_add:   { key: 'cutting_add',   name: '裁剪加工',   icon: '建', color: 'cutting-add-icon', desc: '新建裁剪单' },
  cutting_record:{ key: 'cutting_record',name: '裁剪记录',   icon: '录', color: 'cutting-rec-icon', desc: '裁剪历史单据' },
  workshop:      { key: 'workshop',      name: '车间',       icon: '工', color: 'workshop-icon',  desc: '收料确认' },
  workshop_pending:    { key: 'workshop_pending',    name: '车间待加工', icon: '待', color: 'workshop-pending-icon', desc: '确认加工裁剪单' },
  workshop_processing: { key: 'workshop_processing', name: '车间生产', icon: '产', color: 'workshop-proc-icon', desc: '新建生产单' },
  workshop_record:     { key: 'workshop_record',     name: '车间记录', icon: '记', color: 'workshop-rec-icon', desc: '生产历史单据' },
  finished_inbound:  { key: 'finished_inbound',  name: '成品入库',   icon: '入', color: 'finished-inbound-icon',  desc: '确认成品入库' },
  finished_stock:    { key: 'finished_stock',    name: '库存明细',   icon: '存', color: 'finished-stock-icon',    desc: '查看成品库存' },
  finished_outbound: { key: 'finished_outbound', name: '成品出库',   icon: '出', color: 'finished-outbound-icon', desc: '发货出库' },
  finished_record:   { key: 'finished_record',   name: '出库记录',   icon: '录', color: 'finished-record-icon',   desc: '出库历史' },
  finished:          { key: 'finished',          name: '成品',       icon: '库', color: 'finished-icon',          desc: '确认/库存/出库' },
  boss:              { key: 'boss',              name: '管理后台',   icon: '管', color: 'boss-icon',              desc: '员工/订单/统计' },
};

// 角色 -> 主要模块（首页默认显示）key 列表
// 改：裁剪/车间管理员的主模块展示 3-4 个，和裁剪/车间平级
const ROLE_MODULES = {
  [ROLE.BOSS]:     ['raw', 'cutting', 'cutting_add', 'cutting_record', 'workshop', 'workshop_pending', 'workshop_processing', 'workshop_record', 'finished_inbound', 'finished_stock', 'finished_outbound', 'finished_record', 'boss'],
  [ROLE.RAW]:      ['raw'],
  [ROLE.CUTTING]:  ['cutting', 'cutting_add', 'cutting_record'],
  [ROLE.WORKSHOP]: ['workshop', 'workshop_pending', 'workshop_processing', 'workshop_record'],
  [ROLE.FINISHED]: ['finished_inbound', 'finished_stock', 'finished_outbound', 'finished_record'],
};

// 角色 -> 扩展可访问模块
// 业务说明：
// - 原材料入库：原材料管理员
// - 原材料出库（领料）：原材料管理员 + 裁剪管理员 + 车间管理员
//   原因：实际业务中，领料单可能由领料方（裁剪/车间）来录，原材料管理员负责审核
//   所以裁剪/车间管理员也要能进 raw 模块的"出库"功能
// - 裁剪出库：裁剪管理员
// - 车间生产：车间管理员
// - 成品确认/出库：成品管理员
// - 老板：能进所有
const ROLE_EXTRA_MODULES = {
  [ROLE.BOSS]:     ['raw', 'cutting', 'cutting_add', 'cutting_record', 'workshop', 'workshop_pending', 'workshop_processing', 'workshop_record', 'finished_inbound', 'finished_stock', 'finished_outbound', 'finished_record', 'boss'],
  [ROLE.RAW]:      [],
  [ROLE.CUTTING]:  ['raw'],
  [ROLE.WORKSHOP]: ['raw'],
  [ROLE.FINISHED]: [],
};

/**
 * 获取指定角色能看到的模块（带显示信息）
 * @param {string} role - 数据库里的 role 字段值
 * @returns {Array<{key, name, icon, color}>}
 */
function getModulesByRole(role) {
  const keys = ROLE_MODULES[role] || [];
  return keys.map(k => ALL_MODULES[k]).filter(Boolean);
}

/**
 * 获取扩展模块（裁剪/车间也能访问的 raw 模块等）
 */
function getExtraModulesByRole(role) {
  const mainKeys = ROLE_MODULES[role] || [];
  const extraKeys = ROLE_EXTRA_MODULES[role] || [];
  const newExtras = extraKeys.filter(k => !mainKeys.includes(k));
  return newExtras.map(k => ALL_MODULES[k]).filter(Boolean);
}

/**
 * 判断当前角色是否能进入某个模块
 * 规则：主模块 + 扩展模块 都能进
 */
function canAccessModule(role, moduleKey) {
  const mainKeys = ROLE_MODULES[role] || [];
  const extraKeys = ROLE_EXTRA_MODULES[role] || [];
  const allKeys = [...new Set([...mainKeys, ...extraKeys])];
  return allKeys.includes(moduleKey);
}

/**
 * 判断是否是老板
 */
function isBoss(role) {
  return role === ROLE.BOSS;
}

/**
 * 判断是否是原材料管理员
 */
function isRawAdmin(role) {
  return role === ROLE.RAW;
}

module.exports = {
  ROLE,
  ALL_MODULES,
  ROLE_MODULES,
  ROLE_EXTRA_MODULES,
  getModulesByRole,
  getExtraModulesByRole,
  canAccessModule,
  isBoss,
  isRawAdmin,
};
