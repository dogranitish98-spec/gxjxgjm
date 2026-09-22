import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      offset={16}
      toastOptions={{
        classNames: {
          toast:
            "bg-card text-card-foreground border border-border font-sans shadow-[var(--shadow-border)]",
          title: "text-foreground",
          description: "text-muted-foreground",
        },
      }}
    />
  );
}
