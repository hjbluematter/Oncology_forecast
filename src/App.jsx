import { ForecastProvider, useForecast } from "./store/forecastStore";
import Dashboard from "./components/Dashboard";
import NewModelWizard from "./components/NewModelWizard";
import ModelDetail from "./components/ModelDetail";
import ModelSelector from "./components/PortfolioAggregation/ModelSelector";
import PortfolioPage from "./components/PortfolioAggregation/PortfolioPage";

function AppRouter() {
  const { view } = useForecast();
  if (view === "new-model")         return <NewModelWizard />;
  if (view === "model-detail")      return <ModelDetail />;
  if (view === "portfolio-select")  return <ModelSelector />;
  if (view === "portfolio")         return <PortfolioPage />;
  return <Dashboard />;
}

export default function App() {
  return (
    <ForecastProvider>
      <AppRouter />
    </ForecastProvider>
  );
}
