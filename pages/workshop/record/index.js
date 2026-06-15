// pages/workshop/record/index.js
const { callCloud } = require('../../../utils/request.js');
const { mapProcessingOrder } = require('../../../utils/field-map.js');
const { formatDate } = require('../../../utils/util.js');
const pageGuard = require('../../../utils/page-guard.js');

pageGuard({
  moduleKey: 'workshop',
  data: {
    activeTab: 'processing',
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
    const status = e.currentTarget.dataset.status;
    this.setData({ activeTab: status, page: 1, list: [] });
    this.loadList();
  },

  loadList(concat = false) {
    this.setData({ loading: true });
    const params = {
      page: this.data.page,
      pageSize: this.data.pageSize
    };
    if (this.data.activeTab !== 'all') {
      params.status = this.data.activeTab;
    }
    return callCloud('workshop-processingList', params).then(res => {
      const list = (res.list || []).map(item => {
        const mapped = mapProcessingOrder(item);
        mapped.createTime = formatDate(mapped.createTime, 'YYYY-MM-DD HH:mm');
        return mapped;
      });
      const newList = concat ? [...this.data.list, ...list] : list;
      this.setData({ list: newList, total: res.total || 0, loading: false });
    }).catch(() => {
      this.setData({ loading: false });
    });
  },

  onDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/workshop/processing/add/index?id=${id}` });
  }
});
