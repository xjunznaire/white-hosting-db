import {json,fail,id,admin,body} from "./_utils.js";
import {addInventory,fulfillOrder} from "./_delivery.js";
export async function onRequestGet({request,env}) {
  const user=await admin(request,env); if(!user) return fail("Silakan login sebagai admin.",401);
  const [products,orders,stats]=await Promise.all([
    env.DB.prepare("SELECT p.*, (SELECT COUNT(*) FROM delivery_items di WHERE di.product_id=p.id AND di.status='available') AS stock FROM products p ORDER BY p.created_at DESC").all(),
    env.DB.prepare("SELECT id,customer_name,customer_email,product_name,quantity,amount,status,delivery_status,created_at FROM orders ORDER BY created_at DESC LIMIT 100").all(),
    env.DB.prepare("SELECT COUNT(*) orders, COALESCE(SUM(CASE WHEN status='paid' THEN amount ELSE 0 END),0) revenue, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending FROM orders").first()
  ]);
  return json({email:user.email,products:products.results||[],orders:orders.results||[],stats});
}
export async function onRequestPost({request,env}) {
  const user=await admin(request,env); if(!user) return fail("Tidak diizinkan.",401);
  const d=await body(request); if(!d) return fail("Data tidak valid.");
  if(d.action==="saveProduct") {
    const p=d.product||{}, name=String(p.name||"").trim(), price=Number(p.price);
    if(!name || name.length>120 || !Number.isSafeInteger(price) || price<1) return fail("Nama produk (maksimal 120 karakter) dan harga valid wajib diisi.");
    const pid=p.id||id("PRD");
    await env.DB.prepare(`INSERT INTO products(id,name,description,category,price,stock,image_url,active,updated_at)
      VALUES(?,?,?,?,?,0,?,?,datetime('now')) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,category=excluded.category,price=excluded.price,image_url=excluded.image_url,active=excluded.active,updated_at=datetime('now')`)
      .bind(pid,name,String(p.description||"").slice(0,2000),String(p.category||"Digital").slice(0,60),price,String(p.image_url||"").slice(0,1000),p.active===false?0:1).run();
    return json({ok:true,id:pid});
  }
  if(d.action==="deleteProduct") {
    const count=await env.DB.prepare("SELECT COUNT(*) n FROM orders WHERE product_id=?").bind(String(d.id)).first();
    if(count.n) return fail("Produk sudah memiliki riwayat pesanan. Nonaktifkan produk agar riwayat tetap aman.",409);
    await env.DB.prepare("DELETE FROM products WHERE id=?").bind(String(d.id)).run(); return json({ok:true});
  }
  if(d.action==="getInventory") {
    const productId=String(d.product_id||"");
    const rows=await env.DB.prepare("SELECT id,payload,created_at FROM delivery_items WHERE product_id=? AND status='available' ORDER BY created_at,id LIMIT 200").bind(productId).all();
    const count=await env.DB.prepare("SELECT COUNT(*) n FROM delivery_items WHERE product_id=? AND status='available'").bind(productId).first();
    return json({items:rows.results||[],count:count.n||0});
  }
  if(d.action==="addInventory") {
    const productId=String(d.product_id||""), product=await env.DB.prepare("SELECT id FROM products WHERE id=?").bind(productId).first();
    if(!product) return fail("Produk tidak ditemukan.",404);
    const raw=String(d.items||"");
    const values=[...new Set(raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean))];
    if(!values.length) return fail("Masukkan minimal satu item stok, satu baris untuk setiap item.");
    if(values.length>100) return fail("Maksimal 100 item per proses.");
    if(values.some(x=>x.length>4000)) return fail("Setiap item maksimal 4.000 karakter.");
    const added=await addInventory(env,productId,values);
    return json({ok:true,added});
  }
  if(d.action==="deleteInventory") {
    const item=await env.DB.prepare("SELECT product_id FROM delivery_items WHERE id=? AND status='available'").bind(String(d.id)).first();
    const result=await env.DB.prepare("DELETE FROM delivery_items WHERE id=? AND status='available'").bind(String(d.id)).run();
    if(item && result.meta?.changes) await env.DB.prepare("UPDATE products SET stock=(SELECT COUNT(*) FROM delivery_items WHERE product_id=? AND status='available'),updated_at=datetime('now') WHERE id=?").bind(item.product_id,item.product_id).run();
    return json({ok:true,deleted:result.meta?.changes||0});
  }
  if(d.action==="retryDelivery") {
    const result=await fulfillOrder(env,String(d.id||""));
    if(!result.ok) return json({ok:false,...result,message:"Stok belum cukup untuk menyelesaikan pengiriman. Tambahkan stok lalu coba lagi."},409);
    return json({ok:true,...result});
  }
  if(d.action==="setOrderStatus") {
    const status=["pending","cancelled","expired"].includes(d.status)?d.status:null;
    if(!status) return fail("Status tidak valid. Status lunas hanya dari webhook terverifikasi.");
    await env.DB.prepare("UPDATE orders SET status=?,updated_at=datetime('now') WHERE id=? AND status!='paid'").bind(status,String(d.id)).run();
    return json({ok:true});
  }
  return fail("Aksi tidak dikenal.");
}
