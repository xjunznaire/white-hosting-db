import {json} from "./_utils.js";
export async function onRequestGet({env}) {
  const {results=[]} = await env.DB.prepare("SELECT p.id,p.name,p.description,p.category,p.price,(SELECT COUNT(*) FROM delivery_items di WHERE di.product_id=p.id AND di.status='available') AS stock,p.image_url FROM products p WHERE p.active=1 ORDER BY p.created_at DESC").all();
  return json({products:results});
}
