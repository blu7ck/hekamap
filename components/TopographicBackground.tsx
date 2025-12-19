import React, { useEffect, useState } from 'react';

export const TopographicBackground: React.FC = () => {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      // Use requestAnimationFrame for smoother performance
      requestAnimationFrame(() => {
        setScrollY(window.scrollY);
      });
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden opacity-30">
      <svg
        className="absolute w-full h-full"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#10b981', stopOpacity: 0.2 }} />
            <stop offset="100%" style={{ stopColor: '#0ea5e9', stopOpacity: 0.2 }} />
          </linearGradient>
        </defs>
        
        {/* Layer 1 - Slow movement */}
        <g 
          className="topo-line" 
          style={{ transform: `translateY(${scrollY * 0.05}px)` }}
        >
          <path
            d="M0,200 Q250,100 500,200 T1000,200 V1000 H0 Z"
            fill="none"
            stroke="#10b981" // Emerald
            strokeWidth="1.5"
            opacity="0.3"
          />
           <path
            d="M0,250 Q250,150 500,250 T1000,250"
            fill="none"
            stroke="#10b981"
            strokeWidth="1"
            opacity="0.2"
          />
        </g>

        {/* Layer 2 - Medium movement */}
        <g 
          className="topo-line" 
          style={{ transform: `translateY(-${scrollY * 0.1}px)` }}
        >
          <path
            d="M0,500 Q250,400 500,500 T1000,500"
            fill="none"
            stroke="#0ea5e9" // Sky Blue
            strokeWidth="1.5"
            opacity="0.3"
          />
           <path
            d="M0,550 Q250,450 500,550 T1000,550"
            fill="none"
            stroke="#0ea5e9"
            strokeWidth="1"
            opacity="0.2"
          />
        </g>

         {/* Layer 3 - Complex Organic Shapes (Static or Very Slow) */}
         <g 
          className="topo-line" 
          style={{ transform: `translateY(${scrollY * 0.02}px)` }}
        >
          <path
            d="M-100,800 C150,700 300,900 500,800 C700,700 850,900 1100,800"
            fill="none"
            stroke="#d97706" // Amber/Brown
            strokeWidth="1"
            strokeDasharray="10,10"
            opacity="0.2"
          />
           <circle cx="200" cy="300" r="150" fill="none" stroke="#10b981" strokeWidth="0.5" opacity="0.1" />
           <circle cx="800" cy="600" r="200" fill="none" stroke="#0ea5e9" strokeWidth="0.5" opacity="0.1" />
        </g>
      </svg>
      
      {/* Texture overlay replaced with soft gradient to avoid external fetch */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-amber-500/5 to-sky-500/5 opacity-30 mix-blend-multiply"></div>
    </div>
  );
};