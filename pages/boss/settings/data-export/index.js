// pages/boss/settings/data-export/index.js
const { callCloud } = require('../../../../utils/request.js');
const { formatDate } = require('../../../../utils/util.js');

function toCSV(rows) {
  if (!rows || !rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = v => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const lines = [headers.join(',')];
  rows.forEach(r => {
    lines.push(headers.map(h => escape(r[h])).join(','));
  });
  return lines.join('\n');
}

function copyCSV(csv, fileName) {
  if (!csv) {
    wx.showToast({ title: '无数据可导出', icon: 'none' });
    return;
  }
  wx.setClipboardData({
    data: csv,
    success: () => {
      wx.showToast({ title: `${fileName} 已复制`, icon: 'success' });
    }
  });
}

const pageGuard = require('../../../../utils/page-guard.js');

pageGuard({
  moduleKey: 'boss',
  data: {
    exported: false
  },

  onExportRaw() {
    callCloud('raw-stockList', { page: 1, pageSize: 1000 }).then(res => {
      const list = (res && res.list) || [];
      if (!list.length) return copyCSV('', '原材料库存');
      const rows = list.map(item => ({
        一级分类: item.category_one || '',
        二级分类: item.category_two || '',
        数量: item.total_quantity || 0,
        单位: item.unit || '',
        预警阈值: item.warning_threshold || 0
      }));
      copyCSV(toCSV(rows), '原材料库存');
      this.flashExported();
    }).catch(() => {
      wx.showToast({ title: '导出失败', icon: 'none' });
    });
  },

  onExportFinished() {
    callCloud('finished-stockList', { page: 1, pageSize: 1000 }).then(res => {
      const list = (res && res.list) || [];
      if (!list.length) return copyCSV('', '成品库存');
      const rows = list.map(item => ({
        学校: item.school || '',
        款式: item.style || '',
        季节: item.season || '',
        性别: item.gender || '',
        尺码: item.size || '',
        数量: item.quantity || 0
      }));
      copyCSV(toCSV(rows), '成品库存');
      this.flashExported();
    }).catch(() => {
      wx.showToast({ title: '导出失败', icon: 'none' });
    });
  },

  onExportOrders() {
    callCloud('boss-orderList', { page: 1, pageSize: 1000 }).then(res => {
      const list = (res && res.list) || [];
      if (!list.length) return copyCSV('', '订单记录');
      const rows = list.map(item => {
        const prefix = (item.order_no || '').split('-')[0] || '';
        const typeLabel = {
          'RK': '原材料入库',
          'CK': '原材料出库',
          'CJ': '裁剪',
          'JG': '加工',
          'CC': '成品出库'
        }[prefix] || '';
        return {
          订单号: item.order_no || '',
          类型: typeLabel,
          状态: item.status || '',
          创建时间: formatDate(item.created_at, 'YYYY-MM-DD HH:mm:ss'),
          备注: item.remark || ''
        };
      });
      copyCSV(toCSV(rows), '订单记录');
      this.flashExported();
    }).catch(() => {
      wx.showToast({ title: '导出失败', icon: 'none' });
    });
  },

  flashExported() {
    this.setData({ exported: true });
    if (this._exportTimer) clearTimeout(this._exportTimer);
    this._exportTimer = setTimeout(() => {
      this.setData({ exported: false });
    }, 4000);
  }
});
