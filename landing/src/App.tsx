import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Features } from './components/Features';
import { OpenSource } from './components/OpenSource';
import { HowItWorks } from './components/HowItWorks';
import { Tutorial } from './components/Tutorial';
import { Footer } from './components/Footer';

export default function App() {
  return (
    <div className="min-h-screen bg-dc-main text-dc-text">
      <Navbar />
      <Hero />
      <Features />
      <OpenSource />
      <HowItWorks />
      <Tutorial />
      <Footer />
    </div>
  );
}
