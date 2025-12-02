CREATE TABLE IF NOT EXISTS gate_sessions (
  id SERIAL PRIMARY KEY,
  voucherId INT REFERENCES vouchers(id) ON DELETE SET NULL,
  slotId INT REFERENCES slots(id) ON DELETE SET NULL,
  slotNumber INT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'entering',
  buzzerActive BOOLEAN NOT NULL DEFAULT FALSE,
  createdAt TIMESTAMP DEFAULT now(),
  updatedAt TIMESTAMP DEFAULT now(),
  completedAt TIMESTAMP
);

CREATE INDEX IF NOT EXISTS gate_sessions_status_idx ON gate_sessions(status);
