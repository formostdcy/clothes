// pages/workshop/pending/list/index.js
const { callCloud } = require('../../../../utils/request.js');
const { mapWorkshopPending } = require('../../../../utils/field-map.js');
const { formatDate } = require('../../../../utils/util.js');
const pageGuard = require('../../../../utils/page-guard.js');

pageGuard({
  moduleKey: 'workshop',
  data: {
    list: [],
    page: 1,
    pageSize: 20,
    total: 0,
    loading: false,
    returnModal: {          // 退回原因弹层状态
      visible: false,
      id: '',
      reason: '',
    }
  },

  onLoad() {
    this.loadList();
  },

  onReachBottom() {
    if (this.data.loading) return;
    if (this.data.list.length >= (this.data.total || 0)) return;
    this.setData({ page: this.data.page + 1 });
    this.loadList(true);
  },

  onPullDownRefresh() {
    this.setData({ page: 1, list: [] });
    this.loadList().finally(() => wx.stopPullDownRefresh());
  },

  loadList(concat = false) {
    this.setData({ loading: true });
    return callCloud('workshop-pendingList', {
      page: this.data.page,
      pageSize: this.data.pageSize
    }).then(res => {
      console.log('[pendingList] res =', JSON.stringify(res));
      const list = (res.list || []).map(item => {
        const mapped = mapWorkshopPending(item);
        mapped.createTime = formatDate(mapped.createTime, 'MM-DD HH:mm');
        return mapped;
      });
      console.log('[pendingList] list.length =', list.length, 'first =', JSON.stringify(list[0] || null));
      const newList = concat ? [...this.data.list, ...list] : list;
      this.setData({ list: newList, total: res.total || 0, loading: false });
    }).catch((err) => {
      console.error('[pendingList] err =', err);
      this.setData({ loading: false });
    });
  },

  onConfirm(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认接单',
      content: '确认接收此加工订单？',
      success: res => {
        if (res.confirm) {
          callCloud('workshop-pendingConfirm', { _id: id }).then(() => {
            wx.showToast({ title: '接单成功' });
            this.setData({ page: 1, list: [] });
            this.loadList();
          });
        }
      }
    });
  },

  // 点击退回：弹出原因输入弹层
  onReturnTap(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({
      returnModal: { visible: true, id, reason: '' }
    });
  },

  // 输入退回原因
  onReturnReasonInput(e) {
    this.setData({ 'returnModal.reason': e.detail.value });
  },

  // 取消退回
  onReturnCancel() {
    this.setData({
      returnModal: { visible: false, id: '', reason: '' }
    });
  },

  // 提交退回（必填校验）
  onReturnSubmit() {
    const { id, reason } = this.data.returnModal;
    const trimmed = (reason || '').trim();
    if (!trimmed) {
      wx.showToast({ title: '请填写退回原因', icon: 'none' });
      return;
    }
    callCloud('workshop-pendingReturn', { _id: id, return_reason: trimmed }).then(() => {
      wx.showToast({ title: '已退回' });
      this.setData({ returnModal: { visible: false, id: '', reason: '' } });
      this.setData({ page: 1, list: [] });
      this.loadList();
    });
  }
});
