import { useCallback, useEffect, useState } from 'react';
import SlotCard from '../components/SlotCard.jsx';
import { getSlots } from '../api/apiClient.js';
import { useSocket } from '../contexts/SocketContext.jsx';

const Home = () => {
  const [slots, setSlots] = useState([]);
  const [availableCount, setAvailableCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const socket = useSocket();

  const loadSlots = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSlots();
      setSlots(data.slots);
      setAvailableCount(data.availableCount);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  useEffect(() => {
    if (!socket) return undefined;
    const handleSlotUpdate = ({ slotNumber, status }) => {
      setSlots((prev) => {
        const mapped = prev.map((slot) =>
          slot.slotNumber === slotNumber ? { ...slot, status } : slot
        );
        const exists = mapped.some((slot) => slot.slotNumber === slotNumber);
        if (!exists) {
          mapped.push({ slotNumber, status, id: slotNumber });
        }
        setAvailableCount(mapped.filter((slot) => slot.status === 'available').length);
        return mapped;
      });
    };
    const refresh = () => loadSlots();
    socket.on('slotUpdate', handleSlotUpdate);
    socket.on('voucherCreated', refresh);
    socket.on('paymentSuccess', refresh);
    return () => {
      socket.off('slotUpdate', handleSlotUpdate);
      socket.off('voucherCreated', refresh);
      socket.off('paymentSuccess', refresh);
    };
  }, [socket, loadSlots]);

  return (
    <section className="space-y-8">
      <div className="bg-glass rounded-3xl p-8 shadow-lg">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-secondary">Smart Valet Parking</p>
        <h1 className="mt-3 text-4xl font-bold text-slate-900">Monitor slots and guide valet guests in real-time</h1>
        <p className="mt-4 max-w-2xl text-slate-500">
          Connected to ESP32 hardware, a HiveMQ Cloud MQTT bridge, and our payment simulator for a seamless valet experience.
        </p>
        <div className="mt-6 flex flex-wrap gap-6">
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 text-center">
            <p className="text-sm text-slate-500">Available Slots</p>
            <p className="text-4xl font-bold text-emerald-600">{availableCount}</p>
          </div>
          <button type="button" className="btn-primary" onClick={loadSlots} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh Now'}
          </button>
        </div>
      </div>
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-slate-900">Live Slot Map</h2>
          <span className="text-sm text-slate-500">Updated instantly when sensors fire</span>
        </div>
        {loading ? (
          <p className="text-center text-slate-500">Loading slots...</p>
        ) : (
          <div className="grid-auto-fill">
            {slots.map((slot) => (
              <SlotCard key={slot.id || slot.slotNumber} slot={slot} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default Home;
