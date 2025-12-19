import React from 'react';

interface PageNavigationProps {
  activeSection: string;
  onNavigate: (sectionId: string) => void;
  showDetailDot: boolean;
}

export const PageNavigation: React.FC<PageNavigationProps> = ({ activeSection, onNavigate, showDetailDot }) => {
  const sections = [
    { id: 'hero', label: 'Giriş' },
    { id: 'services', label: 'Hizmetler' },
    ...(showDetailDot ? [{ id: 'service-detail', label: 'Detay' }] : []),
    { id: 'references', label: 'Referanslar' },
    { id: 'contact', label: 'İletişim' }
  ];

  return (
    <div className="fixed left-6 top-1/2 -translate-y-1/2 z-50 hidden md:flex flex-col gap-6">
      {sections.map((section) => (
        <button
          key={section.id}
          onClick={() => onNavigate(section.id)}
          className="group flex items-center gap-4 focus:outline-none"
        >
          {/* Dot */}
          <div 
            className={`w-3 h-3 rounded-full transition-all duration-300 border border-white/50 
              ${activeSection === section.id 
                ? 'bg-emerald-500 scale-125 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' 
                : 'bg-transparent hover:bg-white/50 hover:scale-110'
              }`}
          ></div>
          
          {/* Label (Tooltip style) */}
          <span 
            className={`absolute left-8 px-2 py-1 rounded bg-stone-900/80 backdrop-blur text-white text-xs font-medium uppercase tracking-wider opacity-0 -translate-x-2 transition-all duration-300 pointer-events-none whitespace-nowrap
              ${activeSection === section.id ? 'group-hover:opacity-100 group-hover:translate-x-0' : 'group-hover:opacity-100 group-hover:translate-x-0'}
            `}
          >
            {section.label}
          </span>
        </button>
      ))}
      
      {/* Connector Line */}
      <div className="absolute left-[5px] top-2 bottom-2 w-[1px] bg-white/10 -z-10"></div>
    </div>
  );
};