import { Navbar } from "@/Components/spa/Navbar";
import { Hero } from "@/Components/Landing/Hero"; 
import { Features } from "@/Components/spa/Features";
import { Services } from "@/Components/spa/Services";
import { BookingForm } from "@/Components/spa/BookingForm";
import { Gallery } from "@/Components/spa/Gallery";
import { About } from "@/Components/spa/About";
import { Footer } from "@/Components/spa/Footer";
import { useEffect } from "react";

const Index = () => {
  useEffect(() => {
    document.title = "Infinity Home Spa — Dubai's Premier Home Spa Experience";

    const setMeta = (name, content) => {
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    setMeta(
      "description",
      "Dubai's premier home spa concierge. Licensed therapists deliver luxury massages, facials and Royal Hammam rituals to your door."
    );

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", window.location.origin + "/");
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <Hero />
        <Features />
        <Services />
        <BookingForm />
        <Gallery />
        <About />
      </main>
      <Footer />
    </div>
  );
};

export default Index;