import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import CustomerLayout from "./components/CustomerLayout";
import OwnerLayout from "./components/OwnerLayout";
import { BookingProvider } from "./contexts/BookingContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Courts from "./pages/Courts";
import Schedule from "./pages/Schedule";
import Book from "./pages/Book";
import Checkout from "./pages/Checkout";
import Confirmation from "./pages/Confirmation";
import BookingPolicy from "./pages/BookingPolicy";
import MapPage from "./pages/Map";
import Admin from "./pages/Admin";
import MyBookings from "./pages/MyBookings";
import Owner from "./pages/Owner";
import CustomerLogin from "./pages/CustomerLogin";
import OwnerLogin from "./pages/OwnerLogin";

/** Customer-facing app shell: booking, courts, schedule, personal bookings. */
function CustomerApp() {
  return (
    <CustomerLayout>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/courts"} component={Courts} />
        <Route path={"/map"} component={MapPage} />
        <Route path={"/schedule"} component={Schedule} />
        <Route path={"/book"} component={Book} />
        <Route path={"/checkout"} component={Checkout} />
        <Route path={"/confirmation/:reference"} component={Confirmation} />
        <Route path={"/my-bookings"} component={MyBookings} />
        <Route path={"/booking-policy"} component={BookingPolicy} />
        <Route path={"/customer-login"} component={CustomerLogin} />
        <Route path={"/owner"}>{() => <Redirect to={"/owner-app"} />}</Route>
        <Route path={"/admin"}>{() => <Redirect to={"/owner-app/admin"} />}</Route>
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </CustomerLayout>
  );
}

/** Owner-facing app shell: venue management, bookings, announcements, admin. */
function OwnerApp() {
  return (
    <OwnerLayout>
      <Switch>
        <Route path={"/owner-app"} component={Owner} />
        <Route path={"/owner-app/bookings"} component={Owner} />
        <Route path={"/owner-app/announcements"} component={Owner} />
        <Route path={"/owner-app/admin"} component={Admin} />
        <Route component={NotFound} />
      </Switch>
    </OwnerLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path={"/owner-app/:rest*"}>{() => <OwnerApp />}</Route>
        <Route path={"/owner-login"}>{() => <OwnerLogin />}</Route>
        <Route path={"/owner-app"}>{() => <OwnerApp />}</Route>
        <Route>{() => <CustomerApp />}</Route>
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
            <Router />
          </BookingProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
