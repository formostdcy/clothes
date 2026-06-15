const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 车间 - 加工单提交
 *
 * 关键修复：
 *  1. 辅料库存从「车间辅料库 workshop_stock」扣，不再从「原材料库 raw_material_stock」扣
 *     - 原材料库 → 出库 → 车间确认入库时已转入 workshop_stock
 *     - 车间新建生产单时只能消耗车间自己的辅料
 *  2. 用 db.runTransaction 防止并发扣成负数
 *  3. 库存不足时返回明确错误，不写加工单
 *  4. 写 processing_order 失败时由事务自动回滚库存
 *  5. 同一辅料可能被多次合并（同名合并扣减）
 *
 * 业务流程：
 *   1) 事务开启
 *   2) 校验每项辅料在当前车间库存是否充足
 *   3) 扣减车间辅料库存
 *   4) 写 processing_order
 *   5) 写 cutting_order 终态
 *   6) 事务提交
 *   7) 发通知
 */

function generateOrderNo() {
  // 关键：云函数在云端运行，默认是 UTC 时间，需要 +8 小时偏移得到北京时间
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `JG-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCMinutes())}${rand}`;
}

exports.main = async (event, context) => {
  const db = cloud.database();
  const _ = db.command;
  const {
    source_type, // cutting=裁剪源, workshop=车间源
    workshop_confirm_id,
    workshop_incoming_confirm_id,
    workshop_admin_id, // 当前车间管理员 _id，用于定位该车间的辅料库存
    plan_quantity,
    actual_quantity,
    loss_rate,
    accessory_usage,
    gender,
    style,
    school,
  } = event;

  if (!source_type || !['cutting', 'workshop'].includes(source_type)) {
    return { success: false, error: '来源类型必须为 cutting 或 workshop' };
  }
  if (source_type === 'cutting' && !workshop_confirm_id) {
    return { success: false, error: '裁剪源请传入裁剪订单ID' };
  }
  if (source_type === 'workshop' && !workshop_incoming_confirm_id) {
    return { success: false, error: '车间源请传入车间入库确认单ID' };
  }
  if (!workshop_admin_id) {
    return { success: false, error: '缺少车间管理员 ID' };
  }

  // 过滤掉 value<=0 的辅料项，并把同名辅料合并（防止前端重复提交）
  const mergedMap = new Map();
  for (const a of (accessory_usage || [])) {
    const name = (a && (a.name || a.category_two)) || '';
    const qty = Number(a && a.value) || 0;
    if (!name || qty <= 0) continue;
    mergedMap.set(name, (mergedMap.get(name) || 0) + qty);
  }
  const accessoryList = Array.from(mergedMap.entries()).map(([name, value]) => ({ name, value }));

  try {
    // ==================== 1. 事务：校验库存 + 扣库存 + 写加工单 ====================
    const orderNo = generateOrderNo();
    let processingId = null;
    const stockSnapshot = []; // 用于失败时回滚提示和返回

    try {
      await db.runTransaction(async transaction => {
        // 1.1 校验每项辅料在「当前车间辅料库」的库存
        for (const item of accessoryList) {
          const category_two = item.name;
          const needQty = Number(item.value) || 0;

          const stockRes = await transaction.collection('workshop_stock')
            .where({
              workshop_admin_id,
              category_one: '辅料',
              category_two,
            })
            .limit(1)
            .get();

          if (!stockRes.data || stockRes.data.length === 0) {
            throw new Error(`【${category_two}】车间暂无库存，请先确认领料入库`);
          }
          const cur = stockRes.data[0];
          const curQty = Number(cur.total_quantity) || 0;
          if (curQty < needQty) {
            throw new Error(`【${category_two}】车间库存不足，当前仅剩 ${curQty}${cur.unit || ''}，需要 ${needQty}${item.unit || cur.unit || ''}`);
          }
          stockSnapshot.push({ _id: cur._id, category_two, before: curQty, dec: needQty });
        }

        // 1.2 扣车间辅料库存
        for (const snap of stockSnapshot) {
          await transaction.collection('workshop_stock').doc(snap._id)
            .update({
              data: {
                total_quantity: _.inc(-snap.dec),
                updated_at: db.serverDate(),
              },
            });
        }

        // 1.3 写加工单（accessoryList 是合并去重后的）
        const addRes = await transaction.collection('processing_order').add({
          data: {
            order_no: orderNo,
            source_type,
            workshop_confirm_id: workshop_confirm_id || null,
            workshop_incoming_confirm_id: workshop_incoming_confirm_id || null,
            workshop_admin_id: workshop_admin_id || '',
            plan_quantity: plan_quantity || [],
            actual_quantity: actual_quantity || [],
            loss_rate: loss_rate || [],
            accessory_usage: accessoryList,
            gender: gender || '',
            style: style || '',
            school: school || '',
            status: '已完成',
            confirm_time: db.serverDate(),
            created_at: db.serverDate(),
            updated_at: db.serverDate(),
          },
        });
        processingId = addRes._id;

        // 1.4 写 cutting_order 终态（事务内）
        if (source_type === 'cutting' && workshop_confirm_id) {
          try {
            await transaction.collection('cutting_order').doc(workshop_confirm_id)
              .update({
                data: { status: '已加工', updated_at: db.serverDate() },
              });
          } catch (e) {
            console.error('同步 cutting_order 终态失败:', e);
            // 不影响主流程
          }
        }
      });
    } catch (txErr) {
      // 事务整体回滚（库存 / 加工单 / cutting_order 都不会落地）
      console.error('车间加工事务失败:', txErr);
      return { success: false, error: txErr.message || '提交失败' };
    }

    // ==================== 1.5 事务提交后：写入成品待确认列表 ====================
    // 关键修复：之前忘了写这一行，导致成品管理员的"待确认"永远是空表
    // 写入字段：与 finished-confirmIn 期望的 confirm.processing_order_id 对应
    let workshopAdminName = '';
    if (workshop_admin_id) {
      try {
        const empRes = await db.collection('employee')
          .doc(workshop_admin_id)
          .field({ name: true })
          .get();
        workshopAdminName = (empRes.data && empRes.data.name) || '';
      } catch (e) {
        console.error('查车间管理员姓名失败:', e);
      }
    }

    try {
      await db.collection('finished_product_confirm').add({
        data: {
          processing_order_id: processingId,
          order_no: orderNo,
          source_type,
          gender: gender || '',
          style: style || '',
          school: school || '',
          actual_quantity: actual_quantity || [],
          workshop_admin_id,
          workshop_admin_name: workshopAdminName,
          status: '待确认',
          created_at: db.serverDate(),
          updated_at: db.serverDate(),
        },
      });
    } catch (e) {
      console.error('写入 finished_product_confirm 失败:', e);
      // 不影响主流程：即使这一行失败，notification 也会发，成品管理员会看到通知
      // 后续可通过手工 SQL / 同步云函数补齐
    }

    // ==================== 2. 事务外：发通知 ====================
    try {
      await db.collection('notification').add({
        data: {
          receiver_id: null,
          role: '成品管理员',
          type: 'processing_submit',
          title: '车间已提交加工完成',
          content: `车间提交了加工完成单（${(actual_quantity && actual_quantity[0] && actual_quantity[0].count) || 0} 件），请进行成品入库确认`,
          related_order_id: processingId,
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
        _id: processingId,
        order_no: orderNo,
        stockDecremented: stockSnapshot.map(s => ({ name: s.category_two, dec: s.dec })),
      },
    };
  } catch (e) {
    console.error('车间加工单提交失败:', e);
    return { success: false, error: e.message || '提交失败' };
  }
};
