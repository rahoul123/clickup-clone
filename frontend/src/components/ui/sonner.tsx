import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">✓</span>,
        info: <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-bold text-white">i</span>,
        warning: <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">⚠</span>,
        error: <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">✕</span>,
      }}
      duration={4000}
      visibleToasts={5}
      toastOptions={{
        classNames: {
          toast:
            "group toast relative mb-[10px] w-full max-w-[320px] rounded-[14px] border border-white/10 bg-[#1e1e2e]/95 px-4 py-[14px] text-slate-100 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-[12px] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-l-[14px] before:bg-indigo-500 data-[type=success]:before:bg-emerald-500 data-[type=warning]:before:bg-amber-500 data-[type=error]:before:bg-rose-500 data-[state=open]:animate-in data-[state=open]:slide-in-from-right-6 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-6 data-[state=closed]:fade-out-0",
          title: "text-[14px] font-semibold leading-5 text-white",
          description: "mt-0.5 text-[12px] font-normal leading-4 text-[#9ca3af]",
          closeButton:
            "absolute right-2 top-2 rounded-md p-1 text-slate-500 hover:bg-white/10 hover:text-slate-300",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
