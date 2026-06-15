// cloudfunctions/finished-stockRebuildFromHistory/index.js
// 用途：扫描 finished_product_confirm 中所有 status='已入库' 的记录，
//       把每条记录对应的加工单 actual_quantity 累加到 finished_product_stock。
//       用于修复历史 bug（finished-confirmIn 之前取错字段导致库存从未写入）。
// 设计：
//   1) 每条 confirm 独立事务（finished_product_stock 累加 + finished_product_confirm 幂等标记）
//   2) 幂等保护：stock_rebuilt=true 跳过，避免重复累加
//   3) dryRun 只统计不入库；force 忽略幂等；confirmId 只处理单条
//   4) 单条失败不影响其他 confirm（错误收集到 errors）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 关键修复：服务端 role 校验（防止越权）—— 仅老板可触发历史数据重建
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
  // 关键修复：服务端 role 校验（仅老板可调用）
  const guard = await requireRole(event, ALLOWED_ROLES);
  if (!guard.ok) return { success: false, error: guard.error };

  // 关键修复：先幂等创建依赖集合（解决首次部署 -502005）
await ensureCollections();


  const db = cloud.database();
  const _ = db.command;
  const dryRun = !!(event && event.dryRun);   // true=只统计不入库
  const force = !!(event && event.force);      // true=忽略幂等记录
  const confirmId = event && event.confirmId;  // 指定只重算某条
  const batchSize = 100;                       // 单次拉取数量

  const result = {
    scanned: 0,
    rebuilt: 0,
    skipped: 0,
    errors: [],
    details: [],   // 每条 confirm 的处理摘要
  };

  try {
    // 1) 拉取待重算的 confirm 列表（支持单条）
    const where = confirmId ? { _id: confirmId } : { status: '已入库' };
    const res = await db.collection('finished_product_confirm').where(where).limit(batchSize).get();
    const list = res.data || [];
    result.scanned = list.length;

    for (const c of list) {
      try {
        // 幂等：重算过的标记 stock_rebuilt=true，避免二次累加
        if (!force && c.stock_rebuilt) {
          result.skipped += 1;
          result.details.push({ _id: c._id, order_no: c.order_no, action: 'skip', reason: 'already_rebuilt' });
          continue;
        }

        // 2) 查加工单拿 actual_quantity
        if (!c.processing_order_id) {
          result.errors.push({ _id: c._id, error: 'missing processing_order_id' });
          continue;
        }
        const procRes = await db.collection('processing_order').doc(c.processing_order_id).get();
        const proc = procRes.data || {};
        const quantities = proc.actual_quantity || [];

        if (!Array.isArray(quantities) || quantities.length === 0) {
          result.errors.push({ _id: c._id, order_no: c.order_no, error: 'empty actual_quantity' });
          continue;
        }

        const subtotal = [];
        let allSuccess = true;

        if (dryRun) {
          // dryRun 模式：只统计，不入库
          for (const item of quantities) {
            const { size, count } = item;
            const qty = Number(count) || 0;
            if (qty <= 0) continue;
            subtotal.push({
              gender: proc.gender || '',
              style: proc.style || '',
              school: proc.school || '',
              size: size || '',
              qty,
            });
          }
        } else {
          // 正式模式：每条 confirm 独立三阶段事务
          // 阶段 1：分批累加库存（每批独立子事务，失败时已写入的批次会回滚）
          // 阶段 2：成功后写 stock_rebuilt=true
          // 阶段 3：失败时回滚已累加的库存
          const BATCH_SIZE = 5;
          const batches = [];
          for (let i = 0; i < quantities.length; i += BATCH_SIZE) {
            batches.push(quantities.slice(i, i + BATCH_SIZE));
          }

          const writtenBatches = []; // 本条 confirm 已累加的库存（用于回滚）
          let stageError = null;

          try {
            // 阶段 1：分批累加
            for (const batch of batches) {
              const batchSubtotal = [];
              await db.runTransaction(async (transaction) => {
                for (const item of batch) {
                  const { size, count } = item;
                  const qty = Number(count) || 0;
                  if (qty <= 0) continue;

                  const whereStock = {
                    gender: proc.gender || '',
                    style:  proc.style  || '',
                    season: proc.season || '',
                    school: proc.school || '',
                    size: size || '',
                  };

                  const stockRes = await transaction.collection('finished_product_stock')
                    .where(whereStock)
                    .limit(1)
                    .get();

                  if (stockRes.data.length > 0) {
                    const stockId = stockRes.data[0]._id;
                    await transaction.collection('finished_product_stock')
                      .doc(stockId)
                      .update({
                        data: {
                          quantity: _.inc(qty),
                          workshop_admin_id: proc.workshop_admin_id || '',
                          updated_at: db.serverDate(),
                        },
                      });
                    batchSubtotal.push({ ...whereStock, stockId, qty, action: 'inc' });
                  } else {
                    const addRes = await transaction.collection('finished_product_stock').add({
                      data: {
                        ...whereStock,
                        quantity: qty,
                        workshop_admin_id: proc.workshop_admin_id || '',
                        updated_at: db.serverDate(),
                      },
                    });
                    batchSubtotal.push({ ...whereStock, stockId: addRes._id, qty, action: 'add' });
                  }
                }
              });
              writtenBatches.push(...batchSubtotal);
            }

            // 阶段 2：写幂等标记（所有批次成功后）
            await db.collection('finished_product_confirm').doc(c._id).update({
              data: {
                stock_rebuilt: true,
                stock_rebuilt_at: db.serverDate(),
                stock_rebuilt_by: 'finished-stockRebuildFromHistory',
              },
            });
            subtotal.push(...writtenBatches);
          } catch (txErr) {
            stageError = txErr;
            // 阶段 3：回滚已累加的库存
            console.error('[finished-stockRebuildFromHistory] 阶段失败，回滚', writtenBatches.length, '条已累加的库存');
            for (const w of writtenBatches) {
              try {
                if (w.action === 'inc') {
                  await db.collection('finished_product_stock').doc(w.stockId).update({
                    data: { quantity: _.inc(-w.qty), updated_at: db.serverDate() },
                  });
                } else if (w.action === 'add') {
                  await db.collection('finished_product_stock').doc(w.stockId).remove();
                }
              } catch (rollbackErr) {
                console.error('[finished-stockRebuildFromHistory] 回滚单条失败:', w, rollbackErr);
              }
            }
            allSuccess = false;
            result.errors.push({
              _id: c._id,
              order_no: c.order_no,
              error: '事务失败已回滚: ' + (txErr.message || String(txErr)),
              rolledBack: writtenBatches.length,
            });
            continue;
          }
        }

        if (allSuccess) {
          result.rebuilt += 1;
          result.details.push({
            _id: c._id,
            order_no: c.order_no,
            items: subtotal,
            action: dryRun ? 'dry-run' : 'rebuilt',
          });
        } else if (!result.errors.find(e => e._id === c._id)) {
          // 被幂等跳过
          result.skipped += 1;
          result.details.push({ _id: c._id, order_no: c.order_no, action: 'skip', reason: 'concurrent_rebuilt' });
        }
      } catch (e) {
        result.errors.push({ _id: c._id, error: e.message || String(e) });
      }
    }

    return { success: true, dryRun, ...result };
  } catch (e) {
    console.error('重算历史库存失败:', e);
    return { success: false, error: e.message || String(e), ...result };
  }
};

/**
 * 幂等创建依赖集合
 * - 解决首次部署时 -502005 collection not exists
 */
async function ensureCollections() {
  const collections = ['finished_product_confirm', 'processing_order', 'finished_product_stock'];
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


