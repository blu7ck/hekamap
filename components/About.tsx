import React from 'react';
import { Target, Users, Award } from 'lucide-react';
import { StatItem } from '../types';

const stats: StatItem[] = [
  { id: 1, value: "150+", label: "Tamamlanan Proje" },
  { id: 2, value: "12", label: "Yıllık Tecrübe" },
  { id: 3, value: "45", label: "Uzman Personel" },
  { id: 4, value: "%100", label: "Müşteri Memnuniyeti" },
];

export const About: React.FC = () => {
  return (
    <section id="about" className="py-20 bg-white/50 backdrop-blur-sm relative z-10">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row gap-16 items-center">
          
          <div className="md:w-1/2">
             <div className="relative">
               <img 
                src="https://picsum.photos/600/700?random=2" 
                alt="Surveyors working in field" 
                className="rounded-2xl shadow-xl w-full object-cover h-[500px]"
              />
              <div className="absolute -bottom-6 -right-6 w-48 h-48 bg-emerald-600 rounded-2xl p-6 flex flex-col justify-center text-white hidden md:flex shadow-2xl">
                 <p className="text-4xl font-bold mb-2">2012</p>
                 <p className="text-sm opacity-90 leading-snug">Yılından beri güvenle ölçüyoruz.</p>
              </div>
             </div>
          </div>

          <div className="md:w-1/2 space-y-8">
            <h2 className="text-emerald-600 font-bold tracking-wider uppercase text-sm">Hakkımızda</h2>
            <h3 className="text-4xl font-bold text-stone-900">Araziyi Anlamak İçin Doğru Teknoloji</h3>
            <p className="text-stone-600 leading-relaxed text-lg">
              GeoVision Mühendislik olarak, geleneksel haritacılık ilkelerini modern teknoloji ile birleştiriyoruz. 
              Amacımız, inşaat, madencilik ve çevre planlama projelerinizde ihtiyacınız olan hassas veriyi 
              en hızlı ve en doğru şekilde sunmaktır.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4">
              <div className="flex items-start gap-3">
                 <div className="bg-sky-100 p-2 rounded-lg text-sky-600 mt-1">
                   <Target size={20} />
                 </div>
                 <div>
                   <h4 className="font-bold text-stone-800">Hassas Çözümler</h4>
                   <p className="text-sm text-stone-500 mt-1">Milimetre hassasiyetinde ölçüm ve raporlama hizmetleri.</p>
                 </div>
              </div>
               <div className="flex items-start gap-3">
                 <div className="bg-amber-100 p-2 rounded-lg text-amber-600 mt-1">
                   <Users size={20} />
                 </div>
                 <div>
                   <h4 className="font-bold text-stone-800">Uzman Kadro</h4>
                   <p className="text-sm text-stone-500 mt-1">Alanında uzman harita mühendisleri ve teknik ekip.</p>
                 </div>
              </div>
               <div className="flex items-start gap-3">
                 <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600 mt-1">
                   <Award size={20} />
                 </div>
                 <div>
                   <h4 className="font-bold text-stone-800">Sertifikalı Hizmet</h4>
                   <p className="text-sm text-stone-500 mt-1">Uluslararası standartlarda kalite ve güvenlik sertifikaları.</p>
                 </div>
              </div>
            </div>

            {/* Stats Row */}
            <div className="border-t border-stone-200 pt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {stats.map(stat => (
                <div key={stat.id} className="text-center sm:text-left">
                  <p className="text-3xl font-bold text-stone-800">{stat.value}</p>
                  <p className="text-xs text-stone-500 uppercase tracking-wide mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};