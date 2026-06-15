// pages/boss/settings/supplier/index.js
const { callCloud } = require('../../../../utils/request.js');
const pageGuard = require('../../../../utils/page-guard.js');

pageGuard({
  moduleKey: 'boss',
  data: {
    keyword: '',
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
    if (this.data.list.length >= this.data.total) return;
    this.setData({ page: this.data.page + 1 });
    this.loadList(true);
  },

  onPullDownRefresh() {
    this.setData({ page: 1, list: [] });
    this.loadList().finally(() => wx.stopPullDownRefresh());
  },

  loadList(concat = false) {
    this.setData({ loading: true });
    return callCloud('supplier-list', {
      keyword: this.data.keyword,
      page: this.data.page,
      pageSize: this.data.pageSize
    }).then(res => {
      const list = res.list || [];
      const newList = concat ? [...this.data.list, ...list] : list;
      this.setData({
        list: newList,
        total: res.total || 0,
        loading: false
      });
    }).catch(() => {
      this.setData({ loading: false });
    });
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch() {
    this.setData({ page: 1, list: [] });
    this.loadList();
  },

  onAdd() {
    wx.navigateTo({ url: '/pages/boss/settings/supplier/edit/index' });
  },

  onEdit(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/boss/settings/supplier/edit/index?id=${id}` });
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除该供应商吗？',
      success: res => {
        if (res.confirm) {
          callCloud('supplier-delete', { _id: id }).then(() => {
            wx.showToast({ title: '删除成功' });
            this.setData({ page: 1, list: [] });
            this.loadList();
          });
        }
      }
    });
  }
});
