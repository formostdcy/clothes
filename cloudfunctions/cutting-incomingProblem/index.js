const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 裁剪 - 来料有问题反馈
 * 关键：先 ensureCollections 避免 -502005
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { _id, problem_desc } = event;

  if (!_id) return { success: false, error: 'ID不能为空' };
  if (!problem_desc || !problem_desc.trim()) return { success: false, error: '问题描述不能为空' };
  const trimmedDesc = problem_desc.trim();

  // 关键修复：先幂等创建依赖集合（解决首次部署 -502005）
  await ensureCollections();

  try {
    await db.collection('cutting_incoming_confirm').doc(_id).update({
      data: {
        status: '有问题',
        problem_desc: trimmedDesc,
        updated_at: db.serverDate(),
      },
    });

    await db.collection('notification').add({
      data: {
        receiver_id: null,
        role: '老板',
        type: 'cutting_problem',
        title: '原料入库有问题',
        content: `裁剪管理员反馈原料入库有问题：${trimmedDesc}`,
        related_order_id: _id,
        is_read: 0,
        created_at: db.serverDate(),
      },
    });

    return { success: true };
  } catch (e) {
    console.error('原料入库问题反馈失败:', e);
    return { success: false, error: '操作失败' };
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
