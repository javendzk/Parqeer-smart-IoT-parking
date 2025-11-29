import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';

const VoucherModal = ({ details, onClose }) => {
  const navigate = useNavigate();
  if (!details) return null;
  const appUrl = (import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, '');
  const paymentUrl = `${window.location.origin.replace(/\/$/, '')}/payment/${details.paymentToken || details.transactionId}`;
  const handleCopyPaymentLink = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(paymentUrl);
    }
  };
  const handleCopy = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(details.voucherCode);
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
          <h3 className="text-lg font-semibold text-slate-900">Voucher Generated</h3>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-800">×</button>
        </div>
        <p className="mt-2 text-sm text-slate-500">Share this code with valet staff or input on the IoT keypad.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
            <p className="text-xs uppercase tracking-widest text-slate-500">Voucher Code</p>
            <p className="mt-2 text-4xl font-bold tracking-[0.3em] text-slate-900">{details.voucherCode}</p>
            <p className="mt-4 text-sm text-slate-500">Expires {dayjs(details.expiresAt).format('DD MMM YYYY HH:mm')}</p>
          </div>
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-4 text-center">
            <p className="text-xs uppercase tracking-widest text-slate-500">Scan to Pay</p>
            <div className="mt-2 rounded-2xl bg-white p-2 shadow-inner">
              <QRCode value={paymentUrl} size={130} fgColor="#0f172a" />
            </div>
            <p className="mt-2 text-[13px] text-slate-500">Opens secure payment page</p>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button type="button" className="btn-secondary flex-1" onClick={handleCopy}>Copy Code</button>
          <button type="button" className="btn-secondary flex-1" onClick={handleCopyPaymentLink}>Copy Payment Link</button>
          <button type="button" className="btn-primary flex-1" onClick={handlePayment}>Bayar Sekarang</button>
        </div>
        <p className="mt-3 text-center text-xs text-slate-400">Atau scan QR dengan smartphone untuk membuka laman pembayaran.</p>
      </div>
    </div>
  );
};

export default VoucherModal;
