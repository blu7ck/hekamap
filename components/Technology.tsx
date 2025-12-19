import React from 'react';
import { Cpu, Wifi, Battery } from 'lucide-react';

export const Technology: React.FC = () => {
  return (
    <section id="tech" className="py-24 bg-stone-900 text-white relative z-10 overflow-hidden">
      
      {/* Abstract Background Element */}
      <div className="absolute top-0 right-0 w-1/2 h-full bg-emerald-900/20 skew-x-12 translate-x-20"></div>

      <div className="container mx-auto px-6 relative">
        <div className="flex flex-col lg:flex-row gap-16 items-center">
          
          <div className="lg:w-1/2 space-y-8">
            <h2 className="text-emerald-400 font-bold tracking-wider uppercase text-sm">Teknolojimiz</h2>
            <h3 className="text-4xl lg:text-5xl font-bold leading-tight">
              Gökyüzünden Yere <br />
              <span className="text-stone-400">Veri Akışı</span>
            </h3>
            <p className="text-stone-300 text-lg leading-relaxed">
              Envanterimizde bulunan son teknoloji <strong>LiDAR sensörler</strong> ve <strong>RTK modüllü Dronelar</strong> sayesinde, zorlu arazi koşullarında bile saatler içerisinde hektarlarca alanı tarayabiliyoruz. Geleneksel yöntemlere göre %400 daha hızlı veri toplama kapasitesine sahibiz.
            </p>

            <ul className="space-y-4">
              <li className="flex items-center gap-4 bg-white/5 p-4 rounded-xl border border-white/10">
                <div className="bg-sky-500/20 p-2 rounded-lg text-sky-400">
                  <Cpu size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-white">Velodyne LiDAR Sensörleri</h4>
                  <p className="text-sm text-stone-400">Saniyede 600.000 nokta atımı ile bitki örtüsünün altını görme imkanı.</p>
                </div>
              </li>
              <li className="flex items-center gap-4 bg-white/5 p-4 rounded-xl border border-white/10">
                <div className="bg-emerald-500/20 p-2 rounded-lg text-emerald-400">
                  <Wifi size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-white">RTK/PPK Konumlandırma</h4>
                  <p className="text-sm text-stone-400">Uydu bağlantısı ile santimetre hassasiyetinde gerçek zamanlı konum verisi.</p>
                </div>
              </li>
            </ul>
          </div>

          <div className="lg:w-1/2 relative group">
            {/* Tech Image Display */}
            <div className="relative z-10 grid grid-cols-2 gap-4">
               <img 
                src="https://picsum.photos/400/500?random=3" 
                alt="Drone close up" 
                className="rounded-2xl shadow-2xl border-2 border-stone-700 w-full h-64 object-cover transform translate-y-8"
               />
               <img 
                src="https://picsum.photos/400/500?random=4" 
                alt="LiDAR Scanner point cloud" 
                className="rounded-2xl shadow-2xl border-2 border-stone-700 w-full h-64 object-cover"
               />
               <div className="col-span-2 bg-stone-800 rounded-2xl p-6 border border-stone-700 flex justify-between items-center mt-4">
                 <div className="flex items-center gap-4">
                   <Battery className="text-green-500" size={24} />
                   <div>
                     <p className="text-xs text-stone-400 uppercase">Uçuş Süresi</p>
                     <p className="font-bold">55 Dakika / Batarya</p>
                   </div>
                 </div>
                 <div className="h-10 w-px bg-stone-600"></div>
                 <div>
                    <p className="text-xs text-stone-400 uppercase">Maksimum Menzil</p>
                    <p className="font-bold">15 KM</p>
                 </div>
               </div>
            </div>
            
            {/* Glow effect behind */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-sky-500/20 blur-3xl rounded-full -z-10 group-hover:bg-sky-500/30 transition-colors duration-500"></div>
          </div>

        </div>
      </div>
    </section>
  );
};