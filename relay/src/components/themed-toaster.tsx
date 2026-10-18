"use client";

import { Toaster } from "@/components/ui/sonner";
import { useTheme } from "./theme";

export function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster position="bottom-right" theme={theme} />;
}
