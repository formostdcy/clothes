// pages/boss/inbound-list/index.js
const { callCloud } = require('../../../utils/request.js');
const { formatDate } = require('../../../utils/util.js');
const { getStatusStyle } = require('../../../utils/util.js');
const pageGuard = require('../../../utils/page-guard.js');

/**
 * 老板 - 入库记录快捷入口
 *
 * 关键：
 * - 日期筛选：今日/昨日/本周/本月/自定义
 * - 后端 raw-inboundList 支持 date_from / date_to 过滤
 * - 顶部展示 单数 + 总件数
 * - 列表项只读，无操作按钮
 */
pageGuard({
  moduleKey: 'boss',
  data: {
    list: [],
    total: 0,
    totalQuantity: 0,
    rangeText: '',
    emptyText: '暂无入库记录',
    loading: false,
    page: 1,
    pageSize: 50,
    // 日期筛选
    datePreset: 'today',       // today/yesterday/week/month/custom
    customDateFrom: '',
    customDateTo: '',
  },

  onLoad() {
    // 默认进入是"今日"
    this.applyDatePreset('today');
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

  // ============ 日期筛选 ============

  // 点击日期 tab
  onDatePresetChange(e) {
    const preset = e.currentTarget.dataset.preset;
    if (preset === 'custom') {
      // 自定义需要弹日期选择器，不在这里直接 setData
      this.onCustomDate();
      return;
    }
    this.applyDatePreset(preset);
  },

  // 应用日期预设
  applyDatePreset(preset) {
    this.setData({ datePreset: preset });
    this.setData({ page: 1, list: [] });
    this.loadList();
  },

  // 点击"自定义"tab
  onCustomDate() {
    // 切换到 custom 模式
    // 如果还没有初始化自定义日期，初始化为今日
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const today = `${y}-${m}-${d}`;
    const updates = { datePreset: 'custom' };
    if (!this.data.customDateFrom) updates.customDateFrom = today;
    if (!this.data.customDateTo) updates.customDateTo = today;
    this.setData(updates);
    this.setData({ page: 1, list: [] });
    this.loadList();
  },

  onCustomFromChange(e) {
    this.setData({ customDateFrom: e.detail.value, page: 1, list: [] });
    this.loadList();
  },

  onCustomToChange(e) {
    this.setData({ customDateTo: e.detail.value, page: 1, list: [] });
    this.loadList();
  },

  // ============ 日期范围计算 ============

  // 计算要传给云函数的 date_from / date_to（毫秒时间戳）
  // 同时更新 rangeText（顶部显示）
  computeRange() {
    const now = new Date();
    let fromDate, toDate, label;

    switch (this.data.datePreset) {
      case 'today':
        fromDate = this.startOfDay(now);
        toDate = this.endOfDay(now);
        label = `今日 ${this.fmt(now)}`;
        break;
      case 'yesterday': {
        const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        fromDate = this.startOfDay(y);
        toDate = this.endOfDay(y);
        label = `昨日 ${this.fmt(y)}`;
        break;
      }
      case 'week': {
        // 本周（周一到周日）
        const day = now.getDay() || 7; // 周日为 0，转 7
        const monday = new Date(now.getTime() - (day - 1) * 24 * 60 * 60 * 1000);
        const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000);
        fromDate = this.startOfDay(monday);
        toDate = this.endOfDay(sunday);
        label = `本周 ${this.fmt(monday)} ~ ${this.fmt(sunday)}`;
        break;
      }
      case 'month': {
        // 本月（1 号到月底）
        const first = new Date(now.getFullYear(), now.getMonth(), 1);
        const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        fromDate = this.startOfDay(first);
        toDate = this.endOfDay(last);
        label = `本月 ${this.fmt(first)} ~ ${this.fmt(last)}`;
        break;
      }
      case 'custom': {
        const fromStr = this.data.customDateFrom;
        const toStr = this.data.customDateTo;
        if (!fromStr || !toStr) {
          return { date_from: 0, date_to: 0, label: '请选择日期' };
        }
        // 自定义日期是 YYYY-MM-DD 格式，转换为本地 0 点和 23:59
        const fromD = new Date(`${fromStr} 00:00:00`);
        const toD = new Date(`${toStr} 23:59:59`);
        fromDate = fromD;
        toDate = toD;
        label = `${fromStr} ~ ${toStr}`;
        break;
      }
      default:
        fromDate = this.startOfDay(now);
        toDate = this.endOfDay(now);
        label = this.fmt(now);
    }

    return {
      date_from: fromDate.getTime(),
      date_to: toDate.getTime(),
      label,
    };
  },

  // 本地 0 点
  startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  },
  // 本地 23:59:59
  endOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
  },
  // 格式化 YYYY-MM-DD
  fmt(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  // ============ 列表加载 ============

  loadList(concat = false) {
    this.setData({ loading: true });
    const range = this.computeRange();
    this.setData({ rangeText: range.label });

    console.log('[boss-inbound] 查询参数:', JSON.stringify({
      page: this.data.page,
      pageSize: this.data.pageSize,
      date_from: range.date_from,
      date_to: range.date_to,
      date_from_iso: new Date(range.date_from).toISOString(),
      date_to_iso: new Date(range.date_to).toISOString(),
      exclude_status: '已取消',
    }));

    return callCloud('raw-inboundList', {
      page: this.data.page,
      pageSize: this.data.pageSize,
      date_from: range.date_from,
      date_to: range.date_to,
      // 关键：和 boss-overview 的"今日入库"口径一致
      //      boss-overview 用 status='已入库'，这里通过 exclude_status='已取消' 实现相同效果
      exclude_status: '已取消',
    }).then(res => {
      console.log('[boss-inbound] 云函数返回:', JSON.stringify(res).slice(0, 500));
      const rawList = res.list || [];
      const list = rawList.map(item => {
        const sc = getStatusStyle(item.status) || '';
        const scName = (sc || '').replace(/^badge-/, '') || 'grey';
        return {
          ...item,
          created_at_text: formatDate(item.created_at, 'MM-DD HH:mm'),
          statusClass: sc,
          statusClassName: scName,
        };
      });
      const newList = concat ? [...this.data.list, ...list] : list;
      const newTotalQuantity = newList.reduce((s, it) => {
        return s + (it.material_details || []).reduce((ss, m) => ss + (Number(m.quantity) || 0), 0);
      }, 0);
      console.log('[boss-inbound] 渲染条数:', newList.length, '总件数:', newTotalQuantity);

      // 空提示文案
      let emptyText = '该时间段暂无入库记录';
      if (this.data.datePreset === 'today') emptyText = '今日暂无入库记录';
      else if (this.data.datePreset === 'yesterday') emptyText = '昨日暂无入库记录';
      else if (this.data.datePreset === 'week') emptyText = '本周暂无入库记录';
      else if (this.data.datePreset === 'month') emptyText = '本月暂无入库记录';

      this.setData({
        list: newList,
        total: res.total || 0,
        totalQuantity: newTotalQuantity,
        emptyText,
        loading: false,
      });
    }).catch((err) => {
      console.error('[boss-inbound] loadList 失败:', err);
      this.setData({ loading: false });
    });
  },
});
