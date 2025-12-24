import React from 'react';

export const Hero: React.FC = () => {
  return (
    <section className="relative w-screen h-screen snap-start shrink-0 flex items-center justify-center overflow-hidden bg-black">
      
      {/* Background Media */}
      <div className="absolute inset-0 z-0">
        <video 
          autoPlay 
          loop 
          muted 
          playsInline
          className="w-full h-full object-cover scale-105 opacity-60"
        >
          <source src="/assets/header.webm" type="video/webm" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80"></div>
      </div>

      <div className="relative z-10 text-center px-6 w-full max-w-5xl mx-auto flex flex-col items-center h-full justify-center py-20">
        <div className="flex flex-col items-center">
           <h1 className="text-7xl md:text-[11rem] font-oswald font-bold text-white tracking-tighter leading-none select-none">
            HEKA<span className="text-emerald-500">MAP</span>
          </h1>
          <div className="h-[2px] w-12 md:w-32 bg-emerald-500 mt-2 animate-[scaleWidth_1.2s_ease-out]"></div>
        </div>
        
        <h2 className="text-white font-oswald font-light tracking-[0.4em] uppercase text-sm md:text-2xl mt-8 opacity-90">
          Harita Mühendisliği & İleri Teknoloji
        </h2>
        
        <p className="mt-12 text-stone-400 text-[10px] md:text-xs max-w-xs font-light tracking-[0.3em] uppercase opacity-40 border-l border-white/20 pl-4">
          Görünmeyeni görüyor, ölçülemeyeni ölçüyoruz.
        </p>
      </div>

      {/* Scroll Indicator - Bottom anchored with fixed margin */}
      <div className="absolute bottom-8 left-0 w-full flex flex-col items-center gap-4 z-20 pointer-events-none">
         <div className="w-[1px] h-12 bg-gradient-to-b from-emerald-500 to-transparent"></div>
         <span className="text-[9px] text-emerald-500 uppercase tracking-[0.5em] font-bold animate-pulse">Kaydırın</span>
      </div>
    </section>
  );
};