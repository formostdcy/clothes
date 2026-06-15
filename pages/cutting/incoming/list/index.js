// pages/cutting/incoming/list/index.js
const { callCloud } = require('../../../../utils/request.js');
const { mapCuttingIncoming } = require('../../../../utils/field-map.js');
const { formatDate } = require('../../../../utils/util.js');
const pageGuard = require('../../../../utils/page-guard.js');

pageGuard({
  moduleKey: 'cutting',
  data: {
    activeTab: 0,
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

  onTabChange(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ activeTab: index, page: 1, list: [] });
    this.loadList();
  },

  loadList(concat = false) {
    this.setData({ loading: true });
    // activeTab 0=待确认 1=已确认 → 转成 status 文本
    const statusMap = { 0: '待确认', 1: '已确认' };
    const status = statusMap[this.data.activeTab] || '';
    return callCloud('cutting-incomingList', {
      status,
      page: this.data.page,
      pageSize: this.data.pageSize
    }).then(res => {
      const list = (res.list || []).map(item => {
        const mapped = mapCuttingIncoming(item);
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
      title: '确认来料',
      content: '确认该来料数量和质量无误？',
      success: res => {
        if (res.confirm) {
          callCloud('cutting-incomingConfirm', { _id: id }).then(() => {
            wx.showToast({ title: '确认成功' });
            this.setData({ page: 1, list: [] });
            this.loadList();
          });
        }
      }
    });
  },

  onProblem(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '反馈问题',
      content: '确认该来料有问题？',
      success: res => {
        if (res.confirm) {
          callCloud('cutting-incomingProblem', { _id: id, problem_desc: '来料有问题，请查看' }).then(() => {
            wx.showToast({ title: '已反馈' });
            this.setData({ page: 1, list: [] });
            this.loadList();
          });
        }
      }
    });
  },

  // 预览照片（点击缩略图放大查看）
  onPreviewPhoto(e) {
    const { urls, current } = e.currentTarget.dataset;
    wx.previewImage({
      urls: urls,
      current: current,
    });
  }
});
