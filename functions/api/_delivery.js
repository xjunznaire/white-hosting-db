import {id} from "./_utils.js";

// Claim one available inventory row at a time. The conditional UPDATE prevents
// two simultaneous webhook deliveries from selling the same item twice.
export async function reserveOrder(env, orderId, productId, quantity) {
  let reserved = 0;
  while (reserved < quantity) {
    const item = await env.DB.prepare(`UPDATE delivery_items SET status='reserved',order_id=?,reserved_at=datetime('now')
      WHERE id=(SELECT id FROM delivery_items WHERE product_id=? AND status='available' ORDER BY created_at,id LIMIT 1)
      AND status='available' RETURNING id`).bind(orderId,productId).first();
    if (!item) break;
    reserved++;
  }
  if (reserved !== quantity) {
    await releaseReservation(env,orderId);
    return false;
  }
  await env.DB.prepare("UPDATE products SET stock=(SELECT COUNT(*) FROM delivery_items WHERE product_id=? AND status='available'),updated_at=datetime('now') WHERE id=?")
    .bind(productId,productId).run();
  return true;
}

export async function releaseReservation(env, orderId) {
  const row = await env.DB.prepare("SELECT product_id FROM delivery_items WHERE order_id=? AND status='reserved' LIMIT 1").bind(orderId).first();
  await env.DB.prepare("UPDATE delivery_items SET status='available',order_id=NULL,reserved_at=NULL WHERE order_id=? AND status='reserved'").bind(orderId).run();
  if (row) await env.DB.prepare("UPDATE products SET stock=(SELECT COUNT(*) FROM delivery_items WHERE product_id=? AND status='available'),updated_at=datetime('now') WHERE id=?").bind(row.product_id,row.product_id).run();
}

export async function fulfillOrder(env, orderId) {
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id=?").bind(orderId).first();
  if (!order || order.status !== "paid") return {ok:false, reason:"order_not_paid"};

  // Convert the exact items reserved at checkout into delivered inventory.
  const reserved = await env.DB.prepare("UPDATE delivery_items SET status='delivered',delivered_at=datetime('now'),reserved_at=NULL WHERE order_id=? AND status='reserved'").bind(orderId).run();
  if (reserved.meta?.changes) await env.DB.prepare("UPDATE products SET stock=MAX(0,stock-?),updated_at=datetime('now') WHERE id=?").bind(reserved.meta.changes,order.product_id).run();

  let delivered = await env.DB.prepare("SELECT COUNT(*) AS n FROM delivery_items WHERE order_id=? AND status='delivered'")
    .bind(orderId).first();
  let count = Number(delivered?.n || 0);

  while (count < Number(order.quantity)) {
    const claimed = await env.DB.prepare(`UPDATE delivery_items
      SET status='delivered', order_id=?, delivered_at=datetime('now')
      WHERE id=(SELECT id FROM delivery_items WHERE product_id=? AND status='available'
        AND (SELECT COUNT(*) FROM delivery_items WHERE order_id=? AND status='delivered') < (SELECT quantity FROM orders WHERE id=?)
        ORDER BY created_at,id LIMIT 1)
      AND status='available'
      RETURNING id,payload`).bind(orderId, order.product_id, orderId, orderId).first();
    if (!claimed) break;
    count++;
    await env.DB.prepare("UPDATE products SET stock=MAX(0,stock-1),updated_at=datetime('now') WHERE id=?")
      .bind(order.product_id).run();
  }

  const status = count >= Number(order.quantity) ? "fulfilled" : count > 0 ? "partial" : "awaiting_stock";
  await env.DB.prepare("UPDATE orders SET delivery_status=?,updated_at=datetime('now') WHERE id=? AND status='paid'")
    .bind(status, orderId).run();
  return {ok:status === "fulfilled", status, delivered:count, required:Number(order.quantity)};
}

export async function addInventory(env, productId, values) {
  let added = 0;
  for (const payload of values) {
    const result = await env.DB.prepare("INSERT INTO delivery_items(id,product_id,payload) VALUES(?,?,?)")
      .bind(id("INV"), productId, payload).run();
    if (result.meta?.changes) added++;
  }
  await env.DB.prepare("UPDATE products SET stock=(SELECT COUNT(*) FROM delivery_items WHERE product_id=? AND status='available'),updated_at=datetime('now') WHERE id=?")
    .bind(productId, productId).run();
  return added;
}
