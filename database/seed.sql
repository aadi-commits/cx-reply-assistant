-- Fictional but realistic demonstration data. These records are synthetic and
-- are intended only for testing the CX Reply Assistant; they are not real customers.

INSERT INTO brands (name) VALUES
  ('Acme Drinks'),
  ('Northstar Hydration')
ON CONFLICT (name) DO NOTHING;

INSERT INTO customers (name, email) VALUES
  ('Alex Chen', 'alex@datastraw.demo'),
  ('Maya Patel', 'maya.patel@example.test'),
  ('Ethan Brooks', 'ethan.brooks@example.test')
ON CONFLICT DO NOTHING;

-- Support knowledge: specific and internally consistent example policies.
INSERT INTO kb_entries (brand_id, category, title, content)
SELECT b.id, v.category, v.title, v.content
FROM brands b
JOIN (VALUES
  ('Acme Drinks','REFUND','Damaged bottle refund','If a bottle arrives cracked, leaking, or otherwise damaged, ask the customer for the order number and a photo. Offer a replacement or refund within 30 days of delivery. Do not ask the customer to return a leaking bottle.'),
  ('Northstar Hydration','RETURN','Unused item returns','Unused Northstar products in their original packaging can be returned within 30 days of delivery. The customer should provide the order number before a return is approved.'),
  ('Northstar Hydration','SHIPPING','Delivery estimates','Standard delivery normally takes 3–5 business days after dispatch. Tracking is emailed when the parcel leaves the warehouse. Carrier delays can add 1–3 business days.')
) AS v(brand_name, category, title, content) ON b.name = v.brand_name
WHERE NOT EXISTS (SELECT 1 FROM kb_entries k WHERE k.brand_id = b.id AND k.title = v.title);

-- Conversations: each order references a matching fictional customer and brand.
INSERT INTO conversations (brand_id, customer_id, order_id, status)
SELECT b.id, c.id, v.order_id, v.status
FROM (VALUES
  ('Acme Drinks','alex@datastraw.demo','NSH-24081','OPEN'),
  ('Northstar Hydration','maya.patel@example.test','NSH-24076','OPEN'),
  ('Northstar Hydration','ethan.brooks@example.test','NSH-24063','OPEN')
) AS v(brand_name, customer_email, order_id, status)
JOIN brands b ON b.name = v.brand_name
JOIN customers c ON c.email = v.customer_email
WHERE NOT EXISTS (SELECT 1 FROM conversations x WHERE x.order_id = v.order_id);

-- Seed two or three realistic message turns per conversation, without duplicates.
INSERT INTO messages (conversation_id, sender_type, content)
SELECT c.id, v.sender_type, v.content
FROM (VALUES
 ('NSH-24081','CUSTOMER','Hi, my insulated bottle arrived with a crack near the lid and leaks when I fill it. Could you help?'),
 ('NSH-24076','CUSTOMER','My tracking has not changed for four days. Is my order still on the way?'),
 ('NSH-24076','AGENT','I can check the shipment. Standard delivery is usually 3–5 business days after dispatch. Please allow me to review the tracking details.'),
 ('NSH-24063','CUSTOMER','I ordered the wrong colour yesterday. Can I cancel and place a new order?')
) AS v(order_id, sender_type, content)
JOIN conversations c ON c.order_id = v.order_id
WHERE NOT EXISTS (
  SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.sender_type = v.sender_type AND m.content = v.content
);
