const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 闂備礁鎲″玻鍧楀窗閹邦兗缂氭俊銈呮噹濡拷?- 闂備礁鎼崐鐟邦熆濮椻偓璺柛鎰靛枛缁€澶愭煟濡灝鐨烘慨妯稿姂閺屾盯鏁撻敓锟`? * 闂備礁鎲￠崙褰掑磻閸曨叀濮抽弶鍫氭杹閸嬫挸鈽夊▍铏灴瀵娊鎮㈤崗鑲╁帓闂婎偄娲﹀ú婊堝蓟閸儲鐓曢柡鍐ㄥ€搁埢鍫ユ煃瑜滈崜姘ｉ幒鏃€顐介柨鐕傛嫹
 */

const crypto = require('crypto');

function generateOrderNo() {
  // 关键：云函数在云端运行，默认是 UTC 时间，需要 +8 小时偏移得到北京时间
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `RK-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}${rand}`;
}

exports.main = async (event, context) => {
  const db = cloud.database();
  const { supplier_id, supplier_name, material_details, photos, remark, creator_id } = event;

  // 闂備礁鎲￠悷銉╁磹瑜版帒姹查柣鏃傚帶閸愨偓闂佽法鍠撴慨宄扮暦閿燂拷
  if (!material_details || material_details.length === 0) {
    return { success: false, error: '闂備胶绮妵娑㈠疾濠婂牆鍑犻柨鐔哄Т閸欏﹪骞栨潏鍓ф偧闁活厼楠搁埥澶愬箻瀹曞泦銉╂煕韫囨枏鎴犵矙婢舵劖鎯為柛蹇擃槹閺咃拷' };
  }
  if (!creator_id) {
    return { success: false, error: '闂備礁鎲＄敮妤冪矙閹寸姷纾介柟鎯ь嚟椤╂煡寮堕悙鏉戭棆闁荤喐绻堥弻銈夋惞椤愩垻浜伴柣鐘冲姉閸犳挾鍒掗敓锟`'};
  }

  try {
    // 闁诲孩顔栭崰鎺楀磻閹剧粯鐓曟慨妯煎帶閻忕喓绱掗妸锝呭鐎规洩鎷`'
const res = await db.runTransaction(async (transaction) => {
      // 1. 闂備礁鎲＄敮妤冪矙閹寸姷纾介柟鎹愵嚙缁€鍌炴煏婢跺牆鍔ゆ慨妯稿姂閺屾盯鏁撻敓锟`'
const orderRes = await transaction.collection('raw_inbound_order').add({
        data: {
          order_no: generateOrderNo(),
          supplier_id: supplier_id || null,
          supplier_name: supplier_name || '',
          creator_id,
          material_details,
          photos: photos || [],
          remark: remark || '',
          status: '已入库',
          created_at: db.serverDate(),
        },
      });

      // 2. 闂佸湱鍘ч悺銊╁箰閹间焦鍋ら柕濞у嫷娼熷銈嗙墬閼归箖锝為敐澶嬬叆婵炴垶岣挎晶娑㈡倵绾板瀚` category_one + category_two 闂佽姘﹂～澶愭儗椤斿墽绀婇柛娑欐綑閼歌銇勯弽銊ф噮妞ゅ繘浜堕幃瑙勬媴鐟欏嫮鍑＄紓鍌氱Т缁夊綊寮敓锟`'
for (const item of material_details) {
        const { category_one, category_two, quantity, unit } = item;
        if (!quantity || quantity <= 0) continue;

        // 闂備礁鎼悮顐﹀磿閹绢噮鏁嬫俊銈呮噹閸欏﹥銇勯弽銊ь暡闁稿骸锕幃妤€鈽夊▍顓т簻閿曘垽顢旈崱妯虹彴闂侀潧锛忛崘锝嗗瘶闂備礁鎼崐褰掓偡閵壯嗗С閺夊牃鏂侀崑鎾绘晸閿燂拷'
const stockRes = await transaction.collection('raw_material_stock')
          .where({ category_one, category_two })
          .limit(1)
          .get();

        if (stockRes.data.length > 0) {
          // 闂佽瀛╃粙鎺楁晪濠电姭鍋撴い蹇撶墕缁€鍡樼箾閸℃ê鐏╅柡灞界墦閺屾盯鏁撻敓锟`'
await transaction.collection('raw_material_stock')
            .doc(stockRes.data[0]._id)
            .update({
              data: {
                total_quantity: db.command.inc(quantity),
                updated_at: db.serverDate(),
              },
            });
        } else {
          // 濠电偞鍨堕幐鍝ョ矓閹绢喗鍋ら柕濞炬櫅閹瑰爼鏌曟繛鍨姎闁诲繒鍠栭弻锟犲磼濞戞瑧鍑＄紓鍌氬亰閹凤拷
          await transaction.collection('raw_material_stock').add({
            data: {
              category_one,
              category_two,
              total_quantity: quantity,
              unit: unit || (category_one === '闂佹眹鍩勯崹浼村疮椤栫偛鍑犻柨鐕傛嫹' ? '缂傚倷绶ら幏锟' : '濠电偞鍩婇幏锟'),
              warning_threshold: 0,
              updated_at: db.serverDate(),
            },
          });
        }
      }

      return orderRes;
    });

    return { success: true, data: { _id: res._id, order_no: res.order_no || '' } };
  } catch (e) {
    console.error('闂備礁鎼崐鐟邦熆濮椻偓璺柛鎰靛枛缁€澶愭煟濡灝鐨烘慨妯稿姂閺屾稑螖娴ｅ湱顦ラ梺闈涙处閸ㄥ綊骞忛敓锟', e);
    if (e.message && e.message.includes('transaction')) {
      return { success: false, error: '濠电偛鐡ㄧ划宀勵敄閸涱喗鍙忛柣鏃傚帶缁犮儳鎲搁幋锔衡偓渚€骞嬮悙鑼獮闁哄鐗滈崑澶庮杺闂備焦瀵х粙鎴︽儗娓氣偓椤㈡岸顢楅崟顒傚帓閻庡箍鍎遍悧蹇撐ｉ敓锟`' };
    }
    return { success: false, error: '闂備礁鎼崐鐟邦熆濮椻偓璺柛鎰靛枛缁€澶愭煟濡灝鐨烘慨妯稿姂閺屾稑螖娴ｅ湱顦ラ梺闈涙处閸ㄥ綊骞忛敓锟`'};
  }
};
