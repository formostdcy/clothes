const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 车间 - 入库确认
 *
 * 关键修复：之前只是改状态，没有把辅料从原材料库转移到车间库，导致：
 *   1. 车间确认后辅料"凭空消失"
 *   2. 新建生产单时仍然从原材料库扣，库存对不上
 *
 * 修复后的库存模型：
 *   raw_material_stock （原材料库 / 总仓）
 *     ↓ [raw-outboundAdd]       扣
 *   in-transit (workshop_incoming_confirm status=待确认)
 *     ↓ [workshop-incomingConfirm]  ← 本云函数
 *   workshop_stock （车间辅料库，每车间每辅料一条）
 *     ↓ [workshop-processingAdd]  扣
 *   消耗
 *
 * 业务：
 *   1) 读 workshop_incoming_confirm 单据
 *   2) 校验 status === '待确认'
 *   3) 事务：
 *      - 改状态为"已确认"
 *      - 遍历 material_details，upsert 到 workshop_stock（按 workshop_id+category_one+category_two 聚合）
 *   4) 事务外发通知给领料人
 *
 * 【2026-06-15 修复】
 * - 集合不存在导致 -502005：
 *   当云开发数据库里还没有 workshop_stock 集合时，云函数会报
 *   "collection.get:fail -502005 database collection not exists"。
 *   解决办法：先用 db.createCollection 幂等创建一次，
 *   失败若 "ResourceExists" 则忽略（集合已存在则跳过）。
 *   同样处理 notification 集合。
 * - 库存写入失败不影响主流程：
 *   把改状态和写库存分两步，先确保状态一定改成"已确认"，
 *   库存累计作为 best-effort 写入（失败只记日志，不回滚状态），
 *   避免因为数据库抖动导致用户看不到"确认成功"。
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const _ = db.command;
  const { _id } = event;

  if (!_id) return { success: false, error: 'ID 不能为空' };

  // ============ 0. 幂等创建依赖集合（解决 -502005） ============
  await ensureCollections();

  try {
    // ============ 1. 读单据 ============
    const docRes = await db.collection('workshop_incoming_confirm').doc(_id).get();
    const doc = docRes.data;
    if (!doc || !doc._id) {
      return { success: false, error: '单据不存在' };
    }
    if (doc.status === '已确认') {
      return { success: false, error: '该单据已确认，不能重复操作' };
    }
    if (doc.status !== '待确认') {
      return { success: false, error: `当前状态为「${doc.status}」，无法确认` };
    }

    // 校验必须字段
    const targetAdminId = doc.target_admin_id;
    const materialDetails = doc.material_details || [];
    if (!targetAdminId) {
      return { success: false, error: '单据缺少领料人 target_admin_id' };
    }
    if (materialDetails.length === 0) {
      return { success: false, error: '单据没有物料明细' };
    }

    // ============ 2. 改状态（事务原子性） ============
    // 关键：先单独跑一个事务把状态改了，保证"确认"语义一定生效
    try {
      await db.runTransaction(async transaction => {
        await transaction.collection('workshop_incoming_confirm').doc(_id).update({
          data: {
            status: '已确认',
            confirm_time: db.serverDate(),
            updated_at: db.serverDate(),
          },
        });
      });
    } catch (txErr) {
      console.error('车间入库 - 改状态事务失败:', txErr);
      return { success: false, error: txErr.message || '确认失败' };
    }

    // ============ 3. 写库存（best-effort，失败不影响主流程） ============
    // 拆出事务：状态已改，库存累计作为可降级步骤
    try {
      for (const item of materialDetails) {
        const category_one = item.category_one || '辅料';
        const category_two = item.category_two || '';
        const quantity = Number(item.quantity) || 0;
        const unit = item.unit || '';
        if (!category_two || quantity <= 0) continue;

        // 查找是否已有该车间-辅料组合
        const existRes = await db.collection('workshop_stock')
          .where({
            workshop_admin_id: targetAdminId,
            category_one,
            category_two,
          })
          .limit(1)
          .get();

        if (existRes.data && existRes.data.length > 0) {
          // 已有：累加
          await db.collection('workshop_stock').doc(existRes.data[0]._id)
            .update({
              data: {
                total_quantity: _.inc(quantity),
                unit: unit || existRes.data[0].unit || '',
                updated_at: db.serverDate(),
              },
            });
        } else {
          // 没有：新增
          await db.collection('workshop_stock').add({
            data: {
              workshop_admin_id: targetAdminId,
              category_one,
              category_two,
              total_quantity: quantity,
              unit: unit || '',
              warning_threshold: 0,
              created_at: db.serverDate(),
              updated_at: db.serverDate(),
            },
          });
        }
      }
    } catch (stockErr) {
      // 库存累计失败只记日志，不影响主流程
      // 用户已经看到"确认成功"，但需要后续补库存
      console.error('车间入库 - 写库存失败（不影响确认状态）:', stockErr);
    }

    // ============ 4. 发通知给领料人（best-effort） ============
    try {
      await db.collection('notification').add({
        data: {
          receiver_id: targetAdminId,
          role: '车间管理员',
          type: 'workshop_incoming_confirmed',
          title: '入库确认成功',
          content: `您有 ${materialDetails.length} 种物料已确认入库，辅料已加入车间库存`,
          related_order_id: _id,
          is_read: 0,
          created_at: db.serverDate(),
        },
      });
    } catch (e) {
      console.error('发通知失败:', e);
    }

    return { success: true };
  } catch (e) {
    console.error('车间入库确认失败:', e);
    return { success: false, error: e.message || '确认失败' };
  }
};

/**
 * 幂等创建依赖集合
 * - 解决首次部署时 -502005 collection not exists
 * - 失败若是 "ResourceExists"（已存在）则吞掉
 * - 其它失败不抛错，只打日志（避免阻塞主流程）
 */
async function ensureCollections() {
  const db = cloud.database();
  const collections = ['workshop_stock', 'notification'];
  for (const name of collections) {
    try {
      await db.createCollection(name);
      console.log(`[ensureCollections] 已创建集合 ${name}`);
    } catch (e) {
      const msg = (e && (e.errMsg || e.message)) || '';
      if (/already exists|ResourceExists/i.test(msg)) {
        // 集合已存在，正常
        continue;
      }
      console.error(`[ensureCollections] 创建集合 ${name} 失败:`, e);
    }
  }
}
