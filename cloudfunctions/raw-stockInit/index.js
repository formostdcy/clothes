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
 * 原材料 - 库存初始化
 * 用途：老板在"系统设置 → 库存初始化"中调用
 * 模式 1：clear=true 时，把所有库存 total_quantity 置为 0（保留文档结构）
 * 模式 2：传入 items[] 时，按 (category_one+category_two) upsert 库存
 */

exports.main = async (event, context) => {
  // 关键修复：服务端 role 校验
  const guard = await requireRole(event, ALLOWED_ROLES);
  if (!guard.ok) return { success: false, error: guard.error };

  const db = cloud.database();
  const { items, clear } = event;

  // 关键修复：先幂等创建依赖集合（解决首次部署 -502005）
  await ensureCollections();

  try {
    // 模式 1：传入 clear=true，清空所有库存（包入事务保证原子性）
    if (clear === true) {
      // 关键修复：用 runTransaction 把整个 clear 流程包起来
      // 云函数 runTransaction 一次最多 20 个写操作，所以 1000 条要分批事务
      const BATCH_TX_SIZE = 20; // 单事务内最大写操作数
      const PAGE_SIZE = 1000;
      let totalCleared = 0;

      let lastId = null;
      let hasMore = true;
      while (hasMore) {
        // 分页查询（用 _id 升序 + 断点续查）
        const query = lastId
          ? { _id: db.command.gt(lastId) }
          : {};
        const listRes = await db.collection('raw_material_stock')
          .where(query)
          .orderBy('_id', 'asc')
          .limit(PAGE_SIZE)
          .get();
        const items = listRes.data || [];
        if (items.length === 0) break;

        // 把这一页再分批事务
        for (let i = 0; i < items.length; i += BATCH_TX_SIZE) {
          const subBatch = items.slice(i, i + BATCH_TX_SIZE);
          try {
            await db.runTransaction(async transaction => {
              for (const item of subBatch) {
                await transaction.collection('raw_material_stock').doc(item._id).update({
                  data: { total_quantity: 0, updated_at: db.serverDate() }
                });
              }
            });
            totalCleared += subBatch.length;
          } catch (txErr) {
            console.error('[raw-stockInit] clear 子批事务失败:', txErr);
            return {
              success: false,
              error: '清空库存失败（已清空 ' + totalCleared + ' 条，剩余批次失败）：' + (txErr.message || '未知错误'),
              clearedBeforeFail: totalCleared,
            };
          }
        }
        lastId = items[items.length - 1]._id;
        if (items.length < PAGE_SIZE) {
          hasMore = false;
        }
      }
      return { success: true, data: { cleared: totalCleared } };
    }

    // 模式 2：传入 items 数组，初始化/更新每条
    if (!items || items.length === 0) {
      return { success: false, error: '请传入 items 数组或 clear=true' };
    }

    await db.runTransaction(async (transaction) => {
      for (const item of items) {
        const { category_one, category_two, total_quantity, unit, warning_threshold } = item;

        const stockRes = await transaction.collection('raw_material_stock') .where({ category_one, category_two })
          .limit(1)
          .get();

        if (stockRes.data.length > 0) {
          await transaction.collection('raw_material_stock')
            .doc(stockRes.data[0]._id)
            .update({
              data: {
                total_quantity,
                unit: unit || (category_one === '布料' ? '米' : '个'),
                warning_threshold: warning_threshold || 0,
                updated_at: db.serverDate(),
              },
            });
        } else {
          await transaction.collection('raw_material_stock').add({
            data: {
              category_one,
              category_two,
              total_quantity,
              unit: unit || (category_one === '布料' ? '米' : '个'),
              warning_threshold: warning_threshold || 0,
              updated_at: db.serverDate(),
            },
          });
        }
      }
    });

    return { success: true };
  } catch (e) {
    console.error('原材料库存初始化失败:', e);
    return { success: false, error: e.message || '库存初始化失败' };
  }
};

/**
 * 幂等创建依赖集合
 */
async function ensureCollections() {
  const collections = ['raw_material_stock'];
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
