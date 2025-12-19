import React, { useState, useEffect } from 'react';
import { Menu, X, Map } from 'lucide-react';
import { NavLink } from '../types';

const navLinks: NavLink[] = [
  { label: 'Anasayfa', href: '#hero' },
  { label: 'Hakkımızda', href: '#about' },
  { label: 'Hizmetler', href: '#services' },
  { label: 'Teknoloji', href: '#tech' },
  { label: 'İletişim', href: '#contact' },
];

export const Navbar: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-white/90 backdrop-blur-md shadow-md py-3'
          : 'bg-transparent py-5'
      }`}
    >
      <div className="container mx-auto px-6 flex justify-between items-center">
        {/* Logo */}
        <div className="flex items-center gap-2 group cursor-pointer">
          <div className="bg-emerald-600 p-2 rounded-lg text-white transform group-hover:rotate-12 transition-transform">
            <Map size={24} />
          </div>
          <span className={`text-2xl font-bold tracking-tight ${isScrolled ? 'text-stone-800' : 'text-stone-800 lg:text-stone-900'}`}>
            Geo<span className="text-emerald-600">Vision</span>
          </span>
        </div>

        {/* Desktop Menu */}
        <div className="hidden md:flex gap-8">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className={`font-medium text-sm hover:text-emerald-600 transition-colors ${
                isScrolled ? 'text-stone-600' : 'text-stone-700'
              }`}
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Call to Action Button (Desktop) */}
        <div className="hidden md:block">
          <a
            href="#contact"
            className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-full transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            Teklif Al
          </a>
        </div>

        {/* Mobile Toggle */}
        <button
          className="md:hidden text-stone-700 p-2"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 w-full bg-white border-t border-stone-100 shadow-xl flex flex-col p-6 gap-4 animate-fade-in-down">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-lg font-medium text-stone-600 hover:text-emerald-600"
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <a
            href="#contact"
            className="mt-2 w-full text-center px-5 py-3 bg-emerald-600 text-white rounded-lg font-semibold"
            onClick={() => setMobileMenuOpen(false)}
          >
            Teklif Al
          </a>
        </div>
      )}
    </nav>
  );
};