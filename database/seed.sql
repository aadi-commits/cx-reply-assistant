INSERT INTO brands (name)
VALUES ('Acme Drinks'), ('FreshBottle')
ON CONFLICT (name) DO NOTHING;

INSERT INTO customers (name, email)
SELECT 'John Doe', 'john@example.com'
WHERE NOT EXISTS (
    SELECT 1 FROM customers WHERE email = 'john@example.com'
);

INSERT INTO customers (name, email)
SELECT 'Jane Smith', 'jane@example.com'
WHERE NOT EXISTS (
    SELECT 1 FROM customers WHERE email = 'jane@example.com'
);

INSERT INTO kb_entries (brand_id, category, title, content)
SELECT b.id, 'REFUND', 'Damaged Product Refund',
       'Damaged products can be refunded within 7 days of delivery.'
FROM brands b
WHERE b.name = 'Acme Drinks'
AND NOT EXISTS (
    SELECT 1 FROM kb_entries k
    WHERE k.brand_id = b.id AND k.title = 'Damaged Product Refund'
);

INSERT INTO kb_entries (brand_id, category, title, content)
SELECT b.id, 'RETURN', 'Return Policy',
       'Unused products can be returned within 14 days of delivery.'
FROM brands b
WHERE b.name = 'Acme Drinks'
AND NOT EXISTS (
    SELECT 1 FROM kb_entries k
    WHERE k.brand_id = b.id AND k.title = 'Return Policy'
);

INSERT INTO kb_entries (brand_id, category, title, content)
SELECT b.id, 'SHIPPING', 'Shipping Policy',
       'Standard shipping usually takes 3 to 5 business days.'
FROM brands b
WHERE b.name = 'Acme Drinks'
AND NOT EXISTS (
    SELECT 1 FROM kb_entries k
    WHERE k.brand_id = b.id AND k.title = 'Shipping Policy'
);

INSERT INTO kb_entries (brand_id, category, title, content)
SELECT b.id, 'CANCELLATION', 'Cancellation Policy',
       'Orders can be cancelled before they are dispatched.'
FROM brands b
WHERE b.name = 'Acme Drinks'
AND NOT EXISTS (
    SELECT 1 FROM kb_entries k
    WHERE k.brand_id = b.id AND k.title = 'Cancellation Policy'
);

INSERT INTO kb_entries (brand_id, category, title, content)
SELECT b.id, 'REFUND', 'Damaged Product Refund',
       'Damaged products can be refunded within 30 days of delivery.'
FROM brands b
WHERE b.name = 'FreshBottle'
AND NOT EXISTS (
    SELECT 1 FROM kb_entries k
    WHERE k.brand_id = b.id AND k.title = 'Damaged Product Refund'
);

INSERT INTO kb_entries (brand_id, category, title, content)
SELECT b.id, 'RETURN', 'Return Policy',
       'Unused products can be returned within 30 days of delivery.'
FROM brands b
WHERE b.name = 'FreshBottle'
AND NOT EXISTS (
    SELECT 1 FROM kb_entries k
    WHERE k.brand_id = b.id AND k.title = 'Return Policy'
);

INSERT INTO kb_entries (brand_id, category, title, content)
SELECT b.id, 'SHIPPING', 'Shipping Policy',
       'Standard shipping usually takes 2 to 4 business days.'
FROM brands b
WHERE b.name = 'FreshBottle'
AND NOT EXISTS (
    SELECT 1 FROM kb_entries k
    WHERE k.brand_id = b.id AND k.title = 'Shipping Policy'
);

INSERT INTO kb_entries (brand_id, category, title, content)
SELECT b.id, 'CANCELLATION', 'Cancellation Policy',
       'Orders can be cancelled until 2 hours after placement.'
FROM brands b
WHERE b.name = 'FreshBottle'
AND NOT EXISTS (
    SELECT 1 FROM kb_entries k
    WHERE k.brand_id = b.id AND k.title = 'Cancellation Policy'
);

INSERT INTO conversations (brand_id, customer_id, order_id)
SELECT b.id, c.id, 'ORD-ACME-1001'
FROM brands b
JOIN customers c ON c.email = 'john@example.com'
WHERE b.name = 'Acme Drinks'
AND NOT EXISTS (
    SELECT 1 FROM conversations WHERE order_id = 'ORD-ACME-1001'
);

INSERT INTO conversations (brand_id, customer_id, order_id)
SELECT b.id, c.id, 'ORD-FRESH-2001'
FROM brands b
JOIN customers c ON c.email = 'jane@example.com'
WHERE b.name = 'FreshBottle'
AND NOT EXISTS (
    SELECT 1 FROM conversations WHERE order_id = 'ORD-FRESH-2001'
);

INSERT INTO messages (conversation_id, sender_type, content)
SELECT id, 'CUSTOMER', 'My order was delivered but the bottle is broken. What can I do?'
FROM conversations
WHERE order_id = 'ORD-ACME-1001'
AND NOT EXISTS (
    SELECT 1 FROM messages m
    WHERE m.conversation_id = conversations.id
);

INSERT INTO messages (conversation_id, sender_type, content)
SELECT id, 'CUSTOMER', 'My bottle arrived damaged. What is your refund policy?'
FROM conversations
WHERE order_id = 'ORD-FRESH-2001'
AND NOT EXISTS (
    SELECT 1 FROM messages m
    WHERE m.conversation_id = conversations.id
);
