// pages/finished/confirm/list/index.js
const { callCloud } = require('../../../../utils/request.js');
const { mapFinishedConfirm } = require('../../../../utils/field-map.js');
const { formatDate } = require('../../../../utils/util.js');
const pageGuard = require('../../../../utils/page-guard.js');
const app = getApp();

pageGuard({
  moduleKey: 'finished_inbound',
  data: {
    tab: 'todo',          // 'todo' | 'done'
    list: [],
    page: 1,
    pageSize: 20,
    total: 0,
    loading: false,
    todoCount: 0,         // 待确认 数量
    doneCount: 0,         // 已完成 数量（含已入库/有问题）
  },

  onLoad() {
    this.refreshAll();
  },

  // 切 Tab
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.tab) return;
    this.setData({ tab, page: 1, list: [] });
    this.loadList();
  },

  onReachBottom() {
    if (this.data.loading) return;
    if (this.data.list.length >= (this.data.total || 0)) return;
    this.setData({ page: this.data.page + 1 });
    this.loadList(true);
  },

  onPullDownRefresh() {
    this.refreshAll().finally(() => wx.stopPullDownRefresh());
  },

  onBackHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  // 应急工具入口
  onGoRepair() {
    wx.navigateTo({ url: '/pages/finished/confirm/repair/index' });
  },

  // 整体刷新：当前 tab 列表 + 两个 tab 的 badge
  refreshAll() {
    return Promise.all([
      this.loadList(false, true),  // 传 true 表示顺便算 badge
    ]);
  },

  loadList(concat = false, refreshBadges = false) {
    this.setData({ loading: true });
    const tab = this.data.tab;
    return callCloud('finished-confirmList', {
      tab,
      page: this.data.page,
      pageSize: this.data.pageSize
    }).then(res => {
      const rawList = Array.isArray(res.list) ? res.list : [];
      const list = rawList
        .filter(item => item && item._id)
        .map(item => {
          const mapped = mapFinishedConfirm(item);
          mapped.createTime = formatDate(mapped.createTime, 'MM-DD HH:mm');
          mapped.confirmTime = formatDate(mapped.confirmTime, 'MM-DD HH:mm');
          // 渲染时区分状态颜色
          mapped._statusClass = mapped.status === '已入库'
            ? 'list-item--done'
            : (mapped.status === '有问题' ? 'list-item--problem' : 'list-item--todo');
          return mapped;
        });
      const newList = concat ? [...(this.data.list || []), ...list] : list;
      const patch = { list: newList, total: res.total || 0, loading: false };
      this.setData(patch);

      // 顺手拉一下两个 tab 的总数当 badge
      if (refreshBadges) {
        return Promise.all([
          callCloud('finished-confirmList', { tab: 'todo', page: 1, pageSize: 1 }),
          callCloud('finished-confirmList', { tab: 'done', page: 1, pageSize: 1 }),
        ]).then(([todoRes, doneRes]) => {
          this.setData({
            todoCount: (todoRes && todoRes.total) || 0,
            doneCount: (doneRes && doneRes.total) || 0,
          });
        }).catch(() => {});
      }
    }).catch((err) => {
      console.error('[finished-confirmList] err =', err);
      this.setData({ loading: false });
    });
  },

  onConfirm(e) {
    const id = e.currentTarget.dataset.id;
    // 从当前 list 找到对应订单的 actual_quantity，传给后端
    // 后端会按 gender+style+school+size 累加到 finished_product_stock
    const order = (this.data.list || []).find(it => it && (it._id || it.id) === id);
    const actualQuantity = (order && order.actual_quantity) || (order && order.actualSizes) || [];
    console.log('[onConfirm] id=', id, '| actualQuantity=', JSON.stringify(actualQuantity));

    // 如果是已完成 tab 上的卡片，长按可以"强制重置已入库状态并重试"
    const showForce = this.data.tab === 'done' && order && order.status === '已入库';

    wx.showActionSheet({
      itemList: showForce
        ? ['重新入库（重置后重试）', '查看详情']
        : ['确认入库'],
      success: res => {
        // 0 = 第一个（确认入库 / 重新入库）
        if (res.tapIndex === 0) {
          const isForce = !!showForce;
          this.doConfirm(id, actualQuantity, isForce);
        } else if (res.tapIndex === 1 && showForce) {
          // 查看详情：弹窗显示 actual_quantity 内容
          const detail = (actualQuantity || []).map(a => `${a.size || '(空尺码)'} × ${a.count || 0}`).join('\n');
          wx.showModal({
            title: order.orderNo || '详情',
            content: detail || '无尺码数据',
            showCancel: false,
          });
        }
      }
    });
  },

  // 实际调用 confirmIn
  doConfirm(id, actualQuantity, force) {
    const userInfo = app.getUserInfo() || {};
    // silent: true 避免 callCloud 默认弹"网络异常"覆盖我们的详细错误
    callCloud('finished-confirmIn', {
      _id: id,
      actual_quantity: actualQuantity,
      finished_admin_id: userInfo._id || '',
      force: !!force,
    }, { silent: true }).then(res2 => {
      console.log('[onConfirm] 后端返回:', JSON.stringify(res2));
      // callCloud 的设计：云函数必须返回 { success, data } 或 { success, error }
      // 成功时 res2 = res.result.data，res2 内部不再有 success 字段
      // 失败时 callCloud 会 reject(error)，走进 .catch 分支
      // 但 callCloud 对老云函数（返回 { success: true, rebuilt, writtenCount } 没 data 字段）也会成功 resolve
      // 此时 res2 = res.result = { success: true, rebuilt, ... }，需要兼容
      const isSuccess = res2 && (res2.success !== false) && (res2.rebuilt !== undefined || res2.skipped !== undefined || res2.writtenCount !== undefined);
      if (isSuccess || (res2 && res2.success)) {
        if (res2.skipped) {
          wx.showToast({ title: '已入库过，跳过', icon: 'none' });
        } else {
          wx.showToast({ title: force ? '已重新入库' : '入库成功' });
        }
        this.refreshAll();
      } else {
        // 走到这里说明 res2 真的有问题
        const errMsg = (res2 && res2.error) || JSON.stringify(res2) || '未知错误（云函数返回 success=false，但没带 error 字段）';
        wx.showModal({
          title: '入库失败',
          content: errMsg,
          showCancel: false,
          confirmText: '复制错误',
          success: modalRes => {
            if (modalRes.confirm) wx.setClipboardData({ data: errMsg });
          },
        });
        this.refreshAll();
      }
    }).catch(err => {
      console.error('[onConfirm] catch err =', err);
      // 关键：callCloud 在 success=false 时 reject(res.result.error)，所以 err 就是错误字符串
      // 但有时 reject 的可能是 err 对象（云函数抛异常），所以做兼容
      let errMsg = '未知错误（未捕获）';
      if (typeof err === 'string') {
        errMsg = err;
      } else if (err && err.message) {
        errMsg = err.message;
      } else if (err && err.errMsg) {
        errMsg = err.errMsg;
      } else {
        try { errMsg = JSON.stringify(err); } catch (e) {}
      }
      wx.showModal({
        title: '入库失败',
        content: errMsg,
        showCancel: false,
        confirmText: '复制错误',
        success: modalRes => {
          if (modalRes.confirm) wx.setClipboardData({ data: errMsg });
        },
      });
    });
  },

  onProblem(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '反馈问题',
      content: '请在弹窗中输入问题描述',
      editable: true,
      placeholderText: '例如：数量与单据不符 / 尺码错乱 / 布料有色差',
      success: res => {
        if (res.confirm && res.content && res.content.trim()) {
          callCloud('finished-confirmProblem', { _id: id, problem_desc: res.content.trim() }).then(() => {
            wx.showToast({ title: '已反馈' });
            this.refreshAll();
          });
        } else if (res.confirm) {
          wx.showToast({ title: '问题描述不能为空', icon: 'none' });
        }
      }
    });
  }
});
