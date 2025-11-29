# Parqeer Backend

This service powers the Parqeer smart valet platform. It exposes REST APIs for the dashboard and mobile clients, pushes live events over Socket.IO, and bridges hardware interactions through HiveMQ Cloud MQTT.

## Requirements

- Node.js 18+
- PostgreSQL 14+ (Neon or any managed deployment works)
- HiveMQ Cloud or another MQTT broker that supports TLS connections

## Environment Variables

Copy `.env.example` to `.env` and fill in real values.

| Name | Description |
| ---- | ----------- |
| `PORT` | Port for the Express server (default `4000`). |
| `NODE_ENV` | `development` or `production`. |
| `DATABASE_URL` | PostgreSQL connection string. |
| `MQTT_HOST` | HiveMQ broker host, e.g. `your-instance.s2.eu.hivemq.cloud`. |
| `MQTT_PORT` | Broker port (use `8883` for TLS on HiveMQ Cloud). |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | MQTT credentials generated in HiveMQ. |
| `JWT_SECRET` | Secret for issuing admin tokens. |
| `VOUCHER_TTL_MINUTES` | Minutes before a generated voucher expires. |
| `SOCKET_IO_PATH` | Custom path for Socket.IO if you need to reverse proxy it. |
| `DEVICE_TOKEN` | Token shared with the ESP32 firmware for REST fallbacks. |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Credentials for the built-in admin login. |

## MQTT Topics

The backend publishes/consumes JSON payloads with these topics:

- `parking/voucher/check` (sub): ESP32 requests voucher validation.
- `parking/voucher/validateResponse` (pub): Backend response for voucher validity and gate actions.
- `parking/gate/open` and `parking/gate/close` (pub): Commands for servo motors.
- `parking/gate/state` (sub): Hardware sends servo state feedback.
- `parking/slot/+/status` (sub): Slot sensors broadcast occupancy (`+` is the slot number).
- `parking/system/notify` (pub): Frontend/system level updates (slot summary, voucher created, etc.).

## Run the Server

```bash
npm install
npm run dev
```

Use `npm start` in production (it runs `node src/server.js`).

## Database

Run the SQL in `migrations/create-tables.sql` once to bootstrap the schema. The service automatically writes sensor logs to the `device_logs` table and keeps `slots` in sync with MQTT traffic.

## Deployment Notes

- On Vercel, configure the environment variables above and proxy WebSocket traffic to the same server.
- Make sure outbound port `8883` is allowed so the server can sustain the TLS MQTT connection.
- When rotating MQTT credentials, restart the server to establish a fresh session.
