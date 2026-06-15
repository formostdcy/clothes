// pages/boss/orders/index.js
const { callCloud } = require('../../../utils/request.js');
const { formatDate, getStatusStyle } = require('../../../utils/util.js');
const pageGuard = require('../../../utils/page-guard.js');

pageGuard({
  moduleKey: 'boss',
  data: {
    modules: [{ name: '全模块', value: '' }, { name: '原材料入库', value: 'raw_inbound' }, { name: '原材料出库', value: 'raw_outbound' }, { name: '裁剪', value: 'cutting' }, { name: '加工', value: 'processing' }, { name: '成品出库', value: 'finished_outbound' }],
    moduleIndex: 0,
    module: '',
    keyword: '',
    list: [],
    page: 1,
    pageSize: 20,
    total: 0,
    loading: false,
    _searchTimer: null
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
    return callCloud('boss-orderList', {
      module: this.data.module,
      keyword: this.data.keyword,
      page: this.data.page,
      pageSize: this.data.pageSize,
    }).then(data => {
      const list = data.list.map(item => ({
        ...item,
        created_at: formatDate(item.created_at, 'MM-DD HH:mm'),
        statusClass: getStatusStyle(item.status),
      }));
      const newList = this.data.page === 1 ? list : [...this.data.list, ...list];
      this.setData({ list: newList, total: data.total, loading: false });
    }).catch(() => this.setData({ loading: false }));
  },

  onModuleChange(e) {
    const module = this.data.modules[e.detail.value].value;
    this.setData({ moduleIndex: e.detail.value, module, page: 1, list: [] });
    this.loadList();
  },

  onSearch(e) {
    const keyword = e.detail.value;
    this.setData({ keyword });
    if (this.data._searchTimer) clearTimeout(this.data._searchTimer);
    this.data._searchTimer = setTimeout(() => {
      this.setData({ page: 1, list: [] });
      this.loadList();
    }, 400);
  },
});
