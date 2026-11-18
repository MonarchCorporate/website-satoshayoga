import heroTemple from "@/assets/hero-temple.webp";
import heroTempleLight from "@/assets/hero-temple-light.webp";
import { useTheme } from "@/contexts/ThemeContext";

/**
 * Animierter Hero-Hintergrund — buddhistische Tempel-Stimmung mit Kerzen.
 *
 * Ebenen (von hinten nach vorn):
 *  1. Tempel-Bild mit langsamer Ken-Burns-Bewegung
 *  2. Warmer Goldschimmer-Verlauf zur Farb-Harmonisierung mit dem Theme
 *  3. Flackernde Kerzen-Glows (mehrere Punkte, eigene Flicker-Timings)
 *  4. Aufsteigender Räucher-Rauch (zwei weiche Streifen)
 *  5. Schwebende Goldpartikel (sehr dezent)
 *  6. Stimmungs-Vignette + Lese-Verlauf links
 */
const AnimatedHeroBackground = () => {
  const { mode } = useTheme();
  const isLight = mode === "light";

  // Light-Variante: luftige, helle Yoga-Morgen-Stimmung mit dezenter Bewegung
  if (isLight) {
    const auras = [
      { top: "-10%", left: "-8%", size: 560, dur: 14, delay: 0, op: 0.7 },
      { top: "20%", left: "70%", size: 520, dur: 18, delay: 3, op: 0.55 },
      { top: "65%", left: "30%", size: 620, dur: 16, delay: 6, op: 0.5 },
    ];
    const dust = Array.from({ length: 18 }).map((_, i) => ({
      key: i,
      left: (i * 53) % 100,
      top: 60 + ((i * 23) % 40),
      size: 1 + ((i * 7) % 2),
      delay: (i * 1.3) % 22,
      dur: 18 + ((i * 5) % 12),
    }));

    return (
      <div
        aria-hidden
        className="absolute inset-0 overflow-hidden pointer-events-none"
        style={{
          background:
            "linear-gradient(135deg, hsl(0 0% 92%) 0%, hsl(0 0% 80%) 55%, hsl(0 0% 70%) 100%)",
        }}
      >
        {/* 1. Bildebene mit Ken-Burns */}
        <div
          className="absolute inset-0 animate-[heroKenBurns_60s_ease-in-out_infinite_alternate]"
          style={{
            backgroundImage: `url(${heroTempleLight})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            willChange: "transform",
          }}
        />
        {/* Sanfte Aufhellungs-Schicht zur Harmonisierung mit dem Theme */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, hsl(0 0% 92% / 0.55) 0%, hsl(0 0% 85% / 0.35) 55%, hsl(0 0% 75% / 0.45) 100%)",
          }}
        />

        {/* 2. Atmende Lichtauren */}
        {auras.map((a, i) => (
          <div
            key={i}
            className="absolute rounded-full animate-[lightBreathe_ease-in-out_infinite_alternate]"
            style={{
              top: a.top,
              left: a.left,
              width: a.size,
              height: a.size,
              opacity: a.op,
              background:
                "radial-gradient(circle, hsl(0 0% 100% / 0.9), hsl(0 0% 100% / 0.2) 50%, transparent 75%)",
              filter: "blur(50px)",
              animationDuration: `${a.dur}s`,
              animationDelay: `${a.delay}s`,
              willChange: "transform, opacity",
            }}
          />
        ))}

        {/* 3. Driftende Wolken-Schleier */}
        <div
          className="absolute top-[25%] left-[-30%] w-[160%] h-[120px] animate-[lightDrift_50s_linear_infinite_alternate]"
          style={{
            background:
              "linear-gradient(90deg, transparent, hsl(0 0% 100% / 0.35), transparent)",
            filter: "blur(40px)",
            willChange: "transform",
          }}
        />
        <div
          className="absolute top-[60%] left-[-30%] w-[160%] h-[140px] animate-[lightDrift_60s_linear_infinite_alternate-reverse]"
          style={{
            background:
              "linear-gradient(90deg, transparent, hsl(0 0% 100% / 0.28), transparent)",
            filter: "blur(50px)",
            animationDelay: "-15s",
            willChange: "transform",
          }}
        />

        {/* 4. Linien-Mandala */}
        <svg
          className="absolute left-1/2 top-1/2 animate-[lightSpinSlow_120s_linear_infinite]"
          style={{
            width: "80vmin",
            height: "80vmin",
            transform: "translate(-50%, -50%)",
            opacity: 0.35,
            willChange: "transform",
          }}
          viewBox="0 0 200 200"
          fill="none"
        >
          {[40, 55, 70, 85].map((r) => (
            <circle key={r} cx="100" cy="100" r={r} stroke="hsl(0 0% 100% / 0.55)" strokeWidth="0.4" />
          ))}
          {Array.from({ length: 24 }).map((_, i) => {
            const a = (i * Math.PI * 2) / 24;
            return (
              <line
                key={i}
                x1={100 + Math.cos(a) * 40}
                y1={100 + Math.sin(a) * 40}
                x2={100 + Math.cos(a) * 85}
                y2={100 + Math.sin(a) * 85}
                stroke="hsl(0 0% 100% / 0.35)"
                strokeWidth="0.3"
              />
            );
          })}
        </svg>

        {/* 5. Schwebende Staubpartikel */}
        {dust.map((p) => (
          <span
            key={p.key}
            className="absolute rounded-full animate-[lightDust_linear_infinite]"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: p.size,
              height: p.size,
              background: "hsl(0 0% 100% / 0.9)",
              boxShadow: "0 0 4px hsl(0 0% 100% / 0.6)",
              animationDuration: `${p.dur}s`,
              animationDelay: `-${p.delay}s`,
              willChange: "transform, opacity",
            }}
          />
        ))}

        {/* 6. Sanfte Vignette nach unten */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, transparent 60%, hsl(0 0% 65% / 0.5) 100%)",
          }}
        />

        <style>{`
          @keyframes heroKenBurns {
            0%   { transform: scale(1.05) translate(0, 0); }
            100% { transform: scale(1.18) translate(-2%, -1%); }
          }
          @keyframes lightBreathe {
            0%   { transform: scale(0.95); opacity: 0.45; }
            100% { transform: scale(1.1);  opacity: 0.75; }
          }
          @keyframes lightDrift {
            0%   { transform: translateX(0); }
            100% { transform: translateX(20%); }
          }
          @keyframes lightSpinSlow {
            from { transform: translate(-50%, -50%) rotate(0deg); }
            to   { transform: translate(-50%, -50%) rotate(360deg); }
          }
          @keyframes lightDust {
            0%   { transform: translate3d(0, 0, 0); opacity: 0; }
            15%  { opacity: 0.8; }
            50%  { transform: translate3d(10px, -60px, 0); opacity: 0.6; }
            85%  { opacity: 0.3; }
            100% { transform: translate3d(-6px, -130px, 0); opacity: 0; }
          }
        `}</style>
      </div>
    );
  }


  // Kerzen-Glows: Position in % + individuelles Flicker-Timing
  const candles = [
    { left: 12, top: 68, size: 220, delay: 0, dur: 3.1 },
    { left: 22, top: 72, size: 180, delay: 0.6, dur: 2.7 },
    { left: 38, top: 78, size: 160, delay: 1.2, dur: 3.6 },
    { left: 50, top: 64, size: 260, delay: 0.3, dur: 4.2 },
    { left: 64, top: 76, size: 170, delay: 1.8, dur: 2.9 },
    { left: 78, top: 70, size: 200, delay: 0.9, dur: 3.4 },
    { left: 88, top: 74, size: 190, delay: 1.5, dur: 3.8 },
  ];

  // Sehr dezente Goldpartikel (Funken)
  const particles = Array.from({ length: 14 }).map((_, i) => ({
    key: i,
    left: (i * 67) % 100,
    top: 45 + ((i * 19) % 45),
    size: 1.5 + ((i * 5) % 3),
    delay: (i * 0.9) % 10,
    dur: 16 + ((i * 4) % 10),
  }));

  return (
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden pointer-events-none bg-[hsl(var(--ink))]"
    >
      {/* 1. Bildebene mit Ken-Burns */}
      <div
        className="absolute inset-0 animate-[heroKenBurns_60s_ease-in-out_infinite_alternate]"
        style={{
          backgroundImage: `url(${heroTemple})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          willChange: "transform",
        }}
      />

      {/* 2. Goldschimmer-Harmonisierung */}
      <div
        className="absolute inset-0 mix-blend-soft-light opacity-60"
        style={{
          background:
            "radial-gradient(ellipse at 50% 70%, hsl(var(--primary) / 0.45), transparent 60%)",
        }}
      />

      {/* 3. Flackernde Kerzen-Glows */}
      {candles.map((c, i) => (
        <div
          key={i}
          className="absolute rounded-full animate-[heroFlicker_ease-in-out_infinite] mix-blend-screen"
          style={{
            left: `${c.left}%`,
            top: `${c.top}%`,
            width: c.size,
            height: c.size,
            transform: "translate(-50%, -50%)",
            background:
              "radial-gradient(circle, hsl(45 95% 65% / 0.55), hsl(38 90% 50% / 0.25) 35%, transparent 65%)",
            filter: "blur(6px)",
            animationDelay: `${c.delay}s`,
            animationDuration: `${c.dur}s`,
          }}
        />
      ))}

      {/* 4. Räucher-Rauch */}
      <div
        className="absolute bottom-0 left-[28%] w-[220px] h-[80%] opacity-25 animate-[heroSmoke_18s_ease-in-out_infinite]"
        style={{
          background:
            "radial-gradient(ellipse at 50% 100%, hsl(0 0% 90% / 0.35), transparent 70%)",
          filter: "blur(20px)",
          transformOrigin: "bottom center",
        }}
      />
      <div
        className="absolute bottom-0 right-[26%] w-[200px] h-[75%] opacity-20 animate-[heroSmoke_22s_ease-in-out_infinite_reverse]"
        style={{
          background:
            "radial-gradient(ellipse at 50% 100%, hsl(0 0% 88% / 0.3), transparent 70%)",
          filter: "blur(24px)",
          transformOrigin: "bottom center",
          animationDelay: "4s",
        }}
      />

      {/* 5. Goldfunken */}
      {particles.map((p) => (
        <span
          key={p.key}
          className="absolute rounded-full animate-[heroSpark_linear_infinite]"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            background: "hsl(var(--primary) / 0.8)",
            boxShadow: "0 0 6px hsl(var(--primary) / 0.7)",
            animationDuration: `${p.dur}s`,
            animationDelay: `-${p.delay}s`,
          }}
        />
      ))}

      {/* 6. Vignette für Tiefe */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 45%, hsl(var(--ink) / 0.85) 100%)",
        }}
      />

      <style>{`
        @keyframes heroKenBurns {
          0%   { transform: scale(1.05) translate(0, 0); }
          100% { transform: scale(1.18) translate(-2%, -1%); }
        }
        @keyframes heroFlicker {
          0%, 100% { opacity: 0.85; transform: translate(-50%, -50%) scale(1); }
          25%      { opacity: 0.65; transform: translate(-50%, -50%) scale(0.96); }
          50%      { opacity: 1;    transform: translate(-50%, -50%) scale(1.06); }
          70%      { opacity: 0.7;  transform: translate(-50%, -50%) scale(0.98); }
        }
        @keyframes heroSmoke {
          0%   { transform: translateY(10%) scaleY(0.9); opacity: 0.18; }
          50%  { transform: translateY(-5%) scaleY(1.05); opacity: 0.28; }
          100% { transform: translateY(10%) scaleY(0.9); opacity: 0.18; }
        }
        @keyframes heroSpark {
          0%   { transform: translate3d(0, 0, 0); opacity: 0; }
          15%  { opacity: 0.9; }
          50%  { transform: translate3d(15px, -50px, 0); opacity: 0.6; }
          85%  { opacity: 0.3; }
          100% { transform: translate3d(-8px, -110px, 0); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default AnimatedHeroBackground;
