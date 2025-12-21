import React, { useState, useRef, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Hero } from './components/Hero';
import { Services } from './components/Services';
import { Contact } from './components/Contact';
import { SideControls } from './components/SideControls';
import { ContactModal } from './components/ContactModal';
import { PageNavigation } from './components/PageNavigation';
import { AuthProvider } from './auth/AuthProvider';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminLogin } from './pages/AdminLogin';
import { AdminDashboard } from './pages/AdminDashboard';
import { WorkspaceLogin } from './pages/WorkspaceLogin';
import { WorkspacePage } from './pages/WorkspacePage';
import { CesiumViewerPage } from './pages/CesiumViewerPage';
import { ErrorBoundary } from './components/ErrorBoundary';

const LandingPage: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('hero');
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const servicesRef = useRef<HTMLDivElement>(null);
  const contactRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      {
        root: scrollContainerRef.current,
        threshold: 0.5,
      }
    );

    if (heroRef.current) observer.observe(heroRef.current);
    if (servicesRef.current) observer.observe(servicesRef.current);
    if (contactRef.current) observer.observe(contactRef.current);

    return () => observer.disconnect();
  }, []);

  const handleNavigation = (sectionId: string) => {
    const refs: Record<string, React.RefObject<HTMLDivElement>> = {
      hero: heroRef,
      services: servicesRef,
      contact: contactRef,
    };
    
    refs[sectionId]?.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <main className="relative bg-black h-screen w-screen overflow-hidden">
      <PageNavigation activeSection={activeSection} onNavigate={handleNavigation} showDetailDot={false} />

      <div ref={scrollContainerRef} className="h-full w-full overflow-y-scroll scroll-smooth snap-y snap-mandatory no-scrollbar">
        <div id="hero" ref={heroRef} className="snap-start h-screen w-full">
            <Hero />
        </div>
        
        <div id="services" ref={servicesRef} className="snap-start h-screen w-full">
            <Services />
        </div>

        <div id="contact" ref={contactRef} className="snap-start h-screen w-full">
          <Contact onOpenModal={() => setIsModalOpen(true)} />
        </div>
      </div>

      <SideControls onOpenContact={() => setIsModalOpen(true)} />
      <ContactModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </main>
  );
};

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/hekadmin/login" element={<AdminLogin />} />
            <Route
              path="/hekadmin"
              element={
                <ProtectedRoute roles={['owner']} fallback="/hekadmin/login">
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route path="/workspace/login" element={<WorkspaceLogin />} />
            <Route
              path="/workspace"
              element={
                <ProtectedRoute roles={['owner', 'admin']} fallback="/workspace/login">
                  <WorkspacePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/viewer/:projectId"
              element={
                <ProtectedRoute roles={['owner', 'admin']} fallback="/workspace/login">
                  <CesiumViewerPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
};

export default App;