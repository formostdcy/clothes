const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 娓氭稑绨查崯鍡欘吀閻�?- 閺傛澘顤�
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { name, contact_name, contact_phone } = event;

  if (!name) return { success: false, error: '娓氭稑绨查崯鍡楁倳缁夐绗夐懗鎴掕礋缁�'};

  try {
    const res = await db.collection('supplier').add({
      data: {
        name: name.trim(),
        contact_name: contact_name || '',
        contact_phone: contact_phone || '',
        created_at: db.serverDate(),
        updated_at: db.serverDate(),
      },
    });
    return { success: true, data: { _id: res._id } };
  } catch (e) {
    console.error('閺傛澘顤冩笟娑樼安閸熷棗銇戠拹?', e);
    return { success: false, error: '閺傛澘顤冩径杈Е' };
  }
};
