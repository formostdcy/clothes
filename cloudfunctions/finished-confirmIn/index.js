// cloudfunctions/finished-confirmIn/index.js
// 成品入库 - 确认入库（最简实现，零事务复杂度）
// 流程：
//   0) ensureCollection - 解决首次部署 -502005
//   1) 读 confirm 记录，拿到 actual_quantity（参数 > confirm > processing_order）
//   2) 遍历 actual_quantity，按 gender+style+school+size 累加 finished_product_stock.quantity
//   3) 更新 confirm 状态为'已入库'
// 幂等：status=已入库 直接跳过
// 失败兜底：任何步骤失败都返回详细错误，前端能看见
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 幂等创建依赖集合（解决首次部署 -502005）
 * 用 add 探测失败的方式触发 createCollection，兼容权限不足的环境
 */
async function ensureCollections() {
  const db = cloud.database();
  const collections = [
    'finished_product_confirm',
    'processing_order',
    'finished_product_stock',
  ];
  for (const name of collections) {
    try {
      // 探测：试着 count 一下
      await db.collection(name).limit(1).count();
    } catch (e) {
      // 不存在则创建
      const msg = (e && (e.errMsg || e.message)) || '';
      if (/collection not exists|Database|not exist/i.test(msg) || msg.includes('-502005')) {
        try {
          await db.createCollection(name);
          console.log(`[ensureCollections] 已创建集合 ${name}`);
        } catch (createErr) {
          const cmsg = (createErr && (createErr.errMsg || createErr.message)) || '';
          if (!/already exists|ResourceExists/i.test(cmsg)) {
            console.error(`[ensureCollections] 创建集合 ${name} 失败:`, createErr);
          }
        }
      } else {
        console.error(`[ensureCollections] 探测集合 ${name} 失败:`, e);
      }
    }
  }
}

exports.main = async (event, context) => {
  // 最外层 try：兜住所有未捕获异常，让前端永远能拿到结构化错误
  try {
    return await _main(event, context);
  } catch (e) {
    console.error('[finished-confirmIn] 顶层兜底失败:', e);
    return {
      success: false,
      error: '云函数未捕获异常：' + (e.message || String(e)),
      stack: (e && e.stack) ? String(e.stack).split('\n').slice(0, 5).join('\n') : '',
    };
  }
};

async function _main(event, context) {
  const db = cloud.database();
  const _ = db.command;
  const { _id, finished_admin_id, actual_quantity, force = false } = event;

  console.log('[finished-confirmIn] 入参:', JSON.stringify(event));

  if (!_id) return { success: false, error: 'ID不能为空' };

  // ============ 步骤 0：确保依赖集合存在 ============
  try {
    await ensureCollections();
  } catch (ensureErr) {
    console.error('[finished-confirmIn] ensureCollections 失败:', ensureErr);
    return { success: false, error: '依赖集合创建失败：' + (ensureErr.message || ensureErr) };
  }

  try {
    // ============ 步骤 1：读 confirm ============
    const confirmRes = await db.collection('finished_product_confirm').doc(_id).get();
    if (!confirmRes.data) {
      return { success: false, error: '确认单不存在' };
    }
    const confirm = confirmRes.data;
    console.log('[finished-confirmIn] confirm:', JSON.stringify({
      _id: confirm._id,
      status: confirm.status,
      stock_rebuilt: confirm.stock_rebuilt,
      processing_order_id: confirm.processing_order_id,
      gender: confirm.gender,
      style: confirm.style,
      season: confirm.season,
      school: confirm.school,
      actual_quantity_count: (confirm.actual_quantity || []).length,
    }));

    // 幂等检查
    if (!force && confirm.status === '已入库') {
      return {
        success: true,
        data: { rebuilt: false, skipped: true, reason: 'already_confirmed' },
      };
    }

    // force=true 时：先把状态重置回'待确认'，再走正常流程
    if (force && confirm.status === '已入库') {
      console.log('[finished-confirmIn] force=true, 重置状态后重试');
      // 关键修复：force 重试场景下，stock_rebuilt=true 表示之前已经成功累加过库存，
      // 此时再 force 累加会导致双倍入库；必须先扣除"已累加部分"，再走正常流程。
      if (confirm.stock_rebuilt === true) {
        console.log('[finished-confirmIn] force=true 且 stock_rebuilt=true，先回滚已累加库存');
        // 拿到已入库的件数（confirm.actual_quantity 已被写为 validQuantities）
        const rollbackQtys = (confirm.actual_quantity || [])
          .map(q => ({ size: (q && q.size != null) ? String(q.size) : '', count: Number(q && q.count) || 0 }))
          .filter(q => q.count > 0);
        for (const item of rollbackQtys) {
          const { size, count: qty } = item;
          const whereStock = { gender, style, season, school, size };
          try {
            const stockRes = await db.collection('finished_product_stock').where(whereStock).limit(1).get();
            if (stockRes.data && stockRes.data.length > 0) {
              const stockId = stockRes.data[0]._id;
              const curQty = Number(stockRes.data[0].quantity) || 0;
              if (curQty >= qty) {
                // 库存足够，直接扣回
                await db.collection('finished_product_stock').doc(stockId).update({
                  data: { quantity: _.inc(-qty), updated_at: db.serverDate() },
                });
              } else if (curQty > 0) {
                // 库存不足但还有，扣到 0（理论不应发生，记日志）
                console.warn(`[finished-confirmIn] force 回滚: ${JSON.stringify(whereStock)} 库存 ${curQty} < ${qty}，扣到 0`);
                await db.collection('finished_product_stock').doc(stockId).update({
                  data: { quantity: 0, updated_at: db.serverDate() },
                });
              } else {
                // 库存已为 0（被人工/其它流程清空），不扣
                console.warn(`[finished-confirmIn] force 回滚: ${JSON.stringify(whereStock)} 库存已为 0，跳过`);
              }
            }
          } catch (e) {
            console.error('[finished-confirmIn] force 回滚库存失败:', whereStock, e);
          }
        }
      }
      try {
        await db.collection('finished_product_confirm').doc(_id).update({
          data: {
            status: '待确认',
            stock_rebuilt: false,
            stock_rebuilt_at: null,
            stock_rebuilt_by: '',
            updated_at: db.serverDate(),
            retry_count: (confirm.retry_count || 0) + 1,
            last_retry_at: db.serverDate(),
          },
        });
      } catch (e) {
        return { success: false, error: '重置状态失败：' + (e.message || String(e)) };
      }
    }

    // ============ 步骤 2：确定 actual_quantity 来源 ============
    let quantities = [];
    if (Array.isArray(actual_quantity) && actual_quantity.length > 0) {
      quantities = actual_quantity;
      console.log('[finished-confirmIn] actual_quantity 来自参数');
    } else if (Array.isArray(confirm.actual_quantity) && confirm.actual_quantity.length > 0) {
      quantities = confirm.actual_quantity;
      console.log('[finished-confirmIn] actual_quantity 来自 confirm');
    } else if (confirm.processing_order_id) {
      // fallback：拉加工单
      try {
        const procRes = await db.collection('processing_order').doc(confirm.processing_order_id).get();
        if (procRes.data && Array.isArray(procRes.data.actual_quantity) && procRes.data.actual_quantity.length > 0) {
          quantities = procRes.data.actual_quantity;
          console.log('[finished-confirmIn] actual_quantity 来自 processing_order');
        }
      } catch (e) {
        console.error('[finished-confirmIn] 拉加工单失败:', e);
      }
    }

    if (!quantities || quantities.length === 0) {
      return { success: false, error: '确认单、加工单、参数三处都找不到 actual_quantity 数据' };
    }

    // 过滤掉 count<=0 的项
    const validQuantities = quantities
      .map(q => ({
        size: (q && q.size != null) ? String(q.size) : '',
        count: Number(q && q.count) || 0,
      }))
      .filter(q => q.count > 0);

    if (validQuantities.length === 0) {
      return { success: false, error: '所有件数均为 0，请检查数据' };
    }

    console.log('[finished-confirmIn] validQuantities:', JSON.stringify(validQuantities));

    // ============ 步骤 3：确定 SKU 五元组（gender+style+season+school+size）==========
    const gender = confirm.gender || '';
    const style  = confirm.style  || '';
    const season = confirm.season || '';
    const school = confirm.school || '';
    const workshopAdminId = confirm.workshop_admin_id || '';

    if (!gender || !style || !school) {
      console.warn('[finished-confirmIn] SKU 字段缺失:', { gender, style, season, school });
    }

    // ============ 步骤 4：逐条累加库存 ============
    const writtenBatches = []; // [{ stockId, qty, action }]
    const errors = [];

    for (const item of validQuantities) {
      const { size, count: qty } = item;
      const whereStock = { gender, style, season, school, size };

      try {
        // 查现有库存记录
        const stockRes = await db.collection('finished_product_stock').where(whereStock).limit(1).get();

        if (stockRes.data && stockRes.data.length > 0) {
          const stockId = stockRes.data[0]._id;
          await db.collection('finished_product_stock').doc(stockId).update({
            data: {
              quantity: _.inc(qty),
              workshop_admin_id: workshopAdminId,
              updated_at: db.serverDate(),
            },
          });
          writtenBatches.push({ stockId, qty, action: 'inc' });
          console.log(`[finished-confirmIn] 累加: ${JSON.stringify(whereStock)} +${qty}`);
        } else {
          const addRes = await db.collection('finished_product_stock').add({
            data: {
              ...whereStock,
              quantity: qty,
              workshop_admin_id: workshopAdminId,
              created_at: db.serverDate(),
              updated_at: db.serverDate(),
            },
          });
          writtenBatches.push({ stockId: addRes._id, qty, action: 'add' });
          console.log(`[finished-confirmIn] 新增: ${JSON.stringify(whereStock)} =${qty}`);
        }
      } catch (stockErr) {
        errors.push({
          where: whereStock,
          qty,
          err: stockErr.message || String(stockErr),
        });
        console.error(`[finished-confirmIn] SKU ${JSON.stringify(whereStock)} 失败:`, stockErr);
      }
    }

    if (errors.length > 0) {
      // 部分失败：回滚已写入的 + 不更新状态
      console.error('[finished-confirmIn] 部分失败，回滚', writtenBatches.length, '条');
      for (const w of writtenBatches) {
        try {
          if (w.action === 'inc') {
            await db.collection('finished_product_stock').doc(w.stockId).update({
              data: { quantity: _.inc(-w.qty), updated_at: db.serverDate() },
            });
          } else if (w.action === 'add') {
            await db.collection('finished_product_stock').doc(w.stockId).remove();
          }
        } catch (rbErr) {
          console.error('[finished-confirmIn] 回滚失败:', w, rbErr);
        }
      }
      return {
        success: false,
        error: '部分库存写入失败已回滚：' + JSON.stringify(errors[0]),
        errors,
        rolledBack: writtenBatches.length,
      };
    }

    // ============ 步骤 5：更新 confirm 状态 ============
    try {
      await db.collection('finished_product_confirm').doc(_id).update({
        data: {
          status: '已入库',
          confirm_time: db.serverDate(),
          updated_at: db.serverDate(),
          stock_rebuilt: true,
          stock_rebuilt_at: db.serverDate(),
          stock_rebuilt_by: finished_admin_id || '',
          actual_quantity: validQuantities,
        },
      });
    } catch (statusErr) {
      // 状态更新失败：库存已写入，要回滚
      console.error('[finished-confirmIn] 状态更新失败，回滚库存');
      for (const w of writtenBatches) {
        try {
          if (w.action === 'inc') {
            await db.collection('finished_product_stock').doc(w.stockId).update({
              data: { quantity: _.inc(-w.qty), updated_at: db.serverDate() },
            });
          } else if (w.action === 'add') {
            await db.collection('finished_product_stock').doc(w.stockId).remove();
          }
        } catch (rbErr) {
          console.error('[finished-confirmIn] 状态回滚失败:', w, rbErr);
        }
      }
      return {
        success: false,
        error: '状态更新失败已回滚：' + (statusErr.message || String(statusErr)),
        rolledBack: writtenBatches.length,
      };
    }

    console.log('[finished-confirmIn] 入库成功 writtenCount=', writtenBatches.length);
    return {
      success: true,
      data: { rebuilt: true, skipped: false, writtenCount: writtenBatches.length },
    };
  } catch (e) {
    console.error('[finished-confirmIn] 顶层失败:', e);
    return { success: false, error: e.message || '入库失败' };
  }
};
