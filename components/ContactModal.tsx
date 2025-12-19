import React, { useState } from 'react';
import { X } from 'lucide-react';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ContactModal: React.FC<ContactModalProps> = ({ isOpen, onClose }) => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch('/api/contact-support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gönderim başarısız');
      }

      setMessage('Mesajınız gönderildi. En kısa sürede size dönüş yapacağız.');
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        subject: '',
        message: '',
      });
      setTimeout(() => {
        onClose();
        setMessage(null);
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      ></div>

      {/* Modal Content */}
      <div className="relative bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl animate-[slideIn_0.3s_ease-out]">
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-stone-400 hover:text-stone-900 transition-colors"
        >
          <X size={24} />
        </button>

        <h3 className="text-3xl font-oswald font-bold text-stone-900 mb-2">İletişime Geçin</h3>
        <p className="text-stone-500 mb-6">Detayları bırakın, mühendislerimiz projenizi inceleyip size dönüş yapsın.</p>

        {message && (
          <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm">{message}</div>
        )}
        {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Adınız"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 transition-colors"
            />
            <input
              type="text"
              placeholder="Soyadınız"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
          <input
            type="email"
            placeholder="E-Posta Adresi"
            required
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 transition-colors"
          />
          <input
            type="tel"
            placeholder="Telefon No"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 transition-colors"
          />
          <select
            value={formData.subject}
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 transition-colors text-stone-600"
          >
            <option value="">Konu Seçiniz</option>
            <option>Lidar Hizmeti</option>
            <option>Drone Fotogrametri</option>
            <option>Genel Danışmanlık</option>
          </select>
          <textarea
            rows={3}
            placeholder="Proje Detayları"
            required
            value={formData.message}
            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 transition-colors"
          ></textarea>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-stone-900 text-white font-bold py-4 rounded-xl hover:bg-emerald-600 transition-colors shadow-lg disabled:opacity-50"
          >
            {loading ? 'GÖNDERİLİYOR...' : 'GÖNDER'}
          </button>
        </form>
      </div>
    </div>
  );
};