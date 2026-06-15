const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 通知 - 标记已读
 * 关键：先 ensureCollections 避免 -502005
 * 关键修复：先验证当前用户是 receiver，否则禁止标记
 *  - 若 receiver_id 有值：必须是当前用户 _id
 *  - 若 receiver_id 为空：必须 role 匹配当前用户 role
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { _id, current_user_id, current_user_role } = event;

  if (!_id) return { success: false, error: '通知ID不能为空' };
  if (!current_user_id) return { success: false, error: '缺少当前用户身份' };

  // 关键修复：先幂等创建依赖集合（解决首次部署 -502005）
  await ensureCollections();

  try {
    // 先查消息，校验权限
    const notifRes = await db.collection('notification').doc(_id).get();
    if (!notifRes.data) {
      return { success: false, error: '通知不存在' };
    }
    const notif = notifRes.data;

    // 关键修复：权限校验 - 防止员工 A 标记员工 B 的消息
    const isOwnerById = notif.receiver_id && String(notif.receiver_id) === String(current_user_id);
    const isBroadcastToRole = !notif.receiver_id && notif.role && current_user_role && (notif.role === current_user_role);
    const isBroadcastToBoss = !notif.receiver_id && notif.role === '老板' && current_user_role === '老板';
    if (!isOwnerById && !isBroadcastToRole && !isBroadcastToBoss) {
      return { success: false, error: '无权操作该通知' };
    }

    await db.collection('notification').doc(_id).update({
      data: { is_read: 1, read_at: db.serverDate() },
    });
    return { success: true };
  } catch (e) {
    console.error('标记已读失败:', e);
    return { success: false, error: '操作失败' };
  }
};

/**
 * 幂等创建依赖集合
 * - 解决首次部署时 -502005 collection not exists
 */
async function ensureCollections() {
  const collections = ['notification', 'employee'];
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
