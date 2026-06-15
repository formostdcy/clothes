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
  return `JG-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}${rand}`;
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

  // 关键修复：先幂等创建依赖集合（解决首次部署 -502005）
  await ensureCollections();

  try {
    // ==================== 1. 事务：校验库存 + 扣库存 + 写加工单 ====================
    const orderNo = generateOrderNo();
    let processingId = null;
    const stockSnapshot = []; // 用于失败时回滚提示和返回

    // 用本地变量跟踪已成功扣减的库存（用于回滚）
    const writtenStocks = []; // [{ stockId, qty, action: 'dec' }]

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
          writtenStocks.push({ stockId: snap._id, qty: snap.dec, action: 'dec' });
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

        // 1.4 cutting_order 状态更新移至事务外（第 7 节统一处理）
      });
    } catch (txErr) {
      // 事务整体回滚（库存 / 加工单 / cutting_order 都不会落地）
      // 注意：runTransaction 已经自动回滚，writtenStocks 只是为了日志/调试
      console.error('车间加工事务失败:', txErr);
      return { success: false, error: txErr.message || '提交失败' };
    }

    // ==================== 1.4 事务提交后：同步 cutting_order 状态 ====================
    // 关键修复：之前在事务内 try/catch 吞掉错误，会导致 cutting_order 状态可能不一致
    // 移到事务外：失败则显式回滚辅料库存并通知，状态仍标记为"已加工"的副作用可由人工/运维修复
    if (source_type === 'cutting' && workshop_confirm_id) {
      try {
        await db.collection('cutting_order').doc(workshop_confirm_id)
          .update({
            data: { status: '已加工', updated_at: db.serverDate() },
          });
      } catch (e) {
        console.error('同步 cutting_order 终态失败，触发辅料库存回滚补偿:', e);
        // 关键：cutting_order 状态同步失败时，辅料已被扣、processing_order 已写入；
        // 此时业务上"加工完成"已发生（已发通知给成品管理员），cutting_order 终态只是辅助标记。
        // 但若不修就会出现 cutting_order 仍为"已裁剪"，下次车间重做时会重复扣辅料。
        // 解决：把已扣的辅料回滚到 workshop_stock，避免下次重做时库存对不上。
        // 配合 finished_product_confirm 已写入（已发通知），业务上仍可继续。
        let rolledBackQty = 0;
        for (const w of writtenStocks) {
          try {
            if (w.action === 'dec') {
              await db.collection('workshop_stock').doc(w.stockId).update({
                data: { total_quantity: _.inc(w.qty), updated_at: db.serverDate() },
              });
              rolledBackQty++;
            }
          } catch (rollbackErr) {
            console.error('[workshop-processingAdd] cutting_order 状态失败 → 回滚辅料库存失败:', w, rollbackErr);
          }
        }
        // 通知老板进行人工核查
        try {
          await db.collection('notification').add({
            data: {
              receiver_id: null,
              role: '老板',
              type: 'cutting_status_sync_failed',
              title: '裁剪单终态同步失败，已自动回滚辅料',
              content: `加工单 ${orderNo} 已写入，但源裁剪单终态同步失败；辅料库存已回滚 ${rolledBackQty} 条，请人工核对 cutting_order 状态。processing_order_id=${processingId}`,
              related_order_id: processingId,
              is_read: 0,
              created_at: db.serverDate(),
            },
          });
        } catch (notifErr) {
          console.error('发通知失败:', notifErr);
        }
      }
    }

    // ==================== 1.5 事务提交后：写入成品待确认列表 ====================
    // 关键修复：之前 confirm 写得太薄（只存 4 个核心字段），导致成品入库页看不到完整订单信息
    // 这里从 processing_order 重新拉一次，存完整的订单快照，避免前端再 JOIN
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
    let confirmData = null;
    try {
      const procRes = await db.collection('processing_order').doc(processingId).get();
      const proc = procRes.data || {};
      confirmData = {
        ...proc, // 包含 plan_quantity, actual_quantity, loss_rate, accessory_usage, gender, style, school, source_type, order_no, workshop_admin_id 等
        // 覆盖几个字段：确保来源是当前这次提交（防 processing_order 字段为空时丢失）
        processing_order_id: processingId,
        order_no: orderNo,
        source_type,
        gender: gender || proc.gender || '',
        style: style || proc.style || '',
        school: school || proc.school || '',
        actual_quantity: actual_quantity || proc.actual_quantity || [],
        plan_quantity: plan_quantity || proc.plan_quantity || [],
        loss_rate: loss_rate || proc.loss_rate || [],
        accessory_usage: accessoryList.length > 0 ? accessoryList : (proc.accessory_usage || []),
        workshop_admin_id: workshop_admin_id || proc.workshop_admin_id || '',
        // workshop_admin_name：优先从 employee 表拿；拿不到就用 processing_order 里的
        workshop_admin_name: workshopAdminName || proc.workshop_admin_name || '',
        // 标记状态为待确认
        status: '待确认',
        created_at: db.serverDate(),
        updated_at: db.serverDate(),
        // confirm 提交时间（车间端 = confirmTime）
        confirm_time: db.serverDate(),
      };
    } catch (e) {
      console.error('[workshop-processingAdd] 拉取加工单失败:', e);
      // 兜底：即使拉不到 processing_order，也用本次提交的参数写 confirm
      confirmData = {
        processing_order_id: processingId,
        order_no: orderNo,
        source_type,
        gender: gender || '',
        style: style || '',
        school: school || '',
        actual_quantity: actual_quantity || [],
        plan_quantity: plan_quantity || [],
        loss_rate: loss_rate || [],
        accessory_usage: accessoryList,
        workshop_admin_id: workshop_admin_id || '',
        workshop_admin_name: workshopAdminName,
        status: '待确认',
        created_at: db.serverDate(),
        updated_at: db.serverDate(),
        confirm_time: db.serverDate(),
      };
    }

    try {
      await db.collection('finished_product_confirm').add({ data: confirmData });
      console.log('[workshop-processingAdd] 写入 finished_product_confirm 成功, processingId=', processingId, 'order_no=', orderNo);
    } catch (e) {
      console.error('[workshop-processingAdd] 写入 finished_product_confirm 失败:', e);
      // 关键修复：让错误显式返回，前端能看到"提交成功但 confirm 没写"
      // 同时也回滚已扣的车间辅料库存（数据一致性）
      for (const w of writtenStocks) {
        try {
          if (w.action === 'dec') {
            await db.collection('workshop_stock').doc(w.stockId).update({
              data: { total_quantity: _.inc(w.qty), updated_at: db.serverDate() },
            });
          }
        } catch (rollbackErr) {
          console.error('[workshop-processingAdd] 回滚辅料库存失败:', w, rollbackErr);
        }
      }
      // 注意：processing_order 没法直接删（被事务保护了），但因为没有 confirm 引用它，
      // 后续可以通过运维脚本清理孤立的 processing_order
      return {
        success: false,
        error: '加工单已提交，但成品待确认列表同步失败，辅料库存已回滚：' + (e.message || e.errMsg || '未知错误'),
        hint: '请联系管理员检查云数据库权限或手动补写',
        data: { _id: processingId, order_no: orderNo, rolledBack: writtenStocks.length },
      };
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

/**
 * 幂等创建依赖集合
 * - 解决首次部署时 -502005 collection not exists
 * - 失败若是 "ResourceExists"（已存在）则吞掉
 * - 其它失败不抛错，只打日志
 */
async function ensureCollections() {
  const db = cloud.database();
  const collections = ['processing_order', 'finished_product_confirm', 'cutting_order', 'employee', 'notification'];
  for (const name of collections) {
    try {
      await db.createCollection(name);
      console.log(`[ensureCollections] 已创建集合 ${name}`);
    } catch (e) {
      const msg = (e && (e.errMsg || e.message)) || '';
      if (/already exists|ResourceExists/i.test(msg)) {
        continue;
      }
      console.error(`[ensureCollections] 创建集合 ${name} 失败:`, e);
    }
  }
}
