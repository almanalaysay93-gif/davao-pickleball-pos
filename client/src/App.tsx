import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import SiteLayout from "./components/SiteLayout";
import { BookingProvider } from "./contexts/BookingContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Courts from "./pages/Courts";
import Schedule from "./pages/Schedule";
import Book from "./pages/Book";
import Checkout from "./pages/Checkout";
import Confirmation from "./pages/Confirmation";
import Admin from "./pages/Admin";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/courts"} component={Courts} />
      <Route path={"/schedule"} component={Schedule} />
      <Route path={"/book"} component={Book} />
      <Route path={"/checkout"} component={Checkout} />
      <Route path={"/confirmation/:reference"} component={Confirmation} />
      <Route path={"/admin"} component={Admin} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster position="top-right" richColors />
          <BookingProvider>
            <SiteLayout>
              <Router />
            </SiteLayout>
          </BookingProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
