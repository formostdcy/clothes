const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 裁剪 - 裁剪加工单提交
 * 提交后向目标车间管理员推送待加工确认通知
 */

function generateOrderNo() {
  // 关键：云函数在云端运行，默认是 UTC 时间，需要 +8 小时偏移得到北京时间
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `CJ-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}${rand}`;
}

exports.main = async (event, context) => {
  const db = cloud.database();
  const {
    incoming_confirm_id,
    outbound_order_id,
    cutting_admin_id,
    material_actual_usage,
    plan_clothes_detail,
    target_workshop,
    remark,
  } = event;

  if (!incoming_confirm_id) return { success: false, error: '请选择来料确认单'};
  if (!target_workshop) return { success: false, error: '请选择目标车间' };
  if (!material_actual_usage || material_actual_usage.length === 0) {
    return { success: false, error: '请填写物料使用量'};
  }
  // 校验物料使用量必填且为正数
  for (const m of material_actual_usage) {
    if (!m || m.quantity == null || Number(m.quantity) <= 0) {
      return { success: false, error: `物料【${(m && m.category_two) || '未知'}】使用量必须大于0` };
    }
  }
  // 校验计划件数必填
  if (!plan_clothes_detail || plan_clothes_detail.length === 0) {
    return { success: false, error: '请填写计划件数' };
  }
  for (const p of plan_clothes_detail) {
    if (!p || !p.size) {
      return { success: false, error: '请选择尺码' };
    }
    if (p.count == null || Number(p.count) <= 0) {
      return { success: false, error: `尺码【${p.size}】的计划件数必须大于0` };
    }
  }
  // 校验学校/款式/性别必填
  for (const p of plan_clothes_detail) {
    if (!p.school) return { success: false, error: '请选择学校' };
    if (!p.style)  return { success: false, error: '请选择款式' };
    if (!p.gender) return { success: false, error: '请选择性别' };
  }

  try {
    // ============ 关键：扣减 cutting_incoming_confirm 的物料剩余量 ============
    // 逻辑：按 (category_one, category_two, spec, unit) 4 字段精匹配
    // 1) 先拉来料单
    const incRes = await db.collection('cutting_incoming_confirm').doc(incoming_confirm_id).get();
    const incoming = incRes.data;
    if (!incoming) return { success: false, error: '来料确认单不存在' };
    const details = (incoming.material_details && incoming.material_details.length > 0)
      ? incoming.material_details
      : (incoming.materialName ? [{
          category_one: '',
          category_two: incoming.materialName,
          spec: '',
          quantity: incoming.quantity,
          unit: incoming.unit,
        }] : []);
    if (!details.length) return { success: false, error: '该来料单没有物料明细' };

    // 2) 预校验：检查每项使用量是否超剩余
    for (const m of material_actual_usage) {
      const remain = details.find(d =>
        (d.category_one || '') === (m.category_one || '') &&
        (d.category_two || '') === (m.category_two || '') &&
        (d.spec        || '') === (m.spec        || '') &&
        (d.unit        || '') === (m.unit        || '')
      );
      if (!remain) {
        return { success: false, error: `物料【${m.category_two}】在来料单中不存在` };
      }
      // remaining 字段若不存在则按 quantity 算（兼容老数据）
      const available = (remain.remaining != null) ? remain.remaining : (remain.quantity || 0);
      if (Number(m.quantity) > available) {
        return { success: false, error: `物料【${m.category_two}】使用量 ${m.quantity} 超过剩余库存 ${available}${(m.unit || '')}` };
      }
    }

    // 3) 用事务原子扣减（防止并发超扣）
    const transaction = await db.startTransaction();
    let txError = null;
    let txRes = null;
    try {
      // 重新在事务内拉取并校验（防 TOCTOU）
      const incInTx = await transaction.collection('cutting_incoming_confirm').doc(incoming_confirm_id).get();
      const curDetails = (incInTx.data && incInTx.data.material_details) || details;
      const newDetails = curDetails.map(d => {
        const usage = material_actual_usage.find(m =>
          (d.category_one || '') === (m.category_one || '') &&
          (d.category_two || '') === (m.category_two || '') &&
          (d.spec        || '') === (m.spec        || '') &&
          (d.unit        || '') === (m.unit        || '')
        );
        if (!usage) return d;
        const current = (d.remaining != null) ? d.remaining : (d.quantity || 0);
        const newRemain = current - Number(usage.quantity);
        return { ...d, remaining: newRemain };
      });
      // 任意一项 remaining < 0 直接 abort
      if (newDetails.some(d => d.remaining < 0)) {
        txError = '物料使用量超过剩余库存（并发冲突，请刷新后重试）';
        await transaction.abort();
      } else {
        await transaction.collection('cutting_incoming_confirm').doc(incoming_confirm_id).update({
          data: { material_details: newDetails, updated_at: db.serverDate() },
        });
        txRes = await transaction.collection('cutting_order').add({
          data: {
            order_no: generateOrderNo(),
            incoming_confirm_id,
            outbound_order_id: outbound_order_id || null,
            cutting_admin_id: cutting_admin_id || '',
            material_actual_usage,
            plan_clothes_detail,
            target_workshop,
            remark: remark || '',
            status: '已确认',
            created_at: db.serverDate(),
            updated_at: db.serverDate(),
          },
        });
        await transaction.commit();
      }
    } catch (e) {
      txError = e.message || '事务失败';
      try { await transaction.rollback(); } catch (_) {}
    }
    if (txError) return { success: false, error: txError };

    // 给目标车间管理员推送待加工确认通知
    try {
      await db.collection('notification').add({
        data: {
          receiver_id: target_workshop,
          role: '车间管理员',
          type: 'workshop_pending',
          title: '您有新的待加工裁剪单',
          content: `裁剪管理员提交了新的裁剪单（${material_actual_usage.length} 种物料，${plan_clothes_detail.length} 个尺码），请确认加工`,
          related_order_id: txRes._id,
          is_read: 0,
          created_at: db.serverDate(),
        },
      });
    } catch (notifErr) {
      console.error('推送通知失败:', notifErr);
      // 通知失败不影响主流程
    }

    return { success: true, data: { _id: txRes._id } };
  } catch (e) {
    console.error('裁剪单提交失败:', e);
    return { success: false, error: '提交失败' };
  }
};
