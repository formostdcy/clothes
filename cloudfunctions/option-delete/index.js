const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 关键修复：服务端 role 校验（防止越权）
const ALLOWED_ROLES = ['老板', '原材料管理员'];
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
 * 系统选项 - 删除
 * 入参：{ _id }
 * 返回：{ success: true }
 */
exports.main = async (event, context) => {
// 关键修复：先幂等创建依赖集合（解决首次部署 -502005）
await ensureCollections();


  // 关键修复：服务端 role 校验
  const guard = await requireRole(event, ALLOWED_ROLES);
  if (!guard.ok) return { success: false, error: guard.error };

  const db = cloud.database();
  const { _id } = event;

  if (!_id) {
    return { success: false, error: 'ID不能为空' };
  }

  try {
    // 删除前先确认存在
    const existRes = await db.collection('system_option').doc(_id).get();
    if (!existRes.data) {
      return { success: false, error: '选项不存在' };
    }
    await db.collection('system_option').doc(_id).remove();
    return { success: true };
  } catch (e) {
    console.error('删除选项失败:', e);
    return { success: false, error: '删除失败：' + e.message };
  }
};

/**
 * 幂等创建依赖集合
 * - 解决首次部署时 -502005 collection not exists
 */
async function ensureCollections() {
  const collections = ['system_option'];
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

