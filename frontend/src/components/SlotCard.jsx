const statusStyles = {
  available: {
    badge: 'bg-emerald-100 text-emerald-700',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500'
  },
  reserved: {
    badge: 'bg-amber-100 text-amber-700',
    border: 'border-amber-200',
    dot: 'bg-amber-500'
  },
  occupied: {
    badge: 'bg-rose-100 text-rose-700',
    border: 'border-rose-200',
    dot: 'bg-rose-500'
  }
};

const SlotCard = ({ slot, onSelect, selected }) => {
  const style = statusStyles[slot.status] || statusStyles.available;
  return (
    <button
      type="button"
      onClick={() => onSelect?.(slot)}
      disabled={slot.status === 'occupied'}
      className={`bg-glass border ${style.border} rounded-2xl p-4 text-left shadow-sm transition transform hover:-translate-y-0.5 focus-visible:ring focus-visible:ring-brand-primary focus:outline-none ${
        selected ? 'ring-2 ring-brand-primary' : ''
      } ${slot.status === 'occupied' ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">Slot #{slot.slotNumber}</span>
        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${style.badge}`}>{slot.status}</span>
      </div>
      <div className="mt-4 text-3xl font-bold text-slate-900">{slot.status === 'available' ? 'Ready' : slot.status}</div>
      <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
        <span className={`h-2 w-2 rounded-full ${style.dot}`} />
        {slot.status === 'available' ? 'Tap to reserve this slot' : 'Currently locked'}
      </div>
    </button>
  );
};

export default SlotCard;
