import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Licenses from "./pages/Licenses";
import Downloads from "./pages/Downloads";
import AIAgent from "./pages/AIAgent";
import Admin from "./pages/Admin";

function ProtectedPage({ children, requiredRole }: { children: React.ReactNode; requiredRole?: "admin" }) {
  return <DashboardLayout requiredRole={requiredRole}>{children}</DashboardLayout>;
}

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/painel"}><ProtectedPage><Dashboard /></ProtectedPage></Route>
      <Route path={"/licenca"}><ProtectedPage><Licenses /></ProtectedPage></Route>
      <Route path={"/downloads"}><ProtectedPage><Downloads /></ProtectedPage></Route>
      <Route path={"/agentes"}><ProtectedPage><AIAgent /></ProtectedPage></Route>
      <Route path={"/admin"}><ProtectedPage requiredRole="admin"><Admin /></ProtectedPage></Route>
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="dark"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
