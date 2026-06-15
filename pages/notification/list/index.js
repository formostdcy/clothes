// pages/notification/list/index.js
const { callCloud } = require('../../../utils/request.js');
const { timeAgo } = require('../../../utils/util.js');
const app = getApp();

Page({
  data: {
    list: [],
    page: 1,
    pageSize: 20,
    total: 0,
    loading: false,
    typeMap: {
      cutting_problem: '裁剪问题',
      workshop_problem: '车间问题',
      cutting_return: '退回裁剪',
      processing_submit: '新加工单',
      product_problem: '成品问题',
      inventory_warning: '库存预警',
    },
  },

  onLoad() {
    this.loadList();
  },

  onPullDownRefresh() {
    this.setData({ page: 1, list: [] });
    this.loadList().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.loading) return;
    if (this.data.list.length < this.data.total) {
      this.setData({ page: this.data.page + 1 });
      this.loadList();
    }
  },

  loadList() {
    this.setData({ loading: true });
    const userInfo = app.getUserInfo() || {};
    return callCloud('notification-list', {
      user_id: userInfo._id,
      role: userInfo.role,
      page: this.data.page,
      pageSize: this.data.pageSize,
    }).then(data => {
      const list = data.list.map(item => ({
        ...item,
        time: timeAgo(item.created_at),
      }));
      const newList = this.data.page === 1 ? list : [...this.data.list, ...list];
      this.setData({ list: newList, total: data.total, loading: false });
    }).catch(() => {
      this.setData({ loading: false });
    });
  },

  onItemTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item.is_read) {
      callCloud('notification-markRead', { _id: item._id }).then(() => {
        const list = this.data.list.map(n => n._id === item._id ? { ...n, is_read: 1 } : n);
        this.setData({ list });
      });
    }
  },
});
