// pages/boss/finished-stats/index.js
const { callCloud } = require('../../../utils/request.js');
const pageGuard = require('../../../utils/page-guard.js');

const TYPES = [
  { name: '库存', value: 'stock' },
  { name: '出库量', value: 'outbound' },
];

const GROUP_BY = [
  { name: '按学校', value: 'school' },
  { name: '按款式', value: 'style' },
  { name: '按季节', value: 'season' },
  { name: '按去向', value: 'destination' },
];

// 库存没有"去向"概念，单独给一个精简列表
const GROUP_BY_STOCK = [
  { name: '按学校', value: 'school' },
  { name: '按款式', value: 'style' },
  { name: '按季节', value: 'season' },
];

pageGuard({
  moduleKey: 'boss',
  data: {
    types: TYPES,
    typeIndex: 0,
    type: 'stock',
    // 列表随 type 切换：库存时不含"按去向"
    groupByList: GROUP_BY_STOCK,
    groupByIndex: 0,
    groupBy: 'school',
    total: 0,
    rows: [],
    details: [],
    filteredDetails: [],
    selectedKey: '',
    loading: false,
  },

  onLoad() {
    this._requestId = 0;
    this.loadStats();
  },

  onPullDownRefresh() {
    this.loadStats().finally(() => wx.stopPullDownRefresh());
  },

  loadStats() {
    // 防止旧请求覆盖新数据（用户快速切换维度时可能并发触发多次 loadStats）
    const requestId = ++this._requestId;
    this.setData({ loading: true });
    // silent: true 避免与 callCloud 自带的"网络异常"toast 重复弹错
    return callCloud('boss-finishedStats', {
      type: this.data.type,
      groupBy: this.data.groupBy,
    }, { silent: true }).then(data => {
      if (requestId !== this._requestId) return; // 已有更新的请求，旧响应直接丢弃
      this.setData({
        total: data.total || 0,
        rows: data.rows || [],
        details: data.details || [],
        selectedKey: '',
        filteredDetails: [],
        loading: false,
      });
    }).catch((err) => {
      if (requestId !== this._requestId) return;
      // 失败时清空视图，避免展示与当前筛选条件不匹配的历史数据
      this.setData({
        rows: [],
        details: [],
        filteredDetails: [],
        total: 0,
        selectedKey: '',
        loading: false,
      });
      // err 可能是字符串（utils/request.js 内 reject('网络异常')）或对象
      const msg = (typeof err === 'string' && err) || (err && err.message) || '统计失败';
      wx.showToast({ title: msg, icon: 'none', duration: 2000 });
    });
  },

  onTypeChange(e) {
    // type-tabs 是自定义 bindtap，不是 picker，所以 e.detail.value 不可靠，要从 dataset 取
    const idx = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= TYPES.length) return;
    const next = TYPES[idx];
    if (next.value === this.data.type) return;
    this.setData({ typeIndex: idx, type: next.value });
    if (next.value === 'stock') {
      // 库存没有"去向"维度，换成精简列表；如果之前正好停在"按去向"上要回退
      const currentInList = (next.value === 'stock' ? GROUP_BY_STOCK : GROUP_BY)
        .some(g => g.value === this.data.groupBy);
      this.setData({
        groupByList: GROUP_BY_STOCK,
        ...(currentInList ? {} : { groupByIndex: 0, groupBy: 'school' }),
      });
    } else {
      // 出库量用完整列表
      this.setData({ groupByList: GROUP_BY });
    }
    this.loadStats();
  },

  onGroupByChange(e) {
    const idx = Number(e.detail.value);
    // 用当前 data 里的 groupByList 取值（库存时是精简列表，不会取到 destination）
    const list = this.data.groupByList;
    const next = list[idx];
    if (!next) return;
    if (next.value === this.data.groupBy) return;
    this.setData({ groupByIndex: idx, groupBy: next.value });
    this.loadStats();
  },

  onRowTap(e) {
    const key = e.currentTarget.dataset.key || '';
    if (!key || this.data.selectedKey === key) {
      this.setData({ selectedKey: '', filteredDetails: [] });
      return;
    }
    const filtered = (this.data.details || []).filter(d => d.key === key);
    this.setData({ selectedKey: key, filteredDetails: filtered });
  },
});
