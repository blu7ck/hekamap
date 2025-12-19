import React from 'react';
import { ChevronUp, CheckCircle } from 'lucide-react';
import { servicesData } from './Services';

interface ServiceDetailProps {
  id: number;
  onClose: () => void;
}

export const ServiceDetail: React.FC<ServiceDetailProps> = ({ id, onClose }) => {
  const data = servicesData.find(s => s.id === id);

  if (!data) return null;

  return (
    <section id="service-detail" className="relative w-screen h-screen snap-start shrink-0 flex flex-col md:flex-row bg-stone-900 text-white overflow-hidden">
      
      {/* Close Button - Sticky/Fixed positioning relative to section for better mobile access */}
      {/* Increased top margin for mobile safe area */}
      <button 
          onClick={onClose}
          className="absolute top-8 right-6 md:top-6 md:right-6 flex items-center gap-2 px-3 py-2 md:px-4 rounded-full bg-black/50 backdrop-blur-md md:hover:bg-white/10 transition-colors z-50 group border border-white/10"
      >
          <span className="text-[10px] md:text-xs uppercase tracking-widest text-stone-300 group-hover:text-white transition-colors">Yukarı</span>
          <div className="bg-stone-800 p-1.5 md:p-2 rounded-full group-hover:bg-emerald-600 transition-colors">
              <ChevronUp size={16} className="text-white md:w-5 md:h-5" />
          </div>
      </button>

      {/* Left: Media Area */}
      <div className="w-full md:w-1/2 h-[40vh] md:h-full relative overflow-hidden bg-black">
         {/* Simulate Video Background */}
         <div className="absolute inset-0 z-0">
             <img src={data.image} alt={data.title} className="w-full h-full object-cover opacity-50" />
             <div className="absolute inset-0 bg-gradient-to-t from-stone-900 via-transparent to-transparent"></div>
         </div>
         <div className="absolute bottom-4 left-4 md:bottom-8 md:left-8 z-10">
             <h2 className="text-5xl md:text-8xl font-oswald font-bold text-white opacity-20 select-none">{data.title}</h2>
         </div>
      </div>

      {/* Right: Content Area */}
      <div className="w-full md:w-1/2 h-[60vh] md:h-full relative flex flex-col p-6 md:p-16 justify-start md:justify-center bg-stone-900 overflow-y-auto md:overflow-hidden">
        
        <div className="animate-[fadeIn_0.5s_ease-out] pb-10 md:pb-0 pt-2 md:pt-0">
            <div className="flex items-center gap-3 mb-4 md:mb-6">
                <data.icon className="text-emerald-500" size={24} />
                <h3 className="text-2xl md:text-4xl font-oswald font-bold">{data.subtitle}</h3>
            </div>
            
            <p className="text-stone-300 text-base md:text-lg leading-relaxed mb-6 md:mb-8 border-l-2 border-emerald-500 pl-4">
                {data.fullDesc}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                {data.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-3 bg-white/5 p-3 md:p-4 rounded-lg">
                        <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />
                        <span className="font-medium text-sm text-stone-200">{feature}</span>
                    </div>
                ))}
            </div>
        </div>
      </div>
    </section>
  );
};