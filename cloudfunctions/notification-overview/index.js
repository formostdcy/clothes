const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * notification-overview - 首页通知概览（合并 unreadCount + todoList）
 *
 * 设计目的：
 *   替换首页 onShow 里的 2 次云函数调用（notification-unreadCount + notification-list）
 *   1 次往返拿回 { unreadCount, todoList }，节省 ~50% 网络延迟。
 *
 * 参数：
 *   - user_id: 当前用户 _id
 *   - role: 当前用户 role
 *   - page (默认 1)
 *   - pageSize (默认 5,首页只显示 5 条)
 *
 * 返回：
 *   { success: true, data: { unreadCount, todoList: [...] } }
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { user_id = '', role = '', page = 1, pageSize = 5 } = event;

  if (!user_id || !role) {
    return { success: false, error: '缺少 user_id 或 role' };
  }

  // 关键修复：先幂等创建依赖集合（解决首次部署 -502005）
  await ensureCollections();

  try {
    // 关键优化：unreadCount 和 todoList 用同一份 .where 条件，
    // 云数据库会把查询计划缓存，复用索引。
    // 同时并发执行 count() 和 get()，而不是顺序执行。
    const baseWhere = db.command.or(
      { receiver_id: user_id },
      { role: role }
    );

    // 并发：未读数 + 最新 5 条
    const [unreadRes, listRes] = await Promise.all([
      db.collection('notification').where(
        db.command.and(
          baseWhere,
          { is_read: 0 }
        )
      ).count(),
      db.collection('notification')
        .where(baseWhere)
        .orderBy('created_at', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get(),
    ]);

    // 只过滤未读的 5 条作为 todoList（首页只需要未读）
    const todoList = (listRes.data || [])
      .filter(item => !item.is_read)
      .map(item => ({
        _id: item._id,
        title: item.title || '',
        content: item.content || '',
        type: item.type || '',
        role: item.role || '',
        receiver_id: item.receiver_id || null,
        related_order_id: item.related_order_id || null,
        is_read: item.is_read || 0,
        created_at: item.created_at,
      }));

    return {
      success: true,
      data: {
        unreadCount: unreadRes.total || 0,
        todoList,
      },
    };
  } catch (e) {
    console.error('[notification-overview] 失败:', e);
    return { success: false, error: '查询失败：' + (e.message || String(e)) };
  }
};

/**
 * 幂等创建依赖集合
 * - 解决首次部署时 -502005 collection not exists
 */
async function ensureCollections() {
  const collections = ['notification'];
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
