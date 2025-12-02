import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import QRCode from 'react-qr-code';
import { getTransaction, getTransactionByToken, payTransaction } from '../api/apiClient.js';

const PaymentSimulator = () => {
  const { paymentToken } = useParams();
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [countdownText, setCountdownText] = useState('');
  const appUrl = useMemo(() => (import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, ''), []);

  const loadTransaction = async () => {
    setLoading(true);
    try {
      const data = await getTransactionByToken(paymentToken);
      setTransaction(data.transaction);
      return;
    } catch (error) {
      const looksNumeric = /^\d+$/.test(paymentToken);
      if (looksNumeric) {
        try {
          const fallback = await getTransaction(paymentToken);
          setTransaction(fallback.transaction);
          return;
        } catch (fallbackError) {
          setTransaction(null);
          console.error('Failed to load transaction by ID', fallbackError);
        }
      } else {
        setTransaction(null);
        console.error('Failed to load transaction by token', error);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransaction();
  }, [paymentToken]);

  useEffect(() => {
    if (!transaction?.expiresAt || transaction.status !== 'pending') {
      setCountdownText('');
      return undefined;
    }
    const target = new Date(transaction.expiresAt).getTime();
    const update = () => {
      const remaining = Math.max(0, target - Date.now());
      const totalSeconds = Math.floor(remaining / 1000);
      const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
      const seconds = String(totalSeconds % 60).padStart(2, '0');
      setCountdownText(`${minutes}:${seconds}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [transaction?.expiresAt, transaction?.status]);

  const handlePay = async () => {
    setPaying(true);
    setStatusMessage('');
    setModalMessage('');
    try {
      if (!transaction?.id) {
        throw new Error('Transaction not loaded');
      }
      if (
        transaction.status === 'expired' ||
        (transaction.status === 'pending' && transaction.expiresAt && new Date(transaction.expiresAt).getTime() <= Date.now())
      ) {
        throw new Error('Reservation expired');
      }
      await payTransaction(transaction.id);
      setStatusMessage('Payment successful. Voucher confirmed.');
      setPaymentSuccess(true);
      setModalMessage('Pembayaran berhasil! Voucher sudah dikonfirmasi.');
      loadTransaction();
    } catch (error) {
      const message = error.response?.data?.message || error.message || 'Payment failed';
      setStatusMessage(message);
      setModalMessage(message);
    } finally {
      setPaying(false);
    }
  };

  const openPrompt = () => {
    if (transaction?.status === 'paid' || transaction?.status === 'expired') return;
    setPaymentSuccess(false);
    setModalMessage('');
    setShowPrompt(true);
  };

  const closePrompt = () => {
    if (paying) return;
    setShowPrompt(false);
    setPaymentSuccess(false);
    setModalMessage('');
  };

  const paymentUrl = transaction ? transaction.paymentUrl || `${appUrl}/payment/${transaction.paymentToken || paymentToken}` : '';
  const voucherUnlocked = transaction?.status === 'paid';
  const pendingExpired = transaction?.status === 'pending' && countdownText === '00:00';
  const isExpired = transaction?.status === 'expired' || pendingExpired;

  if (loading) {
    return <p className="text-center text-slate-500">Loading transaction...</p>;
  }

  if (!transaction) {
    return <p className="text-center text-rose-500">Transaction not found</p>;
  }

  return (
    <section className="mx-auto max-w-4xl rounded-3xl bg-white p-10 shadow-lg">
      <p className="text-sm font-semibold uppercase tracking-widest text-brand-secondary">Scan &amp; Pay</p>
      <h2 className="mt-2 text-3xl font-bold text-slate-900">Transaction QR</h2>
      <p className="mt-2 text-slate-500">Tunjukkan halaman ini ke tamu atau scan QR langsung dari smartphone untuk menyelesaikan pembayaran.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Voucher</p>
          {voucherUnlocked ? (
            <p className="text-2xl font-bold tracking-[0.3em] text-slate-900">{transaction.voucherCode}</p>
          ) : (
            <p className="text-sm font-medium text-amber-600">Voucher akan muncul setelah pembayaran berhasil.</p>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Slot</p>
          <p className="text-2xl font-bold text-slate-900">#{transaction.slotNumber}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Status</p>
          <p className={`text-xl font-semibold ${isExpired ? 'text-rose-600' : 'text-slate-900'}`}>{transaction.status}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Last update</p>
          <p className="text-xl font-semibold text-slate-900">{dayjs(transaction.updatedAt).format('DD MMM HH:mm')}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Bayar sebelum</p>
          {transaction.expiresAt ? (
            <>
              <p className={`text-xl font-semibold ${isExpired ? 'text-rose-600' : 'text-slate-900'}`}>{dayjs(transaction.expiresAt).format('HH:mm:ss')}</p>
              {transaction.status === 'pending' && countdownText && <p className="text-sm text-slate-500">Countdown: {countdownText}</p>}
            </>
          ) : (
            <p className="text-sm text-slate-500">Tidak tersedia</p>
          )}
        </div>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[240px,1fr]">
        <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
          <p className="text-xs uppercase tracking-widest text-slate-500">Scan QR</p>
          <div className="mt-2 rounded-2xl bg-white p-2 shadow-inner">
            <QRCode value={paymentUrl} size={180} fgColor="#0f172a" />
          </div>
          <p className="mt-2 text-xs text-slate-500">Link: <a className="text-brand-secondary" href={paymentUrl} target="_blank" rel="noreferrer">Buka</a></p>
        </div>
        <div className="rounded-2xl border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900">Instruksi cepat</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-600">
            <li>Scan QR di samping atau buka tautan di atas.</li>
            <li>Tekan tombol <strong>Bayar Sekarang</strong> untuk mensimulasikan gateway.</li>
            <li>Tunggu status berubah menjadi <strong>paid</strong>. Front office akan mendapat notifikasi otomatis.</li>
          </ol>
        </div>
      </div>
      {statusMessage && <p className="mt-4 text-center text-brand-secondary">{statusMessage}</p>}
      <button
        type="button"
        className="btn-primary mt-8 w-full py-4 text-xl"
        onClick={openPrompt}
        disabled={transaction.status === 'paid' || isExpired}
      >
        {transaction.status === 'paid' ? 'Payment complete' : isExpired ? 'Reservation expired' : 'Bayar Sekarang'}
      </button>
      {showPrompt && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            {!paymentSuccess ? (
              <>
                <h3 className="text-xl font-semibold text-slate-900">Konfirmasi Pembayaran</h3>
                <p className="mt-2 text-sm text-slate-500">
                  Pastikan tamu sudah siap melakukan pembayaran. Klik tombol di bawah untuk memproses transaksi #{transaction.id}.
                </p>
                {modalMessage && <p className="mt-3 text-sm text-rose-500">{modalMessage}</p>}
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <button type="button" className="btn-secondary flex-1" onClick={closePrompt} disabled={paying}>Batal</button>
                  <button type="button" className="btn-primary flex-1" onClick={handlePay} disabled={paying}>
                    {paying ? 'Memproses...' : 'Bayar'}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-8 w-8">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="mt-4 text-xl font-semibold text-slate-900">Pembayaran Berhasil</h3>
                <p className="mt-2 text-sm text-slate-500">Voucher dikonfirmasi otomatis &amp; status diperbarui.</p>
                <button type="button" className="btn-primary mt-6 w-full" onClick={closePrompt}>Tutup</button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default PaymentSimulator;
