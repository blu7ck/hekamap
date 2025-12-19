import React, { useState } from 'react';
import { Scan, Plane, Map as MapIcon, ArrowRight, X, ChevronRight, CheckCircle } from 'lucide-react';

export const servicesData = [
  {
    id: 1,
    title: "LIDAR",
    subtitle: "3D Lazer Tarama",
    desc: "Milyonlarca nokta ile dijital ikiz oluşturma.",
    fullDesc: "Velodyne ve Riegl marka LiDAR sensörlerimiz ile saniyede 1 milyon nokta atımı gerçekleştirerek ormanlık alanlardan endüstriyel tesislere kadar her yeri milimetre hassasiyetinde modelliyoruz. Nokta bulutu verileri, analiz edilebilir dijital ikizlere dönüştürülür.",
    features: ["Saniyede 1M Nokta", "Bitki Örtüsü Penetrasyonu", "Endüstriyel Tarama", "Tünel ve Maden Ölçümleri"],
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2070&auto=format&fit=crop",
    video: "https://assets.mixkit.co/videos/preview/mixkit-data-center-server-lights-25744-large.mp4",
    color: "from-emerald-900/90 to-black",
    icon: Scan
  },
  {
    id: 2,
    title: "DRONE",
    subtitle: "Fotogrametri",
    desc: "Geniş arazilerin havadan yüksek çözünürlüklü haritalanması.",
    fullDesc: "RTK/PPK modüllü İnsansız Hava Araçlarımız (İHA) ile geniş tarım arazileri, şantiye sahaları ve şehir planlama alanlarını yüksek çözünürlüklü ortofotolara dönüştürüyoruz. Klasik yöntemlere göre %80 daha hızlı ve güvenli veri toplama.",
    features: ["5cm Piksel Çözünürlüğü", "Günde 500+ Hektar", "Termal Haritalama", "Hacim Hesaplamaları"],
    image: "https://images.unsplash.com/photo-1506947411487-a56738267384?q=80&w=3348&auto=format&fit=crop",
    video: "https://assets.mixkit.co/videos/preview/mixkit-drone-flying-over-a-factory-42866-large.mp4",
    color: "from-sky-900/90 to-black",
    icon: Plane
  },
  {
    id: 3,
    title: "HARİTA",
    subtitle: "Mühendislik",
    desc: "İmar, aplikasyon ve klasik haritacılık çözümleri.",
    fullDesc: "Yasal mevzuata uygun imar uygulamaları, parselasyon, ifraz-tevhid işlemleri ve inşaat projelerinizin aplikasyon süreçlerini yönetiyoruz. Resmi kurumlarla olan tüm süreçlerde uzman kadromuzla yanınızdayız.",
    features: ["İmar Uygulamaları", "Aplikasyon", "Sınır Tespiti", "Hukuki Danışmanlık"],
    image: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?q=80&w=2532&auto=format&fit=crop",
    video: "https://assets.mixkit.co/videos/preview/mixkit-topographic-map-lines-digital-animation-31744-large.mp4",
    color: "from-amber-900/90 to-black",
    icon: MapIcon
  }
];

export const Services: React.FC = () => {
  const [activeServiceId, setActiveServiceId] = useState<number | null>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);

  const activeData = servicesData.find(s => s.id === activeServiceId);

  const handleToggle = (id: number) => {
    if (activeServiceId === id) {
      setActiveServiceId(null);
    } else {
      setActiveServiceId(id);
    }
  };

  // --- VIEW 1: INITIAL CARDS VIEW ---
  if (!activeServiceId) {
    return (
      <section className="relative w-screen h-screen snap-start shrink-0 flex flex-col sm:flex-row bg-black overflow-hidden animate-[fadeIn_0.5s_ease-out]">
        {servicesData.map((item) => (
          <div 
            key={item.id}
            onMouseEnter={() => setHoverId(item.id)}
            onMouseLeave={() => setHoverId(null)}
            className={`relative flex-1 transition-all duration-700 ease-in-out border-b sm:border-b-0 sm:border-r border-stone-800 cursor-pointer overflow-hidden group h-full
              ${hoverId === item.id ? 'sm:flex-[1.5]' : 'sm:flex-1'}
            `}
            onClick={() => handleToggle(item.id)}
          >
            {/* Background Image */}
            <div className="absolute inset-0 z-0">
              <img 
                src={item.image} 
                alt={item.title} 
                className={`w-full h-full object-cover transition-transform duration-1000 ${hoverId === item.id ? 'scale-110' : 'scale-100 grayscale-[50%]'}`}
              />
              <div className={`absolute inset-0 bg-gradient-to-t ${item.color} opacity-80 group-hover:opacity-60 transition-opacity duration-500`}></div>
            </div>

            {/* Content - Optimized padding for small/horizontal screens */}
            <div className="relative z-10 h-full flex flex-col justify-end p-4 sm:p-6 md:p-12">
              <div className="transition-all duration-500 transform translate-y-0">
                <div className="flex items-center gap-2 sm:gap-4 mb-1 sm:mb-4">
                   <div className={`p-2 rounded-full border border-white/20 backdrop-blur-sm text-white`}>
                     <item.icon size={16} className="md:w-6 md:h-6" />
                   </div>
                   <h3 className="text-xl sm:text-3xl md:text-6xl font-oswald font-bold text-white tracking-tighter shadow-black drop-shadow-lg">{item.title}</h3>
                </div>
                
                <h4 className="text-[10px] sm:text-lg md:text-xl font-bold text-stone-200 mb-1 sm:mb-2">{item.subtitle}</h4>
                <button 
                  className="mt-2 sm:mt-4 flex items-center gap-2 text-[8px] sm:text-sm uppercase tracking-widest font-bold text-white border-b border-white/30 pb-1 hover:border-white transition-colors hover:text-emerald-400 hover:border-emerald-400"
                >
                  İncele <ArrowRight size={12} className="sm:w-3.5 sm:h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>
    );
  }

  // --- VIEW 2: DETAIL VIEW (WITH TABS) ---
  return (
    <section className="relative w-screen h-screen snap-start shrink-0 flex flex-col bg-stone-900 overflow-hidden">
      
      {/* Navigation Tabs (Top) - Optimized for vertical space */}
      <div className="flex flex-row h-16 md:h-24 bg-black border-b border-stone-800 shrink-0 z-20">
        {servicesData.map((item) => (
           <button
             key={item.id}
             onClick={() => handleToggle(item.id)}
             className={`flex-1 flex items-center justify-center gap-1 sm:gap-3 p-2 md:p-0 transition-all duration-300
                ${activeServiceId === item.id 
                  ? 'bg-stone-800 text-white border-b-2 md:border-b-4 border-emerald-500' 
                  : 'bg-black text-stone-500 hover:bg-stone-900 hover:text-stone-300'}
             `}
           >
              <item.icon size={14} className={`sm:w-5 sm:h-5 ${activeServiceId === item.id ? 'text-emerald-500' : ''}`} />
              <span className="font-oswald font-bold text-xs sm:text-lg md:text-2xl tracking-wide uppercase sm:normal-case">{item.title}</span>
           </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative flex flex-col md:flex-row overflow-hidden animate-[fadeIn_0.3s_ease-out]">
          
          {/* Close Button (Absolute) */}
          <button 
             onClick={() => setActiveServiceId(null)}
             className="absolute top-4 right-4 z-50 p-2 bg-black/50 hover:bg-red-900/80 rounded-full text-white backdrop-blur transition-colors"
          >
             <X size={18} />
          </button>

          {activeData && (
            <>
               {/* Left: Visual Media */}
               <div className="w-full md:w-1/2 h-[30vh] md:h-full relative bg-black shrink-0">
                  <div className="absolute inset-0 z-0">
                      <img src={activeData.image} alt={activeData.title} className="w-full h-full object-cover opacity-60" />
                      <div className="absolute inset-0 bg-gradient-to-t from-stone-900 to-transparent"></div>
                  </div>
                  <div className="absolute bottom-4 left-4 md:bottom-12 md:left-12 z-10">
                       <h2 className="text-2xl md:text-7xl font-oswald font-bold text-white opacity-90">{activeData.subtitle}</h2>
                  </div>
               </div>

               {/* Right: Text Content */}
               <div className="w-full md:w-1/2 flex-1 overflow-y-auto bg-stone-900 p-6 md:p-16 flex flex-col justify-start md:justify-center">
                  <div className="max-w-xl">
                      <p className="text-lg md:text-2xl text-emerald-400 font-light mb-4 md:mb-6">
                        {activeData.desc}
                      </p>
                      <p className="text-stone-300 text-sm md:text-lg leading-relaxed mb-6 md:mb-12">
                         {activeData.fullDesc}
                      </p>

                      <div className="grid grid-cols-1 gap-3 md:gap-4 pb-8 md:pb-0">
                          {activeData.features.map((feature, idx) => (
                              <div key={idx} className="flex items-center gap-3 bg-white/5 p-3 md:p-4 rounded-xl border border-white/5">
                                  <div className="bg-emerald-500/20 p-1.5 rounded-full">
                                    <CheckCircle size={14} className="text-emerald-500 sm:w-4 sm:h-4" />
                                  </div>
                                  <span className="font-medium text-xs md:text-base text-stone-200">{feature}</span>
                              </div>
                          ))}
                      </div>
                  </div>
               </div>
            </>
          )}
      </div>
    </section>
  );
};