import { ThemeProvider } from "@/components/theme-provider";
import { CalculatorScreen } from "@/features/calculator/CalculatorScreen";

export const appName = "FX Calculator";

export default function App() {
  return (
    <ThemeProvider>
      <CalculatorScreen />
    </ThemeProvider>
  );
}
