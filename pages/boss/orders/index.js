// pages/boss/orders/index.js
// 老板 - 订单记录列表
// 顶部筛选：模块 / 状态 / 时间 / 关键词
// 每条订单展示：订单号 + 模块 + 状态 + 创建时间 + 操作人 + 概要 + 时间轴（点击节点看详情）

const { callCloud } = require('../../../utils/request.js');
const { formatDate, getStatusStyle } = require('../../../utils/util.js');
const pageGuard = require('../../../utils/page-guard.js');

pageGuard({
  moduleKey: 'boss',
  data: {
    // 模块
    modules: [
      { name: '全模块', value: '' },
      { name: '原材料入库', value: 'raw_inbound' },
      { name: '原材料出库', value: 'raw_outbound' },
      { name: '裁剪', value: 'cutting' },
      { name: '加工', value: 'processing' },
      { name: '成品出库', value: 'finished_outbound' },
    ],
    moduleIndex: 0,
    module: '',

    // 状态（按模块动态变化，初始为空表示全部）
    statusOptions: [{ name: '全部状态', value: '' }],
    statusIndex: 0,
    status: '',

    // 时间范围
    timeRangeOptions: [
      { name: '全部时间', value: '' },
      { name: '今天', value: 'today' },
      { name: '近 7 天', value: '7d' },
      { name: '近 30 天', value: '30d' },
      { name: '自定义', value: 'custom' },
    ],
    timeRangeIndex: 0,
    timeRange: '',
    timeFrom: '',
    timeTo: '',

    // 搜索
    keyword: '',

    // 列表
    list: [],
    page: 1,
    pageSize: 20,
    total: 0,
    loading: false,
    _searchTimer: null,

    // 时间轴弹窗
    timelineModal: {
      show: false,
      orderNo: '',
      moduleLabel: '',
      timeline: [],
      operatorNames: '',
      loading: false,
    },
    // 节点详情弹窗
    nodeModal: {
      show: false,
      stageLabel: '',
      time: '',
      operatorName: '',
      status: '',
      fields: [],
      photos: [],
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

  // 解析时间范围
  resolveTimeRange() {
    const tr = this.data.timeRange;
    if (!tr) return { timeFrom: '', timeTo: '' };
    const now = new Date();
    if (tr === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { timeFrom: start.toISOString(), timeTo: '' };
    }
    if (tr === '7d' || tr === '30d') {
      const days = tr === '7d' ? 7 : 30;
      const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      return { timeFrom: start.toISOString(), timeTo: '' };
    }
    // custom：使用 timeFrom / timeTo
    return { timeFrom: this.data.timeFrom, timeTo: this.data.timeTo };
  },

  // 加载订单列表
  loadList() {
    this.setData({ loading: true });
    const { timeFrom, timeTo } = this.resolveTimeRange();
    return callCloud('boss-orderList', {
      module: this.data.module,
      status: this.data.status,
      keyword: this.data.keyword,
      timeFrom,
      timeTo,
      page: this.data.page,
      pageSize: this.data.pageSize,
    }).then(data => {
      const list = (data.list || []).map(item => ({
        ...item,
        created_at_label: formatDate(item.created_at, 'YYYY-MM-DD HH:mm'),
      }));
      const newList = this.data.page === 1 ? list : [...this.data.list, ...list];
      this.setData({ list: newList, total: data.total, loading: false });
    }).catch(() => this.setData({ loading: false }));
  },

  // ============ 筛选器 ============
  onModuleChange(e) {
    const idx = e.detail.value;
    const module = this.data.modules[idx].value;
    this.setData({
      moduleIndex: idx,
      module,
      page: 1,
      list: [],
    });
    // 切换模块时重置状态（因为不同模块的状态不一样）
    this.setData({ statusOptions: [{ name: '全部状态', value: '' }], statusIndex: 0, status: '' });
    this.loadList();
  },

  onStatusChange(e) {
    const idx = e.detail.value;
    const status = this.data.statusOptions[idx] ? this.data.statusOptions[idx].value : '';
    this.setData({ statusIndex: idx, status, page: 1, list: [] });
    this.loadList();
  },

  onTimeRangeChange(e) {
    const idx = e.detail.value;
    const tr = this.data.timeRangeOptions[idx].value;
    this.setData({ timeRangeIndex: idx, timeRange: tr, page: 1, list: [] });
    if (tr === 'custom') {
      // 弹自定义时间选择
      this.onPickCustomTime();
    } else {
      this.loadList();
    }
  },

  onPickCustomTime() {
    // 让用户先选起始时间
    wx.showActionSheet({
      itemList: ['选择起始时间', '选择结束时间', '清除自定义'],
      success: (res) => {
        if (res.tapIndex === 0) this._pickDate('timeFrom', '选择起始时间');
        else if (res.tapIndex === 1) this._pickDate('timeTo', '选择结束时间');
        else {
          this.setData({ timeFrom: '', timeTo: '', timeRange: '', timeRangeIndex: 0, page: 1, list: [] });
          this.loadList();
        }
      },
    });
  },

  _pickDate(field, title) {
    // 直接弹一个最简单的输入框（时间选择器需要插件，这里用 prompt 占位）
    wx.showModal({
      title,
      editable: true,
      placeholderText: 'YYYY-MM-DD HH:mm',
      success: (res) => {
        if (res.confirm && res.content) {
          const v = res.content.trim();
          const iso = this._parseLocalDate(v);
          if (!iso) {
            wx.showToast({ title: '格式错误，请用 YYYY-MM-DD HH:mm', icon: 'none' });
            return;
          }
          this.setData({ [field]: iso, page: 1, list: [] });
          this.loadList();
        }
      },
    });
  },

  _parseLocalDate(s) {
    // 解析 "YYYY-MM-DD HH:mm" 为 ISO 字符串
    const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?$/);
    if (!m) return '';
    const d = new Date(
      Number(m[1]), Number(m[2]) - 1, Number(m[3]),
      Number(m[4] || 0), Number(m[5] || 0), 0
    );
    return d.toISOString();
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

  // ============ 时间轴弹窗 ============
  onOpenTimeline(e) {
    const { id, no, mod, modlabel } = e.currentTarget.dataset;
    this.setData({
      'timelineModal.show': true,
      'timelineModal.orderNo': no,
      'timelineModal.moduleLabel': modlabel,
      'timelineModal.loading': true,
      'timelineModal.timeline': [],
    });
    callCloud('boss-orderTimeline', { order_id: id, module: mod })
      .then(res => {
        const timeline = (res && res.timeline) || [];
        timeline.forEach(t => {
          t.timeLabel = this._fmtTime(t.time);
        });
        this.setData({
          'timelineModal.timeline': timeline,
          'timelineModal.loading': false,
        });
      })
      .catch(err => {
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
        this.setData({ 'timelineModal.loading': false });
      });
  },

  onCloseTimeline() {
    this.setData({ 'timelineModal.show': false });
  },

  onNodeTap(e) {
    const idx = e.currentTarget.dataset.idx;
    const node = this.data.timelineModal.timeline[idx];
    if (!node) return;
    // 直接用后端给的友好字段
    this.setData({
      'nodeModal.show': true,
      'nodeModal.stageLabel': node.stageLabel || '',
      'nodeModal.time': node.timeLabel || '',
      'nodeModal.operatorName': node.operatorName || '未知',
      'nodeModal.status': node.status || '',
      'nodeModal.fields': node.fields || [],
      'nodeModal.photos': node.photos || [],
    });
  },

  onCloseNode() {
    this.setData({ 'nodeModal.show': false });
  },

  // 预览照片
  onPreviewImage(e) {
    const src = e.currentTarget.dataset.src;
    if (!src) return;
    wx.previewImage({
      current: src,
      urls: this.data.nodeModal.photos || [src],
    });
  },

  _fmtTime(t) {
    if (!t) return '';
    const d = new Date(t);
    const pad = n => n < 10 ? '0' + n : '' + n;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },
});
