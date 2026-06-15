const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 成品 - 库存导出 Excel
 * 支持当前筛选条件（gender/style/season/school/workshop_admin_id）
 * 一次拉全部（pageSize=10000），写入云存储，返 fileID
 */
exports.main = async (event, context) => {
  const db = cloud.database();

  try {
    const xlsx = require('xlsx');
    const { gender, style, season, school, workshop_admin_id } = event;

    let where = {};
    if (gender) where.gender = gender;
    if (style)  where.style  = style;
    if (season) where.season = season;
    if (school) where.school = school;
    if (workshop_admin_id) where.workshop_admin_id = workshop_admin_id;

    const res = await db.collection('finished_product_stock')
      .where(where)
      .orderBy('school', 'asc')
      .orderBy('style', 'asc')
      .orderBy('season', 'asc')
      .orderBy('size', 'asc')
      .limit(10000)
      .get();

    const list = res.data || [];

    if (list.length === 0) {
      return { success: false, error: '当前筛选条件下无数据' };
    }

    const totalQty = list.reduce((s, x) => s + (x.quantity || 0), 0);

    // 拼 Sheet 数据（SKU 5 维：性别/款式/季节/学校/尺码）
    const sheetData = [
      ['性别', '款式', '季节', '学校', '尺码', '库存数量', '来源车间'],
      ...list.map(item => [
        item.gender || '',
        item.style  || '',
        item.season || '',
        item.school || '',
        item.size   || '',
        item.quantity || 0,
        item.workshop_admin_id || '—',
      ]),
      ['', '', '', '', '合计', totalQty, ''],
    ];

    const ws = xlsx.utils.aoa_to_sheet(sheetData);
    // 冻结首行 + 自动列宽
    ws['!cols'] = [
      { wch: 8 },  // 性别
      { wch: 12 }, // 款式
      { wch: 10 }, // 季节
      { wch: 20 }, // 学校
      { wch: 8 },  // 尺码
      { wch: 10 }, // 库存
      { wch: 20 }, // 来源车间
    ];

    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, '成品库存');
    const buf = xlsx.write(wb, { bookType: 'xlsx', type: 'buffer' });

    // 上传到云存储
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `finished_stock_${timestamp}.xlsx`;
    const uploadRes = await cloud.uploadFile({
      cloudPath: `exports/${fileName}`,
      fileContent: buf,
    });

    return { success: true, fileID: uploadRes.fileID };
  } catch (e) {
    console.error('成品库存导出失败:', e);
    return { success: false, error: e.message || '导出失败' };
  }
};
