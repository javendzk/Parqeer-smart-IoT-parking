import { useEffect, useMemo, useState } from 'react';
import SlotCard from '../components/SlotCard.jsx';
import VoucherModal from '../components/VoucherModal.jsx';
import Numpad from '../components/Numpad.jsx';
import { createBooking, getSlots } from '../api/apiClient.js';

const Booking = () => {
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [manualSlot, setManualSlot] = useState('');
  const [voucherDetails, setVoucherDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [activeSlotNumber, setActiveSlotNumber] = useState(null);

  const availableSlots = useMemo(() => slots.filter((slot) => slot.status === 'available'), [slots]);

  const loadSlots = async () => {
    setLoading(true);
    try {
      const data = await getSlots();
      setSlots(data.slots);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSlots();
  }, []);

  const slotNumberToSend = () => {
    if (manualSlot) return Number(manualSlot);
    if (selectedSlot) return selectedSlot.slotNumber;
    return undefined;
  };

  const reserveSlot = async (slotNumber) => {
    setSubmitting(true);
    setError('');
    try {
      const payload = {};
      if (slotNumber) payload.slotNumber = slotNumber;
      const result = await createBooking(payload);
      setVoucherDetails(result);
      setManualSlot('');
      setSelectedSlot(null);
      await loadSlots();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create booking');
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const handleSlotTap = async (slot) => {
    if (slot.status !== 'available' || submitting) return;
    setSelectedSlot(slot);
    setManualSlot('');
    setActiveSlotNumber(slot.slotNumber);
    try {
      await reserveSlot(slot.slotNumber);
      await loadSlots();
    } catch (err) {
      // error already captured in state
    } finally {
      setActiveSlotNumber(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const slotNumber = slotNumberToSend();
    try {
      await reserveSlot(slotNumber);
    } catch (err) {
      // error already captured in state
    }
  };

  const handleReservationExpired = () => {
    setVoucherDetails(null);
    setSelectedSlot(null);
    setManualSlot('');
    setError('Reservasi kadaluarsa. Silakan pilih slot lagi.');
    loadSlots();
  };

  return (
    <section className="space-y-8">
      <div className="bg-glass rounded-3xl p-8 shadow-lg">
        <h2 className="text-3xl font-bold text-slate-900">Reserve a slot</h2>
        <p className="mt-2 text-slate-500">Choose a slot or let the system auto-assign the nearest available bay.</p>
        <form className="mt-6 grid gap-6 lg:grid-cols-2" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <label className="block text-sm font-semibold text-slate-600">Tap a slot</label>
            {loading ? (
              <p className="text-slate-500">Loading slots...</p>
            ) : (
              <div className="grid-auto-fill">
                {slots.map((slot) => {
                  const isActive = activeSlotNumber === slot.slotNumber;
                  return (
                    <SlotCard
                      key={slot.id || slot.slotNumber}
                      slot={slot}
                      onSelect={handleSlotTap}
                      selected={selectedSlot?.slotNumber === slot.slotNumber || isActive}
                      disabled={submitting && !isActive}
                      processing={isActive && submitting}
                    />
                  );
                })}
              </div>
            )}
          </div>
          <div className="space-y-6">
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">Manual slot entry</p>
              <div className="text-4xl font-bold tracking-[0.3em] text-slate-900 min-h-[3rem]">
                {manualSlot || '------'}
              </div>
              <Numpad value={manualSlot} onChange={setManualSlot} length={6} />
            </div>
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <label className="block text-sm font-semibold text-slate-500">Quick pick</label>
              <select
                value={selectedSlot?.slotNumber || ''}
                onChange={(event) => {
                  const slot = availableSlots.find((item) => item.slotNumber === Number(event.target.value));
                  setSelectedSlot(slot || null);
                }}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-700"
              >
                <option value="">Auto assign best slot</option>
                {availableSlots.map((slot) => (
                  <option key={slot.id || slot.slotNumber} value={slot.slotNumber}>
                    Slot {slot.slotNumber}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400">System picks the closest available slot if none selected.</p>
            </div>
            {error && <p className="text-sm text-rose-500">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting ? 'Generating voucher...' : 'Create Booking'}
            </button>
          </div>
        </form>
      </div>
      {voucherDetails && (
        <VoucherModal
          details={voucherDetails}
          onClose={() => setVoucherDetails(null)}
          onExpired={handleReservationExpired}
        />
      )}
    </section>
  );
};

export default Booking;
