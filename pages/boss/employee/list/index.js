// pages/boss/employee/list/index.js
const { callCloud } = require('../../../../utils/request.js');
const pageGuard = require('../../../../utils/page-guard.js');

pageGuard({
  moduleKey: 'boss',
  data: {
    list: [],
    page: 1,
    pageSize: 20,
    total: 0,
    keyword: '',
    loading: false,
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
    return callCloud('employee-list', {
      page: this.data.page,
      pageSize: this.data.pageSize,
      keyword: this.data.keyword,
    }).then(data => {
      const list = this.data.page === 1 ? data.list : [...this.data.list, ...data.list];
      this.setData({ list, total: data.total, loading: false });
    }).catch(() => {
      this.setData({ loading: false });
    });
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value, page: 1, list: [] });
    this.loadList();
  },

  goToAdd() {
    wx.navigateTo({ url: '/pages/boss/employee/add/index' });
  },

  goToEdit(e) {
    wx.navigateTo({ url: `/pages/boss/employee/edit/index?id=${e.currentTarget.dataset.id}` });
  },

  onDelete(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除',
      content: `确定删除员工"${name}"吗？删除后该账号将无法登录。`,
      success: res => {
        if (res.confirm) {
          callCloud('employee-delete', { _id: id }).then(() => {
            wx.showToast({ title: '删除成功', icon: 'success' });
            this.setData({ page: 1, list: [] });
            this.loadList();
          });
        }
      },
    });
  },
});
