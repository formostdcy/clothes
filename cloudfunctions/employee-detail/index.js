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
 * 员工 - 员工详情
 * 参数: { id }
 * 返回: { data: { ...employee } }
 */
exports.main = async (event, context) => {
  // 关键修复：服务端 role 校验
  const guard = await requireRole(event, ALLOWED_ROLES);
  if (!guard.ok) return { success: false, error: guard.error };

  const db = cloud.database();
  const { id } = event;
  if (!id) return { success: false, error: '参数错误' };
  try {
    const res = await db.collection('employee').doc(id).get();
    return { success: true, data: res.data };
  } catch (e) {
    console.error('员工详情查询失败:', e);
    return { success: false, error: '查询失败' };
  }
};
