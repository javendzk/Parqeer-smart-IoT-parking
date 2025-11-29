const keys = ['1','2','3','4','5','6','7','8','9','clear','0','back'];

const Numpad = ({ value, onChange, length = 3 }) => {
  const handleKey = (key) => {
    if (key === 'clear') {
      onChange('');
      return;
    }
    if (key === 'back') {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= length) return;
    onChange(`${value}${key}`);
  };
  return (
    <div className="grid grid-cols-3 gap-3">
      {keys.map((key) => (
        <button
          type="button"
          key={key}
          onClick={() => handleKey(key)}
          className={`rounded-xl border border-slate-200 bg-white py-3 text-lg font-semibold uppercase text-slate-700 shadow-sm hover:border-brand-primary hover:text-brand-primary ${
            key === 'clear' || key === 'back' ? 'text-sm' : ''
          }`}
        >
          {key === 'back' ? '←' : key}
        </button>
      ))}
    </div>
  );
};

export default Numpad;
