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
 * 鑰佹澘 - 搴撳瓨棰勮鍒楄〃
 * 瀹氭椂浠诲姟瑙﹀彂锛屾壂鎻忔墍鏈夊師鏉愭枡搴撳瓨
 */

exports.main = async (event, context) => {
  // 关键修复：服务端 role 校验
  const guard = await requireRole(event, ALLOWED_ROLES);
  if (!guard.ok) return { success: false, error: guard.error };

  const db = cloud.database();

  try {
    const res = await db.collection('raw_material_stock') .where({
        total_quantity: db.command.lte(db.command.expr('$warning_threshold')),
        warning_threshold: db.command.gt(0),
      })
      .get();

    return { success: true, data: res.data };
  } catch (e) {
    console.error('搴撳瓨棰勮鏌ヨ澶辫触:', e);
    return { success: false, error: '鏌ヨ澶辫触' };
  }
};
