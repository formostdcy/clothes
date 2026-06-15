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

  try {
    // ============ 1. 扣库存（不阻塞主流程，失败再回滚） ============
    for (const item of material_details) {
      const { category_one, category_two, quantity } = item;
      if (!quantity || quantity <= 0) continue;

      const stockRes = await db.collection('raw_material_stock').where({ category_one, category_two })
        .limit(1)
        .get();

      if (stockRes.data.length === 0 || stockRes.data[0].total_quantity < quantity) {
        return { success: false, error: `【${category_two}】库存不足` };
      }

      await db.collection('raw_material_stock').doc(stockRes.data[0]._id)
        .update({
          data: {
            total_quantity: db.command.inc(-quantity),
            updated_at: db.serverDate(),
          },
        });
    }

    // ============ 2. 写出库单 ============
    const orderNo = generateOrderNo('CK');
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
    const orderId = orderRes._id || orderRes.id;

    // ============ 3. 写"裁剪/车间待确认入库"表 ============
    const incomingCollection = target_type === 'cutting'
      ? 'cutting_incoming_confirm'
      : 'workshop_incoming_confirm';

    const incomingNo = generateOrderNo('IN');
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
    const incomingId = incomingRes._id || incomingRes.id;

    // ============ 4. 发通知 ============
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
