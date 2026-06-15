// pages/raw/settings/option/index.js
const { callCloud } = require('../../../../utils/request.js');
const pageGuard = require('../../../../utils/page-guard.js');

pageGuard({
  moduleKey: 'raw',
  data: {
    cat1List: [
      { key: '布料', label: '布料' },
      { key: '辅料', label: '辅料' },
    ],
    cat1Index: 0,
    cat1: '布料',
    list: [],
    loading: false
  },

  onLoad() {
    this.loadList();
  },

  onShow() {
    // 从新增/编辑页返回时刷新
    this.loadList();
  },

  onPullDownRefresh() {
    this.loadList().finally(() => wx.stopPullDownRefresh());
  },

  switchCat1(e) {
    const index = parseInt(e.currentTarget.dataset.index);
    this.setData({ cat1Index: index, cat1: this.data.cat1List[index].key });
    this.loadList();
  },

  loadList() {
    this.setData({ loading: true });
    return callCloud('option-list', { type: 'category_two' }, { silent: true }).then(data => {
      const arr = Array.isArray(data) ? data : [];
      const filtered = arr.filter(item => (item.category_one || '') === this.data.cat1);
      this.setData({ list: filtered, loading: false });
    }).catch(() => this.setData({ loading: false }));
  },

  onAdd() {
    wx.navigateTo({ url: `/pages/raw/settings/option-edit/index?category_one=${this.data.cat1}` });
  },

  onEdit(e) {
    const item = e.currentTarget.dataset.item;
    wx.navigateTo({ url: `/pages/raw/settings/option-edit/index?id=${item._id}` });
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.showModal({
      title: '确认删除',
      content: `确定删除"${name}"吗？`,
      success: res => {
        if (res.confirm) {
          callCloud('option-delete', { _id: id }).then(() => {
            wx.showToast({ title: '删除成功' });
            this.loadList();
          });
        }
      }
    });
  }
});
