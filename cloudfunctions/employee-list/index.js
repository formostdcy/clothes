// cloudfunctions/employee-list/index.js
// 老板 - 员工列表
// 参数：{ page, pageSize, keyword }
// 返回：{ list, total }

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


exports.main = async (event, context) => {
  // 关键修复：服务端 role 校验
  const guard = await requireRole(event, ALLOWED_ROLES);
  if (!guard.ok) return { success: false, error: guard.error };

  const db = cloud.database();
  const { page = 1, pageSize = 20, keyword = '' } = event;

  try {
    const where = { status: { $ne: -1 } };

    if (keyword) {
      const _ = db.command;
      // 兼容姓名/账号模糊匹配
      const reg = db.RegExp({ regexp: keyword, options: 'i' });
      // 用 $or 命中 name 或 account
      where._ = _.or([
        { name: reg },
        { account: reg },
      ]);
    }

    const countRes = await db.collection('employee').where(where).count();

    const res = await db.collection('employee')
      .where(where)
      .field({ account: true, name: true, role: true, status: true, phone: true, created_at: true })
      .orderBy('created_at', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    return {
      success: true,
      data: { list: res.data || [], total: countRes.total, page, pageSize },
    };
  } catch (e) {
    console.error('[employee-list] 失败:', e);
    return { success: false, error: e.message };
  }
};
