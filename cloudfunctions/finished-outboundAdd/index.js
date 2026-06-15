const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 成品出库 - 同步扣减两个集合的库存
 *
 * 关键修复：之前只扣 finished_product_stock，但 UI 显示的"库存"实际是
 * processing_order.actual_quantity[].count（订单件数）。
 * 两个集合必须同步扣减，否则下次选同一订单看到的件数不变。
 *
 * 扣减顺序：
 *   阶段 1a：扣 processing_order.actual_quantity[].count（订单件数）
 *   阶段 1b：扣 finished_product_stock.quantity（成品库存）
 *   阶段 2：写成品出库单
 * 任何阶段失败，回滚所有已扣的库存
 */

function generateOrderNo() {
  // 关键：云函数在云端运行，默认是 UTC 时间，需要 +8 小时偏移得到北京时间
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `CC-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}${rand}`;
}

exports.main = async (event, context) => {
  const db = cloud.database();
  const { processing_order_id, outbound_details, destination, photos, creator_id } = event;

  if (!processing_order_id) return { success: false, error: '缺少加工单ID' };
  if (!outbound_details || outbound_details.length === 0) {
    return { success: false, error: '请至少填一个尺码的出库数量' };
  }
  if (!destination) return { success: false, error: '请选择目的地' };

  // 用本地变量跟踪已成功扣减的批次（用于回滚）
  // [{ type: 'orderSize' | 'productStock', id, qty, action: 'dec' | 'add' }]
  const writtenBatches = [];

  // 工具：根据 size 找 actual_quantity 数组里的下标
  function findActualQtyIndex(actualQuantity, size) {
    if (!Array.isArray(actualQuantity)) return -1;
    return actualQuantity.findIndex(a => a && a.size === size);
  }

  // 工具：回滚一个动作
  async function rollbackOne(w) {
    try {
      if (w.type === 'orderSize' && w.action === 'dec') {
        // 恢复加工单 actual_quantity[].count
        const cur = await db.collection('processing_order').doc(w.orderId).get();
        const actualQuantity = cur.data && cur.data.actual_quantity;
        const idx = findActualQtyIndex(actualQuantity, w.size);
        if (idx >= 0) {
          // 用 . 占位保留数组里其他字段
          await db.collection('processing_order').doc(w.orderId).update({
            data: {
              [`actual_quantity.${idx}.count`]: db.command.inc(w.qty),
              updated_at: db.serverDate(),
            },
          });
        }
      } else if (w.type === 'productStock' && w.action === 'dec') {
        await db.collection('finished_product_stock').doc(w.stockId).update({
          data: { quantity: db.command.inc(w.qty), updated_at: db.serverDate() },
        });
      }
    } catch (e) {
      console.error('[rollback] 回滚失败:', w, e);
    }
  }

  // 工具：回滚所有已写入的动作
  async function rollbackAll() {
    for (const w of writtenBatches) {
      await rollbackOne(w);
    }
  }

  try {
    // ============ 阶段 1a：扣减加工单 actual_quantity[].count（订单件数） ============
    // 必须先查一次拿到 actual_quantity 数组下标
    const orderDoc = await db.collection('processing_order').doc(processing_order_id).get();
    if (!orderDoc.data) {
      return { success: false, error: '加工单不存在' };
    }
    const actualQuantity = orderDoc.data.actual_quantity || [];

    // 预校验：每个出库尺码的订单件数是否够
    for (const item of outbound_details) {
      const { size, quantity } = item;
      const qty = Number(quantity) || 0;
      if (qty <= 0) continue;
      const idx = findActualQtyIndex(actualQuantity, size);
      if (idx < 0) {
        return { success: false, error: `订单中没有尺码 ${size} 的数据` };
      }
      const cur = Number(actualQuantity[idx].count) || 0;
      if (cur < qty) {
        return { success: false, error: `订单尺码 ${size} 数量不足，当前 ${cur}，需要 ${qty}` };
      }
    }

    // 真正扣减：用 . 语法更新嵌套数组元素
    // 注意：先收集动作到本地数组，事务成功后再 push 到 writtenBatches
    //      避免事务回滚时数组里有"假成功"的记录，导致 rollbackAll 双倍回滚
    const stage1aBatches = [];
    try {
      await db.runTransaction(async (transaction) => {
        for (const item of outbound_details) {
          const { size, quantity } = item;
          const qty = Number(quantity) || 0;
          if (qty <= 0) continue;
          const idx = findActualQtyIndex(actualQuantity, size);
          await transaction.collection('processing_order').doc(processing_order_id).update({
            data: {
              [`actual_quantity.${idx}.count`]: db.command.inc(-qty),
              updated_at: db.serverDate(),
            },
          });
          stage1aBatches.push({ type: 'orderSize', orderId: processing_order_id, size, qty, action: 'dec' });
        }
      });
      // 事务整体成功（所有 update 都已落地），才记录到全局
      writtenBatches.push(...stage1aBatches);
    } catch (e) {
      console.error('[阶段1a] 扣减订单件数失败:', e);
      // 事务已自动回滚，无需手动 rollback
      return { success: false, error: '扣减订单件数失败：' + (e.message || '未知错误') };
    }

    // ============ 阶段 1b：扣减成品库存 finished_product_stock ============
    const BATCH_SIZE = 5;
    const batches = [];
    for (let i = 0; i < outbound_details.length; i += BATCH_SIZE) {
      batches.push(outbound_details.slice(i, i + BATCH_SIZE));
    }

    let stockFailed = false;
    let stockFailMsg = '';
    let stockFailInfo = null; // 出错时返回的详细信息
    for (const batch of batches) {
      const stage1bBatches = []; // 本批次收集，事务成功后再 push 到全局
      try {
        await db.runTransaction(async (transaction) => {
          for (const item of batch) {
            const { gender, style, season, school, size, quantity } = item;
            const qty = Number(quantity) || 0;
            if (qty <= 0) continue;

            // SKU 五维：gender + style + season + school + size
            const stockRes = await transaction.collection('finished_product_stock')
              .where({ gender, style, season, school, size })
              .limit(1)
              .get();

            if (stockRes.data.length === 0) {
              throw new Error(`SKU[${gender}-${style}-${season}-${school}-${size}]库存不存在`);
            }
            const cur = stockRes.data[0];
            if ((cur.quantity || 0) < qty) {
              // 找到该尺码的订单件数，给出更详细的错误
              const orderIdx = findActualQtyIndex(actualQuantity, size);
              const orderQty = orderIdx >= 0 ? (Number(actualQuantity[orderIdx].count) || 0) : 0;
              const err = new Error(
                `尺码 ${size}：订单件数 ${orderQty}，成品库存 ${cur.quantity || 0}，需要出 ${qty}。` +
                `成品库存不足，请联系管理员核对数据`
              );
              err.code = 'STOCK_INSUFFICIENT';
              err.size = size;
              err.orderQty = orderQty;
              err.stockQty = cur.quantity || 0;
              err.needQty = qty;
              throw err;
            }

            await transaction.collection('finished_product_stock').doc(cur._id)
              .update({
                data: {
                  quantity: db.command.inc(-qty),
                  updated_at: db.serverDate(),
                },
              });
            stage1bBatches.push({ type: 'productStock', stockId: cur._id, qty, action: 'dec' });
          }
        });
        // 事务整体成功（这批所有 update 都已落地），才记录到全局
        writtenBatches.push(...stage1bBatches);
      } catch (batchErr) {
        stockFailed = true;
        stockFailMsg = batchErr.message || '未知错误';
        if (batchErr.code === 'STOCK_INSUFFICIENT') {
          stockFailInfo = {
            size: batchErr.size,
            orderQty: batchErr.orderQty,
            stockQty: batchErr.stockQty,
            needQty: batchErr.needQty,
          };
        }
        break;
      }
    }

    if (stockFailed) {
      console.error('[阶段1b] 扣减成品库存失败，回滚所有:', stockFailMsg);
      // 关键：当前批次 throw 时事务已自动回滚
      // 但之前的批次 + 1a 都已写入 writtenBatches，需要回滚
      await rollbackAll();
      return {
        success: false,
        error: '出库失败已回滚：' + stockFailMsg,
        rolledBack: writtenBatches.length,
        stockFailInfo,
      };
    }

    // ============ 阶段 2：写成品出库单 ============
    let orderId;
    try {
      const orderRes = await db.collection('finished_outbound_order').add({
        data: {
          order_no: generateOrderNo(),
          processing_order_id,
          outbound_details,
          destination,
          photos: photos || [],
          creator_id: creator_id || '',
          status: '已出库',
          created_at: db.serverDate(),
        },
      });
      orderId = orderRes._id || orderRes.id;
    } catch (addErr) {
      console.error('[阶段2] 写出库单失败，回滚所有:', addErr);
      await rollbackAll();
      return { success: false, error: '出库单写入失败已回滚：' + (addErr.message || '未知错误') };
    }

    return {
      success: true,
      data: { _id: orderId },
      batchCount: batches.length,
      deductedOrderSize: true, // 标记：订单件数已扣
      deductedStock: true,     // 标记：成品库存已扣
    };
  } catch (e) {
    console.error('成品出库失败:', e);
    // 这里可能 writtenBatches 里已有部分扣减，但 runTransaction 失败时已通过 rollbackAll 处理
    return { success: false, error: e.message || '出库失败' };
  }
};
