import { AuthProvider, useAuth } from "./store/authStore";
import { ForecastProvider, useForecast } from "./store/forecastStore";
import Dashboard           from "./components/Dashboard";
import NewModelWizard      from "./components/NewModelWizard";
import ModelDetail         from "./components/ModelDetail";
import ModelSelector       from "./components/PortfolioAggregation/ModelSelector";
import PortfolioPage       from "./components/PortfolioAggregation/PortfolioPage";
import LoginScreen         from "./components/auth/LoginScreen";
import UserManagementPanel from "./components/admin/UserManagementPanel";

function AppRouter() {
  const { user, loading } = useAuth();
  const { view }          = useForecast();

  if (loading) return <Spinner />;
  if (!user)   return <LoginScreen />;

  if (view === "new-model")         return <NewModelWizard />;
  if (view === "model-detail")      return <ModelDetail />;
  if (view === "user-management")   return <UserManagementPanel />;
  if (view === "portfolio-select")  return <ModelSelector />;
  if (view === "portfolio")         return <PortfolioPage />;
  return <Dashboard />;
}

function Spinner() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ForecastProvider>
        <AppRouter />
      </ForecastProvider>
    </AuthProvider>
  );
}
