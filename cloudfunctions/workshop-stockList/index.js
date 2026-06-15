const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 车间 - 辅料库存列表（车间管理员专用）
 *
 * 用于加工单页面读取当前车间管理员自己的辅料库存。
 * 与 raw-stockList 的区别：
 *   - raw-stockList: 查全公司原材料库（仓库）
 *   - workshop-stockList: 查本车间辅料库存
 *
 * 关键：
 *  - 必须按 workshop_admin_id 过滤，否则会把别的车间库存也算进来
 *  - 只返回 category_one='辅料' 的记录
 *
 * 【2026-06-15 修复】
 * - 加 ensureCollections() 幂等创建 workshop_stock 集合
 *   解决首次访问时的 -502005（collection not exists）
 * - 集合为空时返回 { list: [], total: 0 }，前端不会再红框报错
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { workshop_admin_id, page = 1, pageSize = 50 } = event;

  if (!workshop_admin_id) {
    return { success: false, error: '缺少 workshop_admin_id' };
  }

  // ============ 0. 幂等创建依赖集合（解决 -502005） ============
  await ensureCollections();

  try {
    const where = {
      workshop_admin_id,
      category_one: '辅料',
    };

    const res = await db.collection('workshop_stock').where(where)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const countRes = await db.collection('workshop_stock').where(where).count();

    console.log('[workshop-stockList] 查到车间辅料记录数:', res.data.length, 'where:', JSON.stringify(where));

    return {
      success: true,
      data: { list: res.data, total: countRes.total, page, pageSize },
    };
  } catch (e) {
    // 兜底：即便出现 race condition（集合刚被另一个请求删了）也返回空
    console.error('[workshop-stockList] 查询失败:', e);
    if (/not exists|Db or Table not exist/i.test((e && (e.errMsg || e.message)) || '')) {
      return { success: true, data: { list: [], total: 0, page, pageSize } };
    }
    return { success: false, error: '查询失败' };
  }
};

/**
 * 幂等创建 workshop_stock 集合
 * - 失败若是 "ResourceExists"（已存在）则吞掉
 * - 其它失败不抛错，只打日志
 */
async function ensureCollections() {
  const db = cloud.database();
  const collections = ['workshop_stock'];
  for (const name of collections) {
    try {
      await db.createCollection(name);
      console.log(`[ensureCollections] 已创建集合 ${name}`);
    } catch (e) {
      const msg = (e && (e.errMsg || e.message)) || '';
      if (/already exists|ResourceExists/i.test(msg)) {
        // 集合已存在，正常
        continue;
      }
      console.error(`[ensureCollections] 创建集合 ${name} 失败:`, e);
    }
  }
}
