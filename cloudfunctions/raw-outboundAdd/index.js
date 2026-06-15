const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 原材料 - 出库/领料
 *
 * 业务流程：
 * - target_type=cutting：
 *   - 写 raw_outbound_order（待确认）+ cutting_incoming_confirm（裁剪待确认入库）
 *   - 发通知给 target_admin_id
 *
 * - target_type=workshop：
 *   - 写 raw_outbound_order（待确认）+ workshop_incoming_confirm（车间待确认入库）
 *   - 发通知给 target_admin_id
 *
 * 注意：原代码有事务，但事务里同时写两张表容易出问题（事务回滚会全部回滚）。
 *       为了简单可靠，改为：先扣库存 → 写出库单 → 写待确认表 → 发通知
 *       不使用事务（云开发 add 是自动成功的，单步失败概率极低）
 */

function generateOrderNo(prefix) {
  // 关键：云函数在云端运行，默认是 UTC 时间，需要 +8 小时偏移得到北京时间
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `${prefix}-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}${rand}`;
}

exports.main = async (event, context) => {
// 关键修复：先幂等创建依赖集合（解决首次部署 -502005）
await ensureCollections();


  const db = cloud.database();
  const { material_details, target_type, target_admin_id, photos, remark, creator_id, creator_name } = event;

  // ============ 参数校验 ============
  if (!material_details || material_details.length === 0) {
    return { success: false, error: '请至少添加一种物料' };
  }
  if (!target_type || !['cutting', 'workshop'].includes(target_type)) {
    return { success: false, error: '目标类型必须是 cutting 或 workshop' };
  }
  if (!target_admin_id) {
    return { success: false, error: '请选择领料人' };
  }
  if (!creator_id) {
    return { success: false, error: '缺少录单人' };
  }

  // 用本地变量跟踪已成功扣减的库存（用于回滚）
  const writtenStocks = []; // [{ stockId, qty, action: 'dec' | 'add' }]

  try {
    // ============ 阶段 1：分批扣减库存 ============
    // 按 5 个物料/批拆分事务（避免 20 文档限制）
    const BATCH_SIZE = 5;
    const stockBatches = [];
    for (let i = 0; i < material_details.length; i += BATCH_SIZE) {
      stockBatches.push(material_details.slice(i, i + BATCH_SIZE));
    }

    let stage1Error = null;
    let failedItem = null;
    for (const batch of stockBatches) {
      const batchSubtotal = [];
      try {
        await db.runTransaction(async (transaction) => {
          // 1.1 预校验 + 1.2 扣库存（合并到一个事务中）
          for (const item of batch) {
            const { category_one, category_two, quantity } = item;
            if (!quantity || quantity <= 0) continue;

            const stockRes = await transaction.collection('raw_material_stock')
              .where({ category_one, category_two })
              .limit(1)
              .get();

            if (stockRes.data.length === 0) {
              throw new Error(`【${category_two}】库存不存在`);
            }
            const cur = stockRes.data[0];
            if ((cur.total_quantity || 0) < quantity) {
              throw new Error(`【${category_two}】库存不足，当前 ${cur.total_quantity || 0}，需要 ${quantity}`);
            }

            await transaction.collection('raw_material_stock').doc(cur._id)
              .update({
                data: {
                  total_quantity: db.command.inc(-quantity),
                  updated_at: db.serverDate(),
                },
              });
            batchSubtotal.push({ stockId: cur._id, qty: quantity, action: 'dec' });
          }
        });
        writtenStocks.push(...batchSubtotal);
      } catch (batchErr) {
        stage1Error = batchErr;
        failedItem = batch[0];
        break;
      }
    }

    // ============ 阶段 1 失败：回滚 ============
    if (stage1Error) {
      console.error('[raw-outboundAdd] 阶段 1 失败，回滚已扣减的', writtenStocks.length, '条库存');
      for (const w of writtenStocks) {
        try {
          if (w.action === 'dec') {
            await db.collection('raw_material_stock').doc(w.stockId).update({
              data: { total_quantity: db.command.inc(w.qty), updated_at: db.serverDate() },
            });
          }
        } catch (rollbackErr) {
          console.error('[raw-outboundAdd] 回滚单条失败:', w, rollbackErr);
        }
      }
      return {
        success: false,
        error: '扣库存失败已回滚：' + (stage1Error.message || '未知错误'),
        rolledBack: writtenStocks.length,
        failedItem: failedItem ? `${failedItem.category_one}-${failedItem.category_two}` : null,
      };
    }

    // ============ 阶段 2：写 raw_outbound_order 出库单 ============
    let orderId, orderNo;
    try {
      orderNo = generateOrderNo('CK');
      const orderRes = await db.collection('raw_outbound_order').add({
        data: {
          order_no: orderNo,
          creator_id,
          creator_name: creator_name || '',
          target_type,
          target_admin_id,
          material_details,
          photos: photos || [],
          remark: remark || '',
          status: '待确认',
          created_at: db.serverDate(),
        },
      });
      orderId = orderRes._id || orderRes.id;
    } catch (addErr) {
      // 出库单写入失败：必须回滚库存！
      console.error('[raw-outboundAdd] 阶段 2 写单失败，回滚已扣减的', writtenStocks.length, '条库存');
      for (const w of writtenStocks) {
        try {
          if (w.action === 'dec') {
            await db.collection('raw_material_stock').doc(w.stockId).update({
              data: { total_quantity: db.command.inc(w.qty), updated_at: db.serverDate() },
            });
          }
        } catch (rollbackErr) {
          console.error('[raw-outboundAdd] 阶段 2 回滚失败:', w, rollbackErr);
        }
      }
      return {
        success: false,
        error: '出库单写入失败已回滚：' + (addErr.message || '未知错误'),
        rolledBack: writtenStocks.length,
      };
    }

    // ============ 阶段 3：写 incoming 待确认表 ============
    let incomingId, incomingNo, incomingCollection;
    try {
      incomingCollection = target_type === 'cutting'
        ? 'cutting_incoming_confirm'
        : 'workshop_incoming_confirm';
      incomingNo = generateOrderNo('IN');
      const incomingRes = await db.collection(incomingCollection).add({
        data: {
          order_no: incomingNo,
          source_type: 'raw_outbound',
          source_order_id: orderId,
          creator_id,
          creator_name: creator_name || '',
          target_admin_id,
          material_details,
          photos: photos || [],
          remark: remark || '',
          status: '待确认',
          created_at: db.serverDate(),
        },
      });
      incomingId = incomingRes._id || incomingRes.id;
    } catch (addErr) {
      // incoming 写入失败：必须回滚出库单 + 库存！
      console.error('[raw-outboundAdd] 阶段 3 incoming 失败，回滚');
      // 1) 回滚库存
      for (const w of writtenStocks) {
        try {
          if (w.action === 'dec') {
            await db.collection('raw_material_stock').doc(w.stockId).update({
              data: { total_quantity: db.command.inc(w.qty), updated_at: db.serverDate() },
            });
          }
        } catch (rollbackErr) {
          console.error('[raw-outboundAdd] 阶段 3 回滚库存失败:', w, rollbackErr);
        }
      }
      // 2) 删除已写的出库单
      try {
        await db.collection('raw_outbound_order').doc(orderId).remove();
      } catch (delErr) {
        console.error('[raw-outboundAdd] 阶段 3 删除出库单失败:', delErr);
      }
      return {
        success: false,
        error: '待确认单写入失败已回滚：' + (addErr.message || '未知错误'),
        rolledBack: writtenStocks.length,
      };
    }

    // ============ 阶段 4：发通知（失败不影响主流程） ============
    try {
      await db.collection('notification').add({
        data: {
          receiver_id: target_admin_id,
          role: target_type === 'cutting' ? '裁剪管理员' : '车间管理员',
          type: target_type === 'cutting' ? 'cutting_incoming' : 'workshop_incoming',
          title: target_type === 'cutting' ? '您有新的裁剪待确认入库' : '您有新的车间待确认入库',
          content: `${creator_name || '有'}人出库了 ${(material_details || []).length} 种物料，请确认入库`,
          related_order_id: incomingId,
          is_read: 0,
          created_at: db.serverDate(),
        },
      });
    } catch (e) {
      console.error('发通知失败:', e);
    }

    return {
      success: true,
      data: {
        order_id: orderId,
        order_no: orderNo,
        incoming_id: incomingId,
        incoming_no: incomingNo,
        incoming_collection: incomingCollection,
      },
    };
  } catch (e) {
    console.error('原材料出库失败:', e);
    return { success: false, error: e.message || '出库失败' };
  }
};

/**
 * 幂等创建依赖集合
 * - 解决首次部署时 -502005 collection not exists
 */
async function ensureCollections() {
  const collections = ['raw_outbound_order', 'cutting_incoming_confirm', 'workshop_incoming_confirm', 'raw_material_stock', 'notification'];
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

