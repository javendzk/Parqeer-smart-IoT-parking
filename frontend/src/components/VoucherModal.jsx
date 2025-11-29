import { useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';

const VoucherModal = ({ details, onClose }) => {
  const navigate = useNavigate();
  if (!details) return null;
  const paymentUrl = `${window.location.origin.replace(/\/$/, '')}/payment/${details.paymentToken || details.transactionId}`;
  const handleCopyPaymentLink = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(paymentUrl);
    }
  };
  const handlePayment = () => {
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
        <p className="mt-2 text-sm text-slate-500">Selesaikan pembayaran untuk menerima voucher unik. Voucher akan tampil otomatis setelah transaksi berhasil.</p>
        <div className="mt-6 flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 text-center">
          <p className="text-xs uppercase tracking-widest text-slate-500">Scan untuk Bayar</p>
          <div className="rounded-2xl bg-white p-3 shadow-inner">
            <QRCode value={paymentUrl} size={140} fgColor="#0f172a" />
          </div>
          <p className="text-sm text-slate-500">Link: <button type="button" className="text-brand-secondary underline" onClick={handleCopyPaymentLink}>Salin</button></p>
        </div>
        <div className="mt-6 space-y-3">
          <button type="button" className="btn-primary w-full" onClick={handlePayment}>Bayar Sekarang</button>
          <p className="text-center text-xs text-slate-400">Voucher baru akan tersedia setelah pembayaran sukses.</p>
        </div>
      </div>
    </div>
  );
};

export default VoucherModal;
