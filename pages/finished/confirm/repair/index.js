// pages/finished/confirm/repair/index.js
// 应急工具页：成品管理 → 应急重建库存
// 用途：当"确认入库"后库存没存进去时，在这里一键修复
const { callCloud } = require('../../../../utils/request.js');
const pageGuard = require('../../../../utils/page-guard.js');
const app = getApp();

pageGuard({
  moduleKey: 'finished_inbound',
  data: {
    step: 0,        // 0=初始 1=预览中 2=预览完成 3=重建中 4=重建完成
    summary: null,
    lastResult: null,
    onlyId: '',
  },

  onLoad() {
    this.runDryRun();
  },

  onBackHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  // 跑一次预览
  onDryRun() {
    this.runDryRun();
  },

  // 实际重建
  onRebuild() {
    const that = this;
    const onlyId = (that.data.onlyId || '').trim();
    wx.showModal({
      title: '确认重建',
      content: onlyId
        ? `将重建订单 ${onlyId} 的库存。该操作会再次累加数量到 finished_product_stock，如有重复数据请先在云数据库手动清理。`
        : '将重建所有"已入库"或"待确认"订单的库存。如果有重复数据，请先在云数据库清理。',
      success: res => {
        if (res.confirm) {
          that.setData({ step: 3, summary: null });
          callCloud('finished-emergencyRebuildStock', {
            force: true,
            dryRun: false,
            onlyId: onlyId || null,
            reset: false,
          }).then(res2 => {
            that.setData({ step: 4, lastResult: res2 });
            if (res2 && res2.summary) {
              that.setData({ summary: res2.summary });
              wx.showToast({
                title: `已重建 ${res2.summary.rebuilt} 条`,
                icon: 'success',
              });
            }
          }).catch(err => {
            that.setData({ step: 4, lastResult: { error: String(err) } });
            wx.showToast({ title: '重建失败', icon: 'none' });
          });
        }
      },
    });
  },

  // 重置幂等标记（重置后再跑一次重建）
  onResetAndRebuild() {
    const that = this;
    wx.showModal({
      title: '重置+重建',
      content: '将先把所有订单的 stock_rebuilt 标记重置为 false，然后重新累加库存。\n注意：如果确认入库已成功过，会导致库存重复累加。',
      success: res => {
        if (res.confirm) {
          that.setData({ step: 3, summary: null });
          callCloud('finished-emergencyRebuildStock', {
            reset: true,
          }).then(res2 => {
            return callCloud('finished-emergencyRebuildStock', {
              force: true,
              dryRun: false,
            });
          }).then(res3 => {
            that.setData({ step: 4, lastResult: res3 });
            if (res3 && res3.summary) {
              that.setData({ summary: res3.summary });
              wx.showToast({ title: `重置+重建完成`, icon: 'success' });
            }
          }).catch(err => {
            that.setData({ step: 4, lastResult: { error: String(err) } });
            wx.showToast({ title: '操作失败', icon: 'none' });
          });
        }
      },
    });
  },

  onOnlyIdInput(e) {
    this.setData({ onlyId: e.detail.value });
  },

  runDryRun() {
    this.setData({ step: 1, summary: null, lastResult: null });
    callCloud('finished-emergencyRebuildStock', {
      force: false,
      dryRun: true,
      onlyId: null,
    }).then(res => {
      this.setData({ step: 2, lastResult: res });
      if (res && res.summary) {
        this.setData({ summary: res.summary });
      }
    }).catch(err => {
      this.setData({ step: 4, lastResult: { error: String(err) } });
    });
  },
});
