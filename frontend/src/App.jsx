import { Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header.jsx';
import Home from './pages/Home.jsx';
import Booking from './pages/Booking.jsx';
import PaymentSimulator from './pages/PaymentSimulator.jsx';
import Dashboard from './pages/Dashboard.jsx';

const App = () => {
  return (
    <div className="min-h-screen pb-16">
      <Header />
      <main className="mx-auto mt-8 max-w-6xl px-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/booking" element={<Booking />} />
          <Route path="/payment/:transactionId" element={<PaymentSimulator />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
