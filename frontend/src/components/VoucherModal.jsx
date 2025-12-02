import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';

const VoucherModal = ({ details, onClose, onExpired }) => {
  const navigate = useNavigate();
  if (!details) return null;
  const [remaining, setRemaining] = useState(null);
  const [notifiedExpiry, setNotifiedExpiry] = useState(false);
  const fallbackExpiryMs = useMemo(() => {
    if (!details) return null;
    if (details.expiresAt) {
      return new Date(details.expiresAt).getTime();
    }
    if (details.expires_at) {
      return new Date(details.expires_at).getTime();
    }
    if (details.createdAt) {
      return new Date(details.createdAt).getTime() + 5 * 60 * 1000;
    }
    if (details.created_at) {
      return new Date(details.created_at).getTime() + 5 * 60 * 1000;
    }
    return Date.now() + 5 * 60 * 1000;
  }, [details]);
  useEffect(() => {
    setNotifiedExpiry(false);
    if (!fallbackExpiryMs) {
      setRemaining(null);
      return undefined;
    }
    const target = fallbackExpiryMs;
    const update = () => {
      setRemaining(Math.max(0, target - Date.now()));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [fallbackExpiryMs]);

  useEffect(() => {
    if (fallbackExpiryMs && remaining === 0 && remaining !== null && !notifiedExpiry) {
      setNotifiedExpiry(true);
      onExpired?.();
    }
  }, [remaining, fallbackExpiryMs, notifiedExpiry, onExpired]);

  const countdownText = useMemo(() => {
    if (remaining === null) return '--:--';
    const totalSeconds = Math.max(0, Math.floor(remaining / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [remaining]);

  const expired = fallbackExpiryMs ? remaining === 0 && remaining !== null : false;
  const paymentUrl = `${window.location.origin.replace(/\/$/, '')}/payment/${details.paymentToken || details.transactionId}`;
  const handleCopyPaymentLink = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(paymentUrl);
    }
  };
  const handlePayment = () => {
    if (expired) return;
    const tokenOrId = details.paymentToken || details.transactionId;
    if (!tokenOrId) return;
    navigate(`/payment/${tokenOrId}`);
    onClose?.();
  };
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Pembayaran Diperlukan</h3>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-800">×</button>
        </div>
        <p className="mt-2 text-sm text-slate-500">Selesaikan pembayaran dalam 5 menit untuk menerima voucher unik. Voucher akan tampil otomatis setelah transaksi berhasil.</p>
        <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
          <span>Waktu tersisa</span>
          <span className={expired ? 'text-rose-600' : 'text-emerald-600'}>{countdownText}</span>
        </div>
        <div className="mt-6 flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 text-center">
          <p className="text-xs uppercase tracking-widest text-slate-500">Scan untuk Bayar</p>
          <div className="rounded-2xl bg-white p-3 shadow-inner">
            <QRCode value={paymentUrl} size={140} fgColor="#0f172a" />
          </div>
          <p className="text-sm text-slate-500">Link: <button type="button" className="text-brand-secondary underline" onClick={handleCopyPaymentLink}>Salin</button></p>
        </div>
        <div className="mt-6 space-y-3">
          <button type="button" className="btn-primary w-full" onClick={handlePayment} disabled={expired}>
            {expired ? 'Reservasi Kadaluarsa' : 'Bayar Sekarang'}
          </button>
          <p className="text-center text-xs text-slate-400">Voucher baru akan tersedia setelah pembayaran sukses.</p>
        </div>
      </div>
    </div>
  );
};

export default VoucherModal;
