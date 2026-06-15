// pages/boss/raw-stock/index.js
const { callCloud } = require('../../../utils/request.js');
const { formatDate } = require('../../../utils/util.js');
const pageGuard = require('../../../utils/page-guard.js');

/**
 * 老板 - 原材料库存快捷入口
 *
 * 关键：
 * - 复用 raw-stockList 云函数
 * - 顶部展示 SKU 总数 + 总数量
 * - 老板只读，无任何操作按钮
 */
pageGuard({
  moduleKey: 'boss',
  data: {
    list: [],
    total: 0,
    totalQuantity: 0,
    updateTime: '',
    loading: false,
    page: 1,
    pageSize: 100,
  },

  onLoad() {
    this.loadList();
  },

  onShow() {
    // 关键：用 firstShow 标志，避免 onLoad + onShow 连续发两次请求
    if (this._firstShow) {
      this.setData({ page: 1, list: [] });
      this.loadList();
    } else {
      this._firstShow = true;
    }
  },

  onPullDownRefresh() {
    this.setData({ page: 1, list: [] });
    this.loadList().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.loading) return;
    if (this.data.list.length >= (this.data.total || 0)) return;
    this.setData({ page: this.data.page + 1 });
    this.loadList(true);
  },

  loadList(concat = false) {
    this.setData({ loading: true });
    return callCloud('raw-stockList', {
      page: this.data.page,
      pageSize: this.data.pageSize,
    }).then(res => {
      const list = (res.list || []).map(item => ({
        ...item,
        // 关键：把 created_at 之外的时间戳字段统一转为展示用 updated_at_text
        // raw_material_stock 集合用 updated_at 表示最近一次变动
      }));
      const newList = concat ? [...this.data.list, ...list] : list;
      const newTotalQuantity = newList.reduce((s, it) => s + (Number(it.total_quantity) || 0), 0);
      this.setData({
        list: newList,
        total: res.total || 0,
        totalQuantity: newTotalQuantity,
        updateTime: formatDate(new Date(), 'YYYY-MM-DD HH:mm'),
        loading: false,
      });
    }).catch(() => this.setData({ loading: false }));
  },
});
