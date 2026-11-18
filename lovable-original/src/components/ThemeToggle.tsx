import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

export default function ThemeToggle() {
  const { mode, toggle } = useTheme();
  const isLight = mode === "light";
  return (
    <button
      onClick={toggle}
      aria-label="Design wechseln"
      title={isLight ? "Zum dunklen Design wechseln" : "Zum hellen Design wechseln"}
      className="fixed bottom-6 right-6 z-[100] h-12 w-12 rounded-full border border-[hsl(var(--primary))]/50 bg-[hsl(var(--background))]/90 backdrop-blur-md shadow-lg flex items-center justify-center text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))] hover:text-[hsl(var(--background))] transition-colors"
    >
      {isLight ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
    </button>
  );
}
