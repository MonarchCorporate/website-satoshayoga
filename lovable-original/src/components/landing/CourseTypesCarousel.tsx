import { useCallback, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { courseTypesContent } from "@/data/course-types-content";
import { useIsMobile } from "@/hooks/use-mobile";

const TWEEN_FACTOR = 1.2;

export default function CourseTypesCarousel() {
  const isMobile = useIsMobile();
  const autoplay = useRef(
    Autoplay({ delay: 5000, stopOnInteraction: false, stopOnMouseEnter: true })
  );
  const startIndex = courseTypesContent.findIndex((c) => c.id === "slow-vinyasa");

  const plugins = isMobile ? [] : [autoplay.current];
  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop: !isMobile,
      align: "center",
      containScroll: isMobile ? "trimSnaps" : false,
      startIndex: startIndex >= 0 ? startIndex : 0,
      axis: "x",
      watchDrag: (_emblaApi, evt) => {
        // On mobile: only start dragging when horizontal movement dominates,
        // so vertical page scrolling stays possible.
        if (!isMobile) return true;
        const target = evt.target as HTMLElement | null;
        // Allow drag only when the pointer starts on the carousel itself
        return !!target;
      },
    },
    plugins
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [hasEntered, setHasEntered] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  // Entry animation trigger
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setHasEntered(true);
            obs.disconnect();
          }
        });
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // 3D coverflow tween (desktop only)
  const applyTween = useCallback((api: NonNullable<typeof emblaApi>) => {
    const engine = api.internalEngine();
    const scrollProgress = api.scrollProgress();
    const slidesInView = api.slidesInView();
    const isScrollEvent = engine.dragHandler.pointerDown();

    const slideNodes = api.slideNodes();
    api.scrollSnapList().forEach((scrollSnap, snapIndex) => {
      let diffToTarget = scrollSnap - scrollProgress;
      const slidesInSnap = engine.slideRegistry[snapIndex];

      slidesInSnap.forEach((slideIndex) => {
        if (isScrollEvent && !slidesInView.includes(slideIndex)) return;

        engine.slideLooper.loopPoints.forEach((loopItem) => {
          const target = loopItem.target();
          if (slideIndex === loopItem.index && target !== 0) {
            const sign = Math.sign(target);
            if (sign === -1) diffToTarget = scrollSnap - (1 + scrollProgress);
            if (sign === 1) diffToTarget = scrollSnap + (1 - scrollProgress);
          }
        });

        const tween = diffToTarget * TWEEN_FACTOR;
        const clamped = Math.max(-1.2, Math.min(1.2, tween));
        const rotateY = clamped * -35;
        const translateZ = -Math.abs(clamped) * 140;
        const scale = 1 - Math.min(Math.abs(clamped) * 0.15, 0.18);
        const opacity = 1 - Math.min(Math.abs(clamped) * 0.45, 0.55);

        const node = slideNodes[slideIndex];
        if (node) {
          node.style.transform = `translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`;
          node.style.opacity = String(opacity);
          node.style.zIndex = String(100 - Math.round(Math.abs(clamped) * 100));
        }
      });
    });
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    onSelect();

    if (!isMobile) {
      applyTween(emblaApi);
      const onScroll = () => applyTween(emblaApi);
      const onReInit = () => {
        onSelect();
        applyTween(emblaApi);
      };
      emblaApi.on("select", onSelect);
      emblaApi.on("scroll", onScroll);
      emblaApi.on("reInit", onReInit);
      return () => {
        emblaApi.off("select", onSelect);
        emblaApi.off("scroll", onScroll);
        emblaApi.off("reInit", onReInit);
      };
    } else {
      // Reset any inline transforms from a previous desktop render
      emblaApi.slideNodes().forEach((node) => {
        node.style.transform = "";
        node.style.opacity = "";
        node.style.zIndex = "";
      });
      emblaApi.on("select", onSelect);
      return () => {
        emblaApi.off("select", onSelect);
      };
    }
  }, [emblaApi, applyTween, isMobile]);

  const scrollPrev = () => emblaApi?.scrollPrev();
  const scrollNext = () => emblaApi?.scrollNext();
  const scrollTo = (i: number) => emblaApi?.scrollTo(i);

  return (
    <div ref={sectionRef} className="relative">
      {/* Side fades (desktop only) */}
      {!isMobile && (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-8 md:w-40 z-30 bg-gradient-to-r from-[hsl(var(--card))] to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 md:w-40 z-30 bg-gradient-to-l from-[hsl(var(--card))] to-transparent" />
        </>
      )}

      {/* Carousel viewport */}
      <div
        className="overflow-hidden py-8 md:py-12"
        style={{
          perspective: isMobile ? undefined : "1400px",
          touchAction: isMobile ? "pan-y" : undefined,
        }}
        ref={emblaRef}
      >
        <div
          className="flex items-start md:items-stretch"
          style={{ transformStyle: isMobile ? undefined : "preserve-3d" }}
        >
          {courseTypesContent.map((c, i) => (
            <div
              key={c.id}
              className={`relative shrink-0 grow-0 px-2 md:px-4 transition-[opacity,transform] duration-300 ease-out ${
                isMobile ? "basis-full" : "basis-[94%] md:basis-[88%] max-w-[560px]"
              }`}
              style={{
                transformStyle: isMobile ? undefined : "preserve-3d",
                animationDelay: `${i * 80}ms`,
              }}
            >
              <article
                className={`relative h-full rounded-2xl border bg-[hsl(var(--background))]/95 backdrop-blur-sm p-5 md:p-10 shadow-2xl overflow-hidden ${
                  hasEntered ? "animate-fade-in" : "opacity-0"
                } ${
                  selectedIndex === i
                    ? "border-[hsl(var(--primary))]/70"
                    : "border-[hsl(var(--border))]/40"
                }`}
                style={{
                  animationDelay: `${i * 90}ms`,
                  animationFillMode: "both",
                  boxShadow:
                    selectedIndex === i
                      ? `0 25px 60px -20px hsl(${c.accent} / 0.35), 0 0 0 1px hsl(var(--primary) / 0.15)`
                      : "0 15px 40px -20px hsl(0 0% 0% / 0.5)",
                }}
              >
                {/* Accent glow */}
                <div
                  className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full blur-3xl opacity-30"
                  style={{ background: `hsl(${c.accent})` }}
                />
                <div
                  className="pointer-events-none absolute bottom-0 left-0 h-1 w-full"
                  style={{
                    background: `linear-gradient(90deg, transparent, hsl(${c.accent}), transparent)`,
                  }}
                />

                <header className="relative flex items-start gap-4 mb-5">
                  <div
                    className="text-5xl md:text-6xl leading-none select-none"
                    style={{ filter: `drop-shadow(0 6px 14px hsl(${c.accent} / 0.5))` }}
                    aria-hidden
                  >
                    {c.emoji}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-display text-2xl md:text-3xl text-[hsl(var(--foreground))] leading-tight">
                      {c.title}
                    </h3>
                    <p className="font-display italic text-[hsl(var(--primary))] text-base md:text-lg mt-1">
                      {c.subtitle}
                    </p>
                  </div>
                </header>

                <div className="relative space-y-3 text-[hsl(var(--muted-foreground))] leading-relaxed text-sm md:text-base">
                  {c.description.map((p, idx) => (
                    <p key={idx}>{p}</p>
                  ))}
                </div>

                <div className="relative mt-6 pt-5 border-t border-[hsl(var(--border))]/40">
                  <p className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[hsl(var(--primary))] mb-3">
                    <Sparkles className="h-3.5 w-3.5" />
                    Für dich geeignet, wenn du:
                  </p>
                  <ul className="space-y-1.5 text-sm text-[hsl(var(--foreground))]/85">
                    {c.suitedFor.map((s, idx) => (
                      <li key={idx} className="flex gap-2">
                        <span
                          className="mt-2 h-1.5 w-1.5 rounded-full shrink-0"
                          style={{ background: `hsl(${c.accent})` }}
                        />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {c.note && (
                  <p className="relative mt-5 text-xs italic text-[hsl(var(--muted-foreground))] border-l-2 border-[hsl(var(--primary))]/60 pl-3">
                    ⚠️ Hinweis: {c.note}
                  </p>
                )}
              </article>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="relative z-40 flex items-center justify-center gap-4 mt-6">
        <button
          onClick={scrollPrev}
          aria-label="Vorheriger Kurs"
          className="h-11 w-11 rounded-full border border-[hsl(var(--primary))]/50 text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))] hover:text-[hsl(var(--background))] transition-colors flex items-center justify-center"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          {courseTypesContent.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollTo(i)}
              aria-label={`Zu Kurs ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                selectedIndex === i
                  ? "w-8 bg-[hsl(var(--primary))]"
                  : "w-1.5 bg-[hsl(var(--muted-foreground))]/40 hover:bg-[hsl(var(--muted-foreground))]/70"
              }`}
            />
          ))}
        </div>

        <button
          onClick={scrollNext}
          aria-label="Nächster Kurs"
          className="h-11 w-11 rounded-full border border-[hsl(var(--primary))]/50 text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))] hover:text-[hsl(var(--background))] transition-colors flex items-center justify-center"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
