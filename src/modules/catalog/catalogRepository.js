const db = require('../../database/database');
const logger = require('../../config/logger');

function normalizeKey(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[\s\-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_');
}

function formatIDR(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return 'Rp-';
  try {
    return 'Rp' + num.toLocaleString('id-ID');
  } catch {
    return `Rp${num}`;
  }
}

class CatalogRepository {
  getGroupCatalog(chatId) {
    const cid = String(chatId);
    const all = db.get('catalogs') || {};
    if (!all[cid]) {
      all[cid] = { products: {} };
      db.data.catalogs = all;
    }
    if (!all[cid].products) all[cid].products = {};
    return all[cid];
  }

  listProducts(chatId) {
    const cat = this.getGroupCatalog(chatId);
    return Object.values(cat.products || {});
  }

  findProduct(chatId, name) {
    const key = normalizeKey(name);
    if (!key) return null;
    const cat = this.getGroupCatalog(chatId);
    // direct key
    if (cat.products[key]) return cat.products[key];
    // fallback: compare normalized stored names
    for (const p of Object.values(cat.products)) {
      if (normalizeKey(p.name) === key || normalizeKey(p.id) === key) return p;
    }
    return null;
  }

  setProduct(chatId, name, { price = 0, stock = 0, quota = null } = {}) {
    const cid = String(chatId);
    const key = normalizeKey(name);
    if (!key) throw new Error('Nama produk tidak valid.');
    const cat = this.getGroupCatalog(cid);
    const prev = cat.products[key] || {};
    const product = {
      id: key,
      name: String(name).trim(),
      price: Number(price) || 0,
      stock: Number(stock) || 0,
      // quota = alias sisa kuota; default mengikuti stock bila tidak diisi
      quota: quota === null || quota === undefined ? Number(stock) || 0 : Number(quota) || 0,
      updatedAt: new Date().toISOString(),
      createdAt: prev.createdAt || new Date().toISOString(),
    };
    cat.products[key] = product;
    db.set('catalogs', cid, cat, true);
    logger.info({ chatId: cid, product: key }, 'Catalog product upserted');
    return product;
  }

  deleteProduct(chatId, name) {
    const cid = String(chatId);
    const key = normalizeKey(name);
    const cat = this.getGroupCatalog(cid);
    if (cat.products[key]) {
      delete cat.products[key];
      db.set('catalogs', cid, cat, true);
      return true;
    }
    return false;
  }

  getPrice(chatId, name) {
    const p = this.findProduct(chatId, name);
    return p ? p.price : null;
  }

  getStock(chatId, name) {
    const p = this.findProduct(chatId, name);
    if (!p) return null;
    // quota diutamakan bila berbeda dari stock, agar @sisa_kuota bermakna
    return p.quota !== undefined ? p.quota : p.stock;
  }

  // ---------- Orders (ringan, untuk @order_id) ----------
  _allOrders() {
    return db.get('catalogOrders') || {};
  }

  getLastOrder(chatId, userId) {
    const cid = String(chatId);
    const uid = String(userId);
    const all = this._allOrders();
    const list = (all[cid] && all[cid][uid]) || [];
    if (list.length === 0) return null;
    return list[list.length - 1];
  }

  createOrder(chatId, userId, { product = null, amount = 0 } = {}) {
    const cid = String(chatId);
    const uid = String(userId);
    const all = this._allOrders();
    if (!all[cid]) all[cid] = {};
    if (!all[cid][uid]) all[cid][uid] = [];
    const seq = all[cid][uid].length + 1;
    // Format stabil per user: ORD-<chatShort>-<userShort>-<seq>
    const orderId = `ORD-${cid.slice(-4)}-${uid.slice(-4)}-${String(seq).padStart(3, '0')}`;
    const order = {
      id: orderId,
      product,
      amount: Number(amount) || 0,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    all[cid][uid].push(order);
    db.data.catalogOrders = all;
    db.queueWrite();
    return order;
  }
}

const instance = new CatalogRepository();

module.exports = instance;
module.exports.normalizeKey = normalizeKey;
module.exports.formatIDR = formatIDR;
