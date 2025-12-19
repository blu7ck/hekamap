import React from 'react';

const partners = [
  { id: 1, name: "Büyükşehir Belediyesi", initials: "İBB" },
  { id: 2, name: "Yol Yapı A.Ş.", initials: "YOL" },
  { id: 3, name: "EnerjiSA", initials: "ESA" },
  { id: 4, name: "Orman Genel Müd.", initials: "OGM" },
  { id: 5, name: "Maden Holding", initials: "MDN" },
  { id: 6, name: "Tekno İnşaat", initials: "TKN" },
  { id: 7, name: "Kuzey Yapı", initials: "KZY" },
  { id: 8, name: "Global Jeoloji", initials: "GLB" }
];

export const References: React.FC = () => {
  return (
    <section className="relative w-screen min-h-screen md:h-screen snap-start shrink-0 bg-stone-900 flex items-center justify-center overflow-hidden py-12 md:py-0">
       
       {/* Background Image with Engineering Feel */}
       <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1581094794329-c8112a89af12?q=80&w=2532&auto=format&fit=crop"
            alt="Survey point cloud"
            className="w-full h-full object-cover opacity-10"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-transparent h-48 md:h-64"></div>
          <div className="absolute inset-0 bg-stone-900/60 backdrop-blur-[1px]"></div>
          <div className="absolute bottom-0 left-0 w-full h-48 md:h-64 bg-gradient-to-t from-stone-100 to-transparent"></div>
       </div>

       <div className="container mx-auto px-6 relative z-20 text-center">
          <div className="mb-8 md:mb-16">
            <h2 className="text-emerald-500 font-bold tracking-[0.4em] uppercase text-[9px] md:text-xs mb-2">Güçlü İş Birlikleri</h2>
            <h3 className="text-3xl md:text-7xl font-oswald font-bold text-white tracking-tight">
              Referanslarımız
            </h3>
          </div>

          {/* Optimized grid for mobile - smaller cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-10 max-w-5xl mx-auto">
            {partners.map((p) => (
              <div key={p.id} className="group relative flex flex-col items-center justify-center gap-2 md:gap-4 perspective-1000">
                <div className="w-20 h-20 md:w-36 md:h-36 rounded-2xl md:rounded-3xl border border-white/5 bg-white/5 backdrop-blur-sm flex items-center justify-center transition-all duration-1000 ease-[cubic-bezier(0.19,1,0.22,1)] group-hover:bg-white/10 group-hover:border-emerald-500/40 group-hover:shadow-[0_0_40px_rgba(16,185,129,0.15)] group-hover:scale-105 cursor-default relative overflow-hidden">
                   <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 bg-gradient-to-br from-white/10 to-transparent pointer-events-none"></div>
                   
                   <span className="text-xl md:text-4xl font-black text-stone-600 group-hover:text-emerald-400 transition-all duration-700 tracking-tighter">
                     {p.initials}
                   </span>
                </div>
                <span className="text-stone-400 text-[8px] md:text-xs font-medium opacity-30 group-hover:opacity-100 transition-all duration-700 uppercase tracking-[0.2em] max-w-[100px] md:max-w-none truncate md:whitespace-normal">
                  {p.name}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-12 md:mt-20">
            <p className="text-emerald-500 text-base md:text-2xl max-w-3xl mx-auto font-oswald font-light leading-relaxed tracking-wide px-4">
              Kamu kurumlarından özel sektöre, Türkiye'nin önde gelen kuruluşlarına harita ve mühendislik çözümleri sunuyoruz.
            </p>
          </div>
       </div>
    </section>
  );
};