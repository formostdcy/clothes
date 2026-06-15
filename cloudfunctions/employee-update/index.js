const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 关键修复：服务端 role 校验（防止越权）
const ALLOWED_ROLES = ['老板'];
async function requireRole(event, allowed) {
  const role = event.current_user_role || event.role;
  if (!role) {
    return { ok: false, error: '未提供用户角色（请通过前端登录态传入 current_user_role）' };
  }
  if (!allowed.includes(role)) {
    return { ok: false, error: `当前角色【${role}】无权调用此接口（仅限：${allowed.join('、')}）` };
  }
  return { ok: true };
}


/**
 * employee-update - update employee info
 */

const crypto = require('crypto');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

exports.main = async (event, context) => {
// 关键修复：先幂等创建依赖集合（解决首次部署 -502005）
await ensureCollections();


  // 关键修复：服务端 role 校验
  const guard = await requireRole(event, ALLOWED_ROLES);
  if (!guard.ok) return { success: false, error: guard.error };

  const db = cloud.database();
  const { _id, name, account, password, role, status } = event;

  if (!_id) {
    return { success: false, error: '员工ID不能为空' };
  }

  const roles = ['原材料管理员', '裁剪管理员', '车间管理员', '成品管理员', '老板'];
  if (role && !roles.includes(role)) {
    return { success: false, error: '角色不合法' };
  }

  try {
    const updateData = {
      updated_at: db.serverDate(),
    };
    if (name) updateData.name = name.trim();
    if (account) updateData.account = account.trim();
    if (password) updateData.password = hashPassword(password);
    if (role) updateData.role = role;
    if (status !== undefined) updateData.status = status;

    await db.collection('employee').doc(_id).update({ data: updateData });
    return { success: true };
  } catch (e) {
    console.error('employee-update error:', e);
    return { success: false, error: '更新失败: ' + (e.message || '未知错误') };
  }
};

/**
 * 幂等创建依赖集合
 * - 解决首次部署时 -502005 collection not exists
 */
async function ensureCollections() {
  const collections = ['employee'];
  for (const name of collections) {
    try {
      await cloud.database().createCollection(name);
      console.log(`[ensureCollections] 已创建集合 ${name}`);
    } catch (e) {
      const msg = (e && (e.errMsg || e.message)) || '';
      if (/already exists|ResourceExists/i.test(msg)) continue;
      console.error(`[ensureCollections] 创建集合 ${name} 失败:`, e);
    }
  }
}

