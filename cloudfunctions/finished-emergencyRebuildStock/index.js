// cloudfunctions/finished-emergencyRebuildStock/index.js
// 成品库存 - 应急重建
// 用途：成品管理员点击"确认入库"后，库存没存进去时，调用此函数一键补齐
// 工作原理：
//   1) 遍历 finished_product_confirm 集合所有 status='已入库' 的记录
//   2) 对每条记录，按 actual_quantity 累加到 finished_product_stock
//   3) 累加时检查"是否已经处理过"（用 stock_rebuilt 标记）
// 参数：
//   - force: true 时强制重算（包括 stock_rebuilt=true 的）
//   - dryRun: true 时只返回预览，不实际写入
// 返回：{ success, summary: { rebuilt, skipped, failed, total } }
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

async function ensureCollections() {
  const db = cloud.database();
  const names = ['finished_product_confirm', 'processing_order', 'finished_product_stock'];
  for (const name of names) {
    try {
      await db.collection(name).limit(1).count();
    } catch (e) {
      const msg = (e && (e.errMsg || e.message)) || '';
      if (/not exist|not exists|Database|-502005/i.test(msg)) {
        try {
          await db.createCollection(name);
        } catch (ce) {
          const cmsg = (ce && (ce.errMsg || ce.message)) || '';
          if (!/already exists|ResourceExists/i.test(cmsg)) {
            console.error(`[ensureCollections] 创建 ${name} 失败:`, ce);
          }
        }
      }
    }
  }
}

exports.main = async (event, context) => {
  const { force = false, dryRun = false, onlyId = null, reset = false } = event;
  console.log('[emergencyRebuildStock] 入参:', JSON.stringify({ force, dryRun, onlyId, reset }));

  await ensureCollections();

  const db = cloud.database();
  const _ = db.command;
  const summary = { scanned: 0, rebuilt: 0, skipped: 0, failed: 0, total: 0, details: [] };

  try {
    // 1) 构造 where
    const where = {};
    if (onlyId) {
      where._id = onlyId;
    } else if (!reset) {
      // 默认重建"已入库但 stock_rebuilt 标记不对"的（重算）
      where.status = _.in(['已入库', '待确认']);
    }

    // 2) 分页拉
    const pageSize = 100;
    let page = 1;
    let hasMore = true;
    const all = [];

    while (hasMore) {
      let res;
      try {
        res = await db.collection('finished_product_confirm')
          .where(where)
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get();
      } catch (e) {
        // orderBy 失败兜底
        res = await db.collection('finished_product_confirm')
          .where(where)
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get();
      }
      all.push(...(res.data || []));
      hasMore = (res.data || []).length === pageSize;
      page++;
      if (page > 100) break; // 安全上限
    }

    summary.scanned = all.length;
    console.log(`[emergencyRebuildStock] 扫到 ${all.length} 条 confirm 记录`);

    // 3) 逐条处理
    for (const c of all) {
      summary.total += 1;

      // 跳过已正确入库的
      if (!force && !reset && c.status === '已入库' && c.stock_rebuilt === true) {
        summary.skipped += 1;
        continue;
      }

      // reset=true 时重置 stock_rebuilt 标记
      if (reset && c.stock_rebuilt === true) {
        if (!dryRun) {
          try {
            await db.collection('finished_product_confirm').doc(c._id).update({
              data: { stock_rebuilt: false, updated_at: db.serverDate() },
            });
          } catch (e) {
            console.error('[emergencyRebuildStock] 重置标记失败:', c._id, e);
          }
        }
        continue;
      }

      // 拿 actual_quantity
      let quantities = [];
      if (Array.isArray(c.actual_quantity) && c.actual_quantity.length > 0) {
        quantities = c.actual_quantity;
      } else if (c.processing_order_id) {
        try {
          const procRes = await db.collection('processing_order').doc(c.processing_order_id).get();
          if (procRes.data && Array.isArray(procRes.data.actual_quantity)) {
            quantities = procRes.data.actual_quantity;
          }
        } catch (e) {}
      }

      const validQuantities = quantities
        .map(q => ({ size: (q && q.size != null) ? String(q.size) : '', count: Number(q && q.count) || 0 }))
        .filter(q => q.count > 0);

      if (validQuantities.length === 0) {
        summary.skipped += 1;
        summary.details.push({ _id: c._id, order_no: c.order_no, action: 'skip', reason: '无有效件数' });
        continue;
      }

      const gender = c.gender || '';
      const style  = c.style  || '';
      const season = c.season || '';
      const school = c.school || '';
      const workshopAdminId = c.workshop_admin_id || '';

      if (dryRun) {
        summary.details.push({
          _id: c._id,
          order_no: c.order_no,
          action: 'preview',
          items: validQuantities,
          where: { gender, style, season, school },
        });
        summary.rebuilt += 1;
        continue;
      }

      // 实际累加（SKU 五维：gender+style+season+school+size）
      let success = true;
      const errLog = [];
      for (const item of validQuantities) {
        const { size, count: qty } = item;
        const whereStock = { gender, style, season, school, size };
        try {
          const stockRes = await db.collection('finished_product_stock').where(whereStock).limit(1).get();
          if (stockRes.data && stockRes.data.length > 0) {
            await db.collection('finished_product_stock').doc(stockRes.data[0]._id).update({
              data: { quantity: _.inc(qty), workshop_admin_id: workshopAdminId, updated_at: db.serverDate() },
            });
          } else {
            await db.collection('finished_product_stock').add({
              data: { ...whereStock, quantity: qty, workshop_admin_id: workshopAdminId, created_at: db.serverDate(), updated_at: db.serverDate() },
            });
          }
        } catch (e) {
          success = false;
          errLog.push({ where: whereStock, err: e.message || String(e) });
        }
      }

      if (success) {
        try {
          await db.collection('finished_product_confirm').doc(c._id).update({
            data: {
              stock_rebuilt: true,
              stock_rebuilt_at: db.serverDate(),
              stock_rebuilt_by: 'emergencyRebuildStock',
              updated_at: db.serverDate(),
            },
          });
        } catch (e) {
          console.error('[emergencyRebuildStock] 写幂等标记失败:', c._id, e);
        }
        summary.rebuilt += 1;
        summary.details.push({ _id: c._id, order_no: c.order_no, action: 'rebuilt' });
      } else {
        summary.failed += 1;
        summary.details.push({ _id: c._id, order_no: c.order_no, action: 'failed', errors: errLog });
      }
    }

    return { success: true, summary };
  } catch (e) {
    console.error('[emergencyRebuildStock] 顶层失败:', e);
    return { success: false, error: e.message || '重建失败', summary };
  }
};
