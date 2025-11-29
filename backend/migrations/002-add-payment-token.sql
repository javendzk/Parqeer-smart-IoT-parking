ALTER TABLE transactions ADD COLUMN IF NOT EXISTS paymentToken VARCHAR(64) UNIQUE;

UPDATE transactions
SET paymentToken = SUBSTR(md5(random()::text || id::text || clock_timestamp()::text), 1, 16)
WHERE paymentToken IS NULL;
