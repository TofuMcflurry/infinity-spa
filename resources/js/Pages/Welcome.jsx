import { useEffect } from "react";
import { Navbar } from "@/Components/Landing/Navbar";
import { Hero } from "@/Components/Landing/Hero";
import { Features } from "@/Components/Landing/Features";
import { Services } from "@/Components/Landing/PopularServices";
import { BookingForm } from "@/Components/Landing/BookingForm";
import { Gallery } from "@/Components/Landing/Gallery";
import { About } from "@/Components/Landing/About";
import { Footer } from "@/Components/Landing/Footer";

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
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="bg-background">
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