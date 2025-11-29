CREATE TABLE IF NOT EXISTS slots (
  id SERIAL PRIMARY KEY,
  slotNumber INT UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'available',
  createdAt TIMESTAMP DEFAULT now(),
  updatedAt TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vouchers (
  id SERIAL PRIMARY KEY,
  code CHAR(6) UNIQUE NOT NULL,
  slotId INT REFERENCES slots(id),
  status VARCHAR(20) NOT NULL DEFAULT 'unused',
  createdAt TIMESTAMP DEFAULT now(),
  expiresAt TIMESTAMP,
  usedAt TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  voucherId INT REFERENCES vouchers(id),
  amount NUMERIC DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  paymentProvider VARCHAR(50),
  createdAt TIMESTAMP DEFAULT now(),
  updatedAt TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device_logs (
  id SERIAL PRIMARY KEY,
  deviceId VARCHAR(100),
  type VARCHAR(50),
  payload JSONB,
  createdAt TIMESTAMP DEFAULT now()
);
