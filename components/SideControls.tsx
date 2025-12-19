import React, { useState } from 'react';
import { Instagram, Linkedin, Youtube, MessageCircle, X, Plus } from 'lucide-react';

interface SideControlsProps {
  onOpenContact: () => void;
}

export const SideControls: React.FC<SideControlsProps> = ({ onOpenContact }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <>
      {/* DESKTOP SIDEBAR: Clean, Minimalist Vertical Dock */}
      <div className="fixed right-6 top-1/2 -translate-y-1/2 z-40 hidden md:flex flex-col gap-4">
         <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-2 rounded-full flex flex-col gap-5 items-center shadow-2xl">
            <a href="#" className="p-3 rounded-full hover:bg-white/10 text-stone-500 hover:text-white transition-all transform hover:scale-110">
              <Linkedin size={18} />
            </a>
            <a href="#" className="p-3 rounded-full hover:bg-white/10 text-stone-500 hover:text-white transition-all transform hover:scale-110">
              <Instagram size={18} />
            </a>
            <a href="#" className="p-3 rounded-full hover:bg-white/10 text-stone-500 hover:text-white transition-all transform hover:scale-110">
              <Youtube size={18} />
            </a>
            <div className="w-8 h-[1px] bg-white/10"></div>
            {/* Proper WhatsApp Branding */}
            <a 
              href="https://wa.me/902125550011" 
              target="_blank" 
              rel="noreferrer" 
              className="p-4 rounded-full bg-[#25D366] text-white hover:bg-[#128C7E] transition-all transform hover:rotate-12 hover:scale-110 shadow-lg shadow-green-500/30"
              title="WhatsApp İletişim"
            >
              <MessageCircle size={24} fill="white" className="stroke-none" /> 
            </a>
         </div>
      </div>

      {/* MOBILE FLOATING ACTION BUTTON (FAB): Toggle Menu */}
      <div className="fixed bottom-8 right-8 z-[70] md:hidden flex flex-col items-end gap-4">
         
         {/* Expandable Social Menu */}
         <div className={`flex flex-col gap-4 transition-all duration-500 transform ${isMobileMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}>
            <a href="#" className="w-12 h-12 rounded-full bg-stone-900 text-white flex items-center justify-center shadow-xl border border-white/10 transform transition-transform">
               <Instagram size={20} />
            </a>
            <a href="#" className="w-12 h-12 rounded-full bg-stone-900 text-white flex items-center justify-center shadow-xl border border-white/10 transform transition-transform">
               <Linkedin size={20} />
            </a>
            <a href="#" className="w-12 h-12 rounded-full bg-stone-900 text-white flex items-center justify-center shadow-xl border border-white/10 transform transition-transform">
               <Youtube size={20} />
            </a>
            <a 
               href="https://wa.me/902125550011" 
               target="_blank" 
               rel="noreferrer"
               className="w-12 h-12 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-xl"
            >
               <MessageCircle size={22} fill="white" className="stroke-none" />
            </a>
         </div>

         {/* The Master Toggle Button */}
         <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 transform active:scale-90
               ${isMobileMenuOpen ? 'bg-stone-900 text-white rotate-45' : 'bg-[#25D366] text-white rotate-0 shadow-[0_0_20px_rgba(37,211,102,0.4)]'}
            `}
         >
            {isMobileMenuOpen ? <X size={28} /> : <MessageCircle size={28} fill="white" className="stroke-none" />}
         </button>
      </div>

      {/* Mobile Overlay for closing FAB */}
      {isMobileMenuOpen && (
         <div 
           className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[65] md:hidden"
           onClick={() => setIsMobileMenuOpen(false)}
         ></div>
      )}
    </>
  );
};