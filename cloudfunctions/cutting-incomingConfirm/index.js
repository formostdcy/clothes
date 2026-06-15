const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 裁剪 - 来料确认（仅改状态，无库存变更）
 * 关键：先 ensureCollections 避免 -502005
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { _id, cutting_admin_id } = event;

  if (!_id) return { success: false, error: 'ID不能为空' };

  // 关键修复：先幂等创建依赖集合（解决首次部署 -502005）
  await ensureCollections();

  try {
    await db.collection('cutting_incoming_confirm').doc(_id).update({
      data: {
        status: '已确认',
        confirm_time: db.serverDate(),
        updated_at: db.serverDate(),
      },
    });
    return { success: true };
  } catch (e) {
    console.error('裁剪来料确认失败:', e);
    return { success: false, error: '确认失败' };
  }
};

/**
 * 幂等创建依赖集合
 * - 解决首次部署时 -502005 collection not exists
 */
async function ensureCollections() {
  const collections = ['cutting_incoming_confirm', 'notification'];
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
