// pages/cutting/record/index.js
const { callCloud } = require('../../../utils/request.js');
const { mapCuttingOrder } = require('../../../utils/field-map.js');
const { formatDate } = require('../../../utils/util.js');
const pageGuard = require('../../../utils/page-guard.js');

pageGuard({
  moduleKey: 'cutting',
  data: {
    activeTab: 'pending',
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
      // 真实状态：'pending' → status != '已完成'，'completed' → status = '已完成'
      if (this.data.activeTab === 'completed') {
        params.status = '已完成';
      } else if (this.data.activeTab === 'pending') {
        params.excludeStatus = '已完成';
      }
    }
    return callCloud('cutting-orderList', params).then(res => {
      const list = (res.list || []).map(item => {
        const mapped = mapCuttingOrder(item);
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
    wx.navigateTo({ url: `/pages/cutting/cutting/add/index?id=${id}` });
  }
});
