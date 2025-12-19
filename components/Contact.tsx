import React from 'react';
import { Send, Mail, Phone, ArrowRight } from 'lucide-react';

interface ContactProps {
  onOpenModal: () => void;
}

export const Contact: React.FC<ContactProps> = ({ onOpenModal }) => {
  return (
    <section className="relative w-screen h-screen snap-start shrink-0 bg-stone-100 flex flex-col md:flex-row overflow-hidden">
      
      {/* Left Side: Text & Graphics */}
      <div className="w-full md:w-1/2 h-full bg-stone-900 text-white p-8 md:p-20 flex flex-col justify-center relative overflow-hidden">
         <div className="absolute inset-0 opacity-10 bg-gradient-to-br from-emerald-500/10 via-sky-500/10 to-amber-400/10 blur-3xl" />
         
         <div className="relative z-10">
            <h2 className="text-emerald-500 font-bold tracking-widest uppercase text-[10px] mb-6">İletişime Geçin</h2>
            <h3 className="text-5xl md:text-8xl font-oswald font-bold leading-[0.9] mb-8">
              PROJENİZİ <br/> <span className="text-stone-600">BİRLİKTE</span> <br/> ÇİZELİM
            </h3>
            
            <p className="text-stone-400 text-base md:text-lg max-w-md font-light leading-relaxed mb-12">
              Sınırları zorlayan projeleriniz için ileri teknoloji haritalama ve mühendislik desteği sağlıyoruz.
            </p>

            <div className="space-y-6">
               <div className="flex items-center gap-6 group cursor-pointer">
                  <div className="p-4 rounded-2xl bg-white/5 text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-all duration-500">
                    <Mail size={22} />
                  </div>
                  <div>
                    <p className="text-[9px] text-stone-500 uppercase font-bold tracking-widest">E-Posta</p>
                    <p className="text-lg font-medium group-hover:text-emerald-400 transition-colors">info@hekamap.com</p>
                  </div>
               </div>
               <div className="flex items-center gap-6 group cursor-pointer">
                  <div className="p-4 rounded-2xl bg-white/5 text-sky-500 group-hover:bg-sky-500 group-hover:text-white transition-all duration-500">
                    <Phone size={22} />
                  </div>
                  <div>
                    <p className="text-[9px] text-stone-500 uppercase font-bold tracking-widest">Telefon</p>
                    <p className="text-lg font-medium group-hover:text-sky-400 transition-colors">+90 (212) 555 00 11</p>
                  </div>
               </div>
            </div>
         </div>
      </div>

      {/* Right Side: Action Area */}
      <div className="w-full md:w-1/2 h-full bg-stone-100 p-8 md:p-20 flex flex-col justify-center items-center relative">
         <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] pointer-events-none">
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="black" strokeWidth="1"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
         </div>

         <div className="relative z-10 w-full max-w-md text-center">
            <h4 className="text-3xl md:text-5xl font-oswald font-bold text-stone-900 mb-6 uppercase tracking-tighter">İLK ADIMI ATIN</h4>
            <p className="text-stone-500 mb-12 font-light text-sm md:text-lg px-4 leading-relaxed">
              Profesyonel mühendislik kadromuz projenizi analiz etmek için sabırsızlanıyor.
            </p>

            <button 
              onClick={onOpenModal}
              className="w-full group relative overflow-hidden bg-stone-900 text-white py-6 rounded-2xl font-bold text-sm tracking-[0.3em] transition-all hover:bg-emerald-600 shadow-3xl active:scale-[0.98]"
            >
              <span className="relative z-10 flex items-center justify-center gap-4 uppercase">
                 Hemen Başlayalım <ArrowRight size={18} className="group-hover:translate-x-2 transition-transform duration-500" />
              </span>
              <div className="absolute inset-0 bg-white/10 -translate-x-full group-hover:translate-x-0 transition-transform duration-700"></div>
            </button>

            <div className="mt-12 flex items-center justify-center gap-4 opacity-40">
               <p className="text-[10px] uppercase tracking-[0.3em] font-medium">Hizmet Bölgesi: Tüm Türkiye</p>
            </div>
         </div>
         
         {/* Simple Footer */}
         <div className="absolute bottom-10 left-0 w-full flex justify-between px-10 text-[9px] text-stone-400 uppercase tracking-widest font-bold">
            <span>HEKAMAP © 2025</span>
            <span className="hidden md:block">Harita & Teknoloji Çözümleri</span>
         </div>
      </div>
    </section>
  );
};