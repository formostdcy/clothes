// pages/finished/confirm/list/index.js
const { callCloud } = require('../../../../utils/request.js');
const { mapFinishedConfirm } = require('../../../../utils/field-map.js');
const { formatDate } = require('../../../../utils/util.js');
const pageGuard = require('../../../../utils/page-guard.js');

pageGuard({
  moduleKey: 'finished',
  data: {
    list: [],
    page: 1,
    pageSize: 20,
    total: 0,
    loading: false
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
    return callCloud('finished-confirmList', {
      page: this.data.page,
      pageSize: this.data.pageSize
    }).then(res => {
      const list = (res.list || []).map(item => {
        const mapped = mapFinishedConfirm(item);
        mapped.createTime = formatDate(mapped.createTime, 'MM-DD HH:mm');
        return mapped;
      });
      const newList = concat ? [...this.data.list, ...list] : list;
      this.setData({ list: newList, total: res.total || 0, loading: false });
    }).catch(() => {
      this.setData({ loading: false });
    });
  },

  onConfirm(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认入库',
      content: '确认该订单产品合格并入库？',
      success: res => {
        if (res.confirm) {
          callCloud('finished-confirmIn', { _id: id }).then(() => {
            wx.showToast({ title: '入库成功' });
            this.setData({ page: 1, list: [] });
            this.loadList();
          });
        }
      }
    });
  },

  onProblem(e) {
    const id = e.currentTarget.dataset.id;
    // 用 textarea 让用户填具体问题描述（需求 4.4.1 要求"问题描述必填"）
    wx.showModal({
      title: '反馈问题',
      content: '请在弹窗中输入问题描述',
      editable: true,
      placeholderText: '例如：数量与单据不符 / 尺码错乱 / 布料有色差',
      success: res => {
        if (res.confirm && res.content && res.content.trim()) {
          callCloud('finished-confirmProblem', { _id: id, problem_desc: res.content.trim() }).then(() => {
            wx.showToast({ title: '已反馈' });
            this.setData({ page: 1, list: [] });
            this.loadList();
          });
        } else if (res.confirm) {
          wx.showToast({ title: '问题描述不能为空', icon: 'none' });
        }
      }
    });
  }
});
