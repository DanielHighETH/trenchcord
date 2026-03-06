import { useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Features } from './components/Features';
import { Security } from './components/Security';
import { OpenSource } from './components/OpenSource';
import { HowItWorks } from './components/HowItWorks';
import { Tutorial } from './components/Tutorial';
import { Changelog } from './components/Changelog';
import { Footer } from './components/Footer';

export default function App() {
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const timer = setTimeout(() => {
        document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' });
      }, 400);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <div className="min-h-screen bg-dc-main text-dc-text">
      <Navbar />
      <Hero />
      <Features />
      <Security />
      <div className="mx-auto max-w-5xl px-6"><hr className="border-dc-divider" /></div>
      <OpenSource />
      <HowItWorks />
      <Tutorial />
      <Changelog />
      <Footer />
    </div>
  );
}
