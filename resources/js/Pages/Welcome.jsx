import { useEffect, useLayoutEffect } from "react";
import { Navbar } from "@/Components/Landing/Navbar";
import { Hero } from "@/Components/Landing/Hero";
import { Features } from "@/Components/Landing/Features";
import { Services } from "@/Components/Landing/PopularServices";
import { BookingForm } from "@/Components/Landing/BookingForm";
import { Gallery } from "@/Components/Landing/Gallery";
import { About } from "@/Components/Landing/About";
import { Footer } from "@/Components/Landing/Footer";

const Index = () => {
  // The public landing page always renders dark, regardless of the
  // logged-in theme preference stored in localStorage/data-theme.
  // Runs before paint (and restores whatever was there on unmount) so
  // navigating here from a light-mode dashboard never flashes light.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'dark');
    return () => {
      if (previous === null) {
        root.removeAttribute('data-theme');
      } else {
        root.setAttribute('data-theme', previous);
      }
    };
  }, []);

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