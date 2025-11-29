import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { getTransaction, payTransaction } from '../api/apiClient.js';

const PaymentSimulator = () => {
  const { transactionId } = useParams();
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const loadTransaction = async () => {
    setLoading(true);
    try {
      const data = await getTransaction(transactionId);
      setTransaction(data.transaction);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransaction();
  }, [transactionId]);

  const handlePay = async () => {
    setPaying(true);
    setStatusMessage('');
    try {
      await payTransaction(transactionId);
      setStatusMessage('Payment successful. Voucher confirmed.');
      loadTransaction();
    } catch (error) {
      setStatusMessage(error.response?.data?.message || 'Payment failed');
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return <p className="text-center text-slate-500">Loading transaction...</p>;
  }

  if (!transaction) {
    return <p className="text-center text-rose-500">Transaction not found</p>;
  }

  return (
    <section className="mx-auto max-w-3xl rounded-3xl bg-white p-10 shadow-lg">
      <p className="text-sm font-semibold uppercase tracking-widest text-brand-secondary">Payment Simulator</p>
      <h2 className="mt-2 text-3xl font-bold text-slate-900">Transaction #{transactionId}</h2>
      <p className="mt-2 text-slate-500">Simulate gateway callback by triggering a fake payment event.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Voucher</p>
          <p className="text-2xl font-bold tracking-[0.3em] text-slate-900">{transaction.voucherCode}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Slot</p>
          <p className="text-2xl font-bold text-slate-900">#{transaction.slotNumber}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Status</p>
          <p className="text-xl font-semibold text-slate-900">{transaction.status}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Last update</p>
          <p className="text-xl font-semibold text-slate-900">{dayjs(transaction.updatedAt).format('DD MMM HH:mm')}</p>
        </div>
      </div>
      {statusMessage && <p className="mt-4 text-center text-brand-secondary">{statusMessage}</p>}
      <button type="button" className="btn-primary mt-8 w-full py-4 text-xl" onClick={handlePay} disabled={paying || transaction.status === 'paid'}>
        {transaction.status === 'paid' ? 'Already paid' : paying ? 'Processing...' : 'Bayar Sekarang'}
      </button>
    </section>
  );
};

export default PaymentSimulator;
