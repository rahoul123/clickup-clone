import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme, type Theme } from "@/contexts/ThemeContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ThemeToggleProps {
  /** "button" = simple light/dark toggle. "menu" = light/dark/system picker. */
  variant?: "button" | "menu";
  className?: string;
  showLabel?: boolean;
}

export function ThemeToggle({ variant = "menu", className, showLabel = false }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();

  if (variant === "button") {
    const isDark = resolvedTheme === "dark";
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          className,
        )}
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        {showLabel && <span className="text-sm">{isDark ? "Light" : "Dark"}</span>}
      </button>
    );
  }

  const options: Array<{ value: Theme; label: string; icon: React.ReactNode }> = [
    { value: "light", label: "Light", icon: <Sun className="h-4 w-4" /> },
    { value: "dark", label: "Dark", icon: <Moon className="h-4 w-4" /> },
    { value: "system", label: "System", icon: <Monitor className="h-4 w-4" /> },
  ];

  const ActiveIcon = resolvedTheme === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Toggle theme"
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            className,
          )}
        >
          <ActiveIcon className="h-4 w-4" />
          {showLabel && <span className="text-sm">Theme</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        {options.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            className={cn(
              "flex items-center gap-2 text-sm",
              theme === opt.value && "bg-accent text-foreground",
            )}
          >
            {opt.icon}
            <span>{opt.label}</span>
            {theme === opt.value && <span className="ml-auto text-xs text-muted-foreground">Active</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ThemeToggle;
