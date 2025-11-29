import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { adminLogin, getAdminOverview, resetSlot, triggerServo } from '../api/apiClient.js';
import { useSocket } from '../contexts/SocketContext.jsx';

const Dashboard = () => {
  const [token, setToken] = useState(() => localStorage.getItem('adminToken') || '');
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [slotNumber, setSlotNumber] = useState('');
  const [servoSlot, setServoSlot] = useState('');
  const [servoCommand, setServoCommandState] = useState('open');
  const [feed, setFeed] = useState([]);
  const socket = useSocket();

  const loadOverview = async (activeToken = token) => {
    if (!activeToken) return;
    setLoading(true);
    try {
      const data = await getAdminOverview(activeToken);
      setOverview(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load overview');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadOverview(token);
    }
  }, [token]);

  useEffect(() => {
    if (!socket) return undefined;
    const pushEvent = (event, payload) => {
      const id = typeof window !== 'undefined' && typeof window.crypto?.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : `${event}-${Date.now()}`;
      setFeed((prev) => [{ id, event, payload, time: new Date().toISOString() }, ...prev].slice(0, 10));
    };
    socket.on('slotUpdate', (payload) => pushEvent('slotUpdate', payload));
    socket.on('paymentSuccess', (payload) => pushEvent('paymentSuccess', payload));
    socket.on('servoOpen', (payload) => pushEvent('servoOpen', payload));
    socket.on('servoCommand', (payload) => pushEvent('servoCommand', payload));
    return () => {
      socket.off('slotUpdate');
      socket.off('paymentSuccess');
      socket.off('servoOpen');
      socket.off('servoCommand');
    };
  }, [socket]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const data = await adminLogin(credentials);
      localStorage.setItem('adminToken', data.token);
      setToken(data.token);
      setCredentials({ username: '', password: '' });
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    }
  };

  const handleReset = async () => {
    if (!slotNumber) return;
    try {
      await resetSlot(token, { slotNumber: Number(slotNumber) });
      loadOverview();
      setSlotNumber('');
    } catch (err) {
      setError(err.response?.data?.message || 'Reset failed');
    }
  };

  const handleServo = async () => {
    if (!servoSlot) return;
    try {
      await triggerServo(token, { slotNumber: Number(servoSlot), command: servoCommand });
      setServoSlot('');
    } catch (err) {
      setError(err.response?.data?.message || 'Servo command failed');
    }
  };

  if (!token) {
    return (
      <section className="mx-auto max-w-md rounded-3xl bg-white p-8 shadow-lg">
        <h2 className="text-3xl font-bold text-slate-900">Admin Login</h2>
        <p className="mt-2 text-slate-500">Enter demo credentials from backend .env to access monitoring tools.</p>
        <form className="mt-6 space-y-4" onSubmit={handleLogin}>
          <input
            type="text"
            placeholder="Username"
            value={credentials.username}
            onChange={(event) => setCredentials((prev) => ({ ...prev, username: event.target.value }))}
            className="w-full rounded-xl border border-slate-200 px-4 py-3"
          />
          <input
            type="password"
            placeholder="Password"
            value={credentials.password}
            onChange={(event) => setCredentials((prev) => ({ ...prev, password: event.target.value }))}
            className="w-full rounded-xl border border-slate-200 px-4 py-3"
          />
          {error && <p className="text-sm text-rose-500">{error}</p>}
          <button type="submit" className="btn-primary w-full">Login</button>
        </form>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Control Center</h2>
          <p className="text-slate-500">Live stats, IoT sensor logs, and manual overrides.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => loadOverview()} disabled={loading}>
            {loading ? 'Refreshing' : 'Refresh'}
          </button>
          <button type="button" className="btn-primary" onClick={() => { localStorage.removeItem('adminToken'); setToken(''); }}>
            Logout
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-rose-500">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        {['available', 'reserved', 'occupied'].map((status) => (
          <div key={status} className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-slate-500 capitalize">{status}</p>
            <p className="text-4xl font-bold text-slate-900">{overview?.totals?.[status] ?? 0}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Reset slot</h3>
            <div className="mt-4 flex gap-3">
              <input
                type="number"
                placeholder="Slot number"
                value={slotNumber}
                onChange={(event) => setSlotNumber(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3"
              />
              <button type="button" className="btn-secondary" onClick={handleReset}>Reset</button>
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Manual servo command</h3>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                type="number"
                placeholder="Slot number"
                value={servoSlot}
                onChange={(event) => setServoSlot(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3"
              />
              <select
                value={servoCommand}
                onChange={(event) => setServoCommandState(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3"
              >
                <option value="open">Open</option>
                <option value="close">Close</option>
              </select>
              <button type="button" className="btn-primary" onClick={handleServo}>Send</button>
            </div>
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Live feed</h3>
          <ul className="mt-4 space-y-3">
            {feed.length === 0 && <li className="text-sm text-slate-500">Waiting for events...</li>}
            {feed.map((item) => (
              <li key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-widest text-brand-secondary">{item.event}</p>
                <p className="text-sm text-slate-700">{JSON.stringify(item.payload)}</p>
                <p className="text-xs text-slate-400">{dayjs(item.time).format('HH:mm:ss')}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Recent transactions</h3>
          <ul className="mt-4 space-y-3">
            {overview?.lastTransactions?.length ? (
              overview.lastTransactions.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Voucher {tx.voucherCode}</p>
                    <p className="text-xs text-slate-500">Slot #{tx.slotNumber}</p>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-widest text-brand-secondary">{tx.status}</span>
                </li>
              ))
            ) : (
              <li className="text-sm text-slate-500">No data</li>
            )}
          </ul>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Device logs</h3>
          <ul className="mt-4 space-y-3">
            {overview?.lastDeviceLogs?.length ? (
              overview.lastDeviceLogs.map((log) => (
                <li key={log.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">{log.deviceId}</p>
                  <p className="text-xs text-slate-500">{log.type}</p>
                  <p className="text-xs text-slate-400">{dayjs(log.createdAt).format('DD MMM HH:mm:ss')}</p>
                </li>
              ))
            ) : (
              <li className="text-sm text-slate-500">No logs</li>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
};

export default Dashboard;
